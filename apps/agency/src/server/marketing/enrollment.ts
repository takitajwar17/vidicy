import { and, eq, isNull, lte } from "drizzle-orm";

import { getDB } from "@/db";
import { logger } from "@/infra/logger";
import {
  MARKETING_ENROLLMENT_STATUS,
  MARKETING_EVENT_TYPE,
  MARKETING_SEND_STATUS,
  MARKETING_SEQUENCE,
  marketingEmailSendTable,
  marketingEventTable,
  marketingSequenceEnrollmentTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema";

import { syncMarketingContactToResend } from "./contact-sync";
import { recordMarketingEvent } from "./events";
import { renderLifecycleEmail } from "./render";
import {
  addContactToResendSegment,
  createAndSendLifecycleBroadcast,
  createResendSegment,
  type MarketingRuntimeEnv,
} from "./resend";
import { MARKETING_SEQUENCE_DEFINITIONS } from "./sequence-definitions";
import {
  type ApplicationLifecycleState,
  getLifecycleStateForApplication,
  getLifecycleStateForUser,
  type UserLifecycleState,
} from "./state";

type Database = ReturnType<typeof getDB>;

const RETRY_DELAY_MS = 15 * 60 * 1000;
const CLAIM_LEASE_MS = 5 * 60 * 1000;
type LifecycleState = UserLifecycleState | ApplicationLifecycleState;

async function createEnrollmentIfMissing(
  db: Database,
  {
    userId,
    sequence,
    enteredAt,
    applicationId = null,
  }: {
    userId: string;
    sequence: (typeof MARKETING_SEQUENCE)[keyof typeof MARKETING_SEQUENCE];
    enteredAt: Date;
    applicationId?: string | null;
  },
) {
  const existing = await db.query.marketingSequenceEnrollmentTable.findFirst({
    where: and(
      eq(marketingSequenceEnrollmentTable.userId, userId),
      eq(marketingSequenceEnrollmentTable.sequence, sequence),
      applicationId
        ? eq(marketingSequenceEnrollmentTable.applicationId, applicationId)
        : isNull(marketingSequenceEnrollmentTable.applicationId),
    ),
  });

  if (existing) {
    return existing;
  }

  const [firstStep] = MARKETING_SEQUENCE_DEFINITIONS[sequence];
  const [created] = await db
    .insert(marketingSequenceEnrollmentTable)
    .values({
      userId,
      applicationId,
      sequence,
      stepKey: firstStep.stepKey,
      status: MARKETING_ENROLLMENT_STATUS.ACTIVE,
      enteredAt,
      nextSendAt: new Date(enteredAt.getTime() + firstStep.delayMs),
    })
    .returning();

  return created;
}

async function userHasPayment(db: Database, userId: string) {
  const paymentEvent = await db.query.marketingEventTable.findFirst({
    where: and(
      eq(marketingEventTable.userId, userId),
      eq(marketingEventTable.type, MARKETING_EVENT_TYPE.PAYMENT_COMPLETED),
    ),
  });

  return Boolean(paymentEvent);
}

async function maybeCreateWinbackEnrollment(db: Database, userId: string, completedAt: Date) {
  const hasPayment = await userHasPayment(db, userId);

  if (hasPayment) {
    return null;
  }

  return createEnrollmentIfMissing(db, {
    userId,
    sequence: MARKETING_SEQUENCE.WINBACK,
    enteredAt: completedAt,
  });
}

async function exitEnrollment(
  db: Database,
  enrollmentId: string,
  exitReason: string,
) {
  await db
    .update(marketingSequenceEnrollmentTable)
    .set({
      status: MARKETING_ENROLLMENT_STATUS.EXITED,
      exitReason,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(marketingSequenceEnrollmentTable.id, enrollmentId));
}

export function getLifecycleExitReason({
  sequence,
  lifecycleState,
}: {
  sequence: (typeof MARKETING_SEQUENCE)[keyof typeof MARKETING_SEQUENCE];
  lifecycleState: LifecycleState;
}) {
  if (
    lifecycleState.hasPaid
    && (sequence === MARKETING_SEQUENCE.ONBOARDING || sequence === MARKETING_SEQUENCE.WINBACK)
  ) {
    return "purchased";
  }

  if (
    sequence === MARKETING_SEQUENCE.POST_PURCHASE
    && lifecycleState.riskLevel === "low"
  ) {
    return "low_risk_achieved";
  }

  return null;
}

export function shouldSkipLifecycleStep({
  sequence,
  stepKey,
  lifecycleState,
}: {
  sequence: (typeof MARKETING_SEQUENCE)[keyof typeof MARKETING_SEQUENCE];
  stepKey: string;
  lifecycleState: LifecycleState;
}) {
  return (
    sequence === MARKETING_SEQUENCE.ONBOARDING
    && stepKey === "quick_win_checklist"
    && "hasApplication" in lifecycleState
    && lifecycleState.hasApplication
  );
}

export async function claimEnrollmentForProcessing({
  db,
  enrollmentId,
  now,
}: {
  db: Database;
  enrollmentId: string;
  now: Date;
}) {
  const claimed = await db
    .update(marketingSequenceEnrollmentTable)
    .set({
      nextSendAt: new Date(now.getTime() + CLAIM_LEASE_MS),
      updatedAt: now,
    })
    .where(and(
      eq(marketingSequenceEnrollmentTable.id, enrollmentId),
      eq(marketingSequenceEnrollmentTable.status, MARKETING_ENROLLMENT_STATUS.ACTIVE),
      lte(marketingSequenceEnrollmentTable.nextSendAt, now),
    ))
    .returning({ id: marketingSequenceEnrollmentTable.id });

  return claimed.length > 0;
}

async function advanceEnrollment(
  db: Database,
  enrollment: typeof marketingSequenceEnrollmentTable.$inferSelect,
  now: Date,
  markSent: boolean,
) {
  const { next } = getNextStep(
    enrollment.sequence as (typeof MARKETING_SEQUENCE)[keyof typeof MARKETING_SEQUENCE],
    enrollment.stepKey,
  );

  if (next) {
    await db
      .update(marketingSequenceEnrollmentTable)
      .set({
        stepKey: next.stepKey,
        lastSentAt: markSent ? now : enrollment.lastSentAt,
        nextSendAt: new Date(enrollment.enteredAt.getTime() + next.delayMs),
        updatedAt: now,
      })
      .where(eq(marketingSequenceEnrollmentTable.id, enrollment.id));
    return { completed: false };
  }

  await db
    .update(marketingSequenceEnrollmentTable)
    .set({
      status: MARKETING_ENROLLMENT_STATUS.COMPLETED,
      lastSentAt: markSent ? now : enrollment.lastSentAt,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(marketingSequenceEnrollmentTable.id, enrollment.id));

  return { completed: true };
}

export async function syncEnrollmentsFromEvents(db: Database) {
  const verificationEvents = await db.query.marketingEventTable.findMany({
    where: eq(marketingEventTable.type, MARKETING_EVENT_TYPE.USER_VERIFIED_EMAIL),
    orderBy: (table, { asc }) => [asc(table.occurredAt)],
  });

  for (const event of verificationEvents) {
    await createEnrollmentIfMissing(db, {
      userId: event.userId,
      sequence: MARKETING_SEQUENCE.ONBOARDING,
      enteredAt: event.occurredAt,
    });
  }

  const paymentEvents = await db.query.marketingEventTable.findMany({
    where: eq(marketingEventTable.type, MARKETING_EVENT_TYPE.PAYMENT_COMPLETED),
    orderBy: (table, { asc }) => [asc(table.occurredAt)],
  });

  for (const event of paymentEvents) {
    await createEnrollmentIfMissing(db, {
      userId: event.userId,
      applicationId: event.applicationId,
      sequence: MARKETING_SEQUENCE.POST_PURCHASE,
      enteredAt: event.occurredAt,
    });
  }

  const completedOnboarding = await db.query.marketingSequenceEnrollmentTable.findMany({
    where: and(
      eq(marketingSequenceEnrollmentTable.sequence, MARKETING_SEQUENCE.ONBOARDING),
      eq(marketingSequenceEnrollmentTable.status, MARKETING_ENROLLMENT_STATUS.COMPLETED),
    ),
  });

  for (const enrollment of completedOnboarding) {
    if (!enrollment.completedAt) continue;
    await maybeCreateWinbackEnrollment(db, enrollment.userId, enrollment.completedAt);
  }
}

function getNextStep(
  sequence: (typeof MARKETING_SEQUENCE)[keyof typeof MARKETING_SEQUENCE],
  stepKey: string,
) {
  const steps = MARKETING_SEQUENCE_DEFINITIONS[sequence];
  const currentIndex = steps.findIndex((step) => step.stepKey === stepKey);

  if (currentIndex === -1) {
    throw new Error(`Unknown step "${stepKey}" for sequence "${sequence}"`);
  }

  return {
    current: steps[currentIndex],
    next: steps[currentIndex + 1] ?? null,
  };
}

function getSubscriptionStateForSequence(
  sequence: (typeof MARKETING_SEQUENCE)[keyof typeof MARKETING_SEQUENCE],
  contact: {
    subscribedOnboarding: boolean;
    subscribedPostPurchase: boolean;
    subscribedWinback: boolean;
  },
) {
  switch (sequence) {
    case MARKETING_SEQUENCE.ONBOARDING:
      return contact.subscribedOnboarding;
    case MARKETING_SEQUENCE.POST_PURCHASE:
      return contact.subscribedPostPurchase;
    case MARKETING_SEQUENCE.WINBACK:
      return contact.subscribedWinback;
  }
}

export async function processDueLifecycleEnrollments(
  db: Database,
  env: MarketingRuntimeEnv | undefined,
  now = new Date(),
) {
  const dueEnrollments = await db.query.marketingSequenceEnrollmentTable.findMany({
    where: and(
      eq(marketingSequenceEnrollmentTable.status, MARKETING_ENROLLMENT_STATUS.ACTIVE),
      lte(marketingSequenceEnrollmentTable.nextSendAt, now),
    ),
    orderBy: (table, { asc }) => [asc(table.nextSendAt)],
  });

  for (const enrollment of dueEnrollments) {
    const claimed = await claimEnrollmentForProcessing({
      db,
      enrollmentId: enrollment.id,
      now,
    });

    if (!claimed) {
      continue;
    }

    const sequence = enrollment.sequence as (typeof MARKETING_SEQUENCE)[keyof typeof MARKETING_SEQUENCE];
    const user = await db.query.userTable.findFirst({
      where: eq(userTable.id, enrollment.userId),
      columns: {
        id: true,
        firstName: true,
        email: true,
      },
    });

    if (!user?.email) {
      await exitEnrollment(db, enrollment.id, "missing_email");
      continue;
    }

    const syncedContact = await syncMarketingContactToResend(db, env, enrollment.userId);
    if (!getSubscriptionStateForSequence(sequence, syncedContact)) {
      await exitEnrollment(db, enrollment.id, "unsubscribed");
      continue;
    }

    const application = enrollment.applicationId
      ? await db.query.visaApplicationTable.findFirst({
          where: eq(visaApplicationTable.id, enrollment.applicationId),
          columns: {
            id: true,
          },
        })
      : null;

    const hasPurchased = await userHasPayment(db, enrollment.userId);
    const lifecycleState = enrollment.applicationId
      ? await getLifecycleStateForApplication({
          db,
          applicationId: enrollment.applicationId,
        })
      : await getLifecycleStateForUser(db, enrollment.userId);

    if (!enrollment.applicationId) {
      lifecycleState.hasPaid = lifecycleState.hasPaid || hasPurchased;
    }

    const exitReason = getLifecycleExitReason({
      sequence,
      lifecycleState,
    });

    if (exitReason) {
      await exitEnrollment(db, enrollment.id, exitReason);
      continue;
    }

    if (shouldSkipLifecycleStep({
      sequence,
      stepKey: enrollment.stepKey,
      lifecycleState,
    })) {
      await advanceEnrollment(db, enrollment, now, false);
      continue;
    }

    const { subject, text } = renderLifecycleEmail({
      sequence,
      stepKey: enrollment.stepKey,
      firstName: user.firstName || user.email,
      applicationId: application?.id ?? null,
      lifecycleState,
      now,
    });

    const sendName = `lifecycle_${sequence}_${enrollment.stepKey}_${enrollment.id}`;

    try {
      const segment = await createResendSegment(env, { name: sendName });
      await addContactToResendSegment(env, {
        email: user.email,
        segmentId: segment.id,
      });

      const broadcast = await createAndSendLifecycleBroadcast(env, {
        name: sendName,
        segmentId: segment.id,
        subject,
        text,
      });

      await db.insert(marketingEmailSendTable).values({
        enrollmentId: enrollment.id,
        sequence,
        stepKey: enrollment.stepKey,
        resendBroadcastId: broadcast.id,
        resendSegmentId: segment.id,
        status: MARKETING_SEND_STATUS.SENT,
        sentAt: now,
      });

      const { completed } = await advanceEnrollment(db, enrollment, now, true);

      if (completed && sequence === MARKETING_SEQUENCE.ONBOARDING) {
        await recordMarketingEvent({
          db,
          type: MARKETING_EVENT_TYPE.ONBOARDING_COMPLETED,
          userId: enrollment.userId,
        });
        await maybeCreateWinbackEnrollment(db, enrollment.userId, now);
      }
    } catch (error) {
      await db.insert(marketingEmailSendTable).values({
        enrollmentId: enrollment.id,
        sequence,
        stepKey: enrollment.stepKey,
        status: MARKETING_SEND_STATUS.FAILED,
      });

      await db
        .update(marketingSequenceEnrollmentTable)
        .set({
          nextSendAt: new Date(now.getTime() + RETRY_DELAY_MS),
          updatedAt: now,
        })
        .where(eq(marketingSequenceEnrollmentTable.id, enrollment.id));
      logger.error("Failed to process lifecycle enrollment", {
        enrollmentId: enrollment.id,
        sequence,
        stepKey: enrollment.stepKey,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
