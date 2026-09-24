import { eq } from "drizzle-orm";
import type { getDB } from "@/db";

import {
  marketingContactTable,
  userTable,
} from "@/db/schema";

import {
  ensureResendTopic,
  type MarketingRuntimeEnv,
  updateResendContactTopics,
  upsertResendContact,
} from "./resend";

const TOPIC_CONFIG = {
  onboarding: "Product onboarding and activation emails",
  "post-purchase": "Paid customer success and follow-up emails",
  "win-back": "Re-engagement emails for inactive users",
} as const;

type Database = ReturnType<typeof getDB>;

export function getTopicSubscriptionsForSync(
  contact: {
    subscribedOnboarding: boolean;
    subscribedPostPurchase: boolean;
    subscribedWinback: boolean;
  },
  topicIds: {
    onboarding: string;
    "post-purchase": string;
    "win-back": string;
  },
) {
  const topicSubscriptions: Array<{ id: string; subscription: "opt_in" | "opt_out" }> = [];

  if (!contact.subscribedOnboarding) {
    topicSubscriptions.push({ id: topicIds.onboarding, subscription: "opt_out" });
  }

  if (!contact.subscribedPostPurchase) {
    topicSubscriptions.push({ id: topicIds["post-purchase"], subscription: "opt_out" });
  }

  if (!contact.subscribedWinback) {
    topicSubscriptions.push({ id: topicIds["win-back"], subscription: "opt_out" });
  }

  return topicSubscriptions;
}

export async function ensureMarketingContact(
  db: Database,
  userId: string,
) {
  const user = await db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
    columns: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!user?.email) {
    throw new Error(`User ${userId} does not have an email address`);
  }

  const existing = await db.query.marketingContactTable.findFirst({
    where: eq(marketingContactTable.userId, userId),
  });

  if (existing) {
    if (existing.email !== user.email) {
      await db
        .update(marketingContactTable)
        .set({
          email: user.email,
          updatedAt: new Date(),
        })
        .where(eq(marketingContactTable.id, existing.id));

      return { ...existing, email: user.email, firstName: user.firstName, lastName: user.lastName };
    }

    return { ...existing, firstName: user.firstName, lastName: user.lastName };
  }

  const [created] = await db
    .insert(marketingContactTable)
    .values({
      userId,
      email: user.email,
    })
    .returning();

  return { ...created, firstName: user.firstName, lastName: user.lastName };
}

export async function syncMarketingContactToResend(
  db: Database,
  env: MarketingRuntimeEnv | undefined,
  userId: string,
) {
  const contact = await ensureMarketingContact(db, userId);

  const resendContact = await upsertResendContact(env, {
    email: contact.email,
    firstName: contact.firstName,
    lastName: contact.lastName,
  });

  const [onboardingTopic, postPurchaseTopic, winbackTopic] = await Promise.all([
    ensureResendTopic(env, {
      name: "onboarding",
      description: TOPIC_CONFIG.onboarding,
    }),
    ensureResendTopic(env, {
      name: "post-purchase",
      description: TOPIC_CONFIG["post-purchase"],
    }),
    ensureResendTopic(env, {
      name: "win-back",
      description: TOPIC_CONFIG["win-back"],
    }),
  ]);

  const topicSubscriptions = getTopicSubscriptionsForSync(contact, {
    onboarding: onboardingTopic.id,
    "post-purchase": postPurchaseTopic.id,
    "win-back": winbackTopic.id,
  });

  await updateResendContactTopics(env, {
    email: contact.email,
    topicSubscriptions,
  });

  await db
    .update(marketingContactTable)
    .set({
      resendContactId: resendContact.id,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(marketingContactTable.userId, userId));

  return {
    ...contact,
    resendContactId: resendContact.id,
    lastSyncedAt: new Date(),
  };
}
