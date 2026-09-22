"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getDB } from "@/db";
import {
  paymentEventTable,
  PAYMENT_EVENT_STATUS,
  PAYMENT_EVENT_TYPE,
  PAYMENT_STATUS,
  userTable,
  visaApplicationTable,
} from "@/db/schema";
import { requireApplicationOwner } from "@/utils/application-auth";
import { refreshSessionCookieForCrossSiteRedirect } from "@/utils/auth";
import { getStripeClient } from "@/lib/stripe";
import {
  SITE_URL,
  SOLO_PRICE_CENTS,
  FAMILY_PRICE_CENTS,
  FAMILY_BASE_APPLICANT_COUNT,
  ADDITIONAL_APPLICANT_PRICE_CENTS,
} from "@/constants";
import { calculateCustomPlanPrice } from "@/lib/pricing";
import { isReusablePendingPaymentEvent } from "@/lib/payment-state";
import { getOrCreateStripeCustomerId } from "@/lib/stripe-customer";
import { logger } from "@/infra/logger";

function getForwardedHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

async function getCheckoutBaseUrl(): Promise<string> {
  const requestHeaders = await headers();

  const origin = requestHeaders.get("origin");
  if (origin) {
    return origin.replace(/\/$/, "");
  }

  const referer = requestHeaders.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin.replace(/\/$/, "");
    } catch {
      // Ignore malformed referer values and continue fallback chain.
    }
  }

  const proto = getForwardedHeaderValue(requestHeaders.get("x-forwarded-proto")) ?? "https";
  const host =
    getForwardedHeaderValue(requestHeaders.get("x-forwarded-host")) ??
    getForwardedHeaderValue(requestHeaders.get("host"));

  if (host) {
    return `${proto}://${host}`;
  }

  // Final fallback for non-request contexts.
  return SITE_URL;
}

async function getDataFastStripeMetadata(): Promise<{
  datafast_visitor_id: string | null;
  datafast_session_id: string | null;
}> {
  const cookieStore = await cookies();

  return {
    datafast_visitor_id: cookieStore.get("datafast_visitor_id")?.value ?? null,
    datafast_session_id: cookieStore.get("datafast_session_id")?.value ?? null,
  };
}

const PLAN_CONFIG = {
  solo: {
    name: "Vidicy — Solo",
    description: "1 applicant, unlimited AI evaluations, full checklist & Atlas chat",
    amount: SOLO_PRICE_CENTS,
    paidApplicantCount: 1,
  },
  family: {
    name: "Vidicy — Family",
    description: `Up to ${FAMILY_BASE_APPLICANT_COUNT} applicants, unlimited AI evaluations, full checklist & Atlas chat`,
    amount: FAMILY_PRICE_CENTS,
    paidApplicantCount: FAMILY_BASE_APPLICANT_COUNT,
  },
} as const;

function buildStripeIdempotencyKey(parts: string[]): string {
  return parts.join(":");
}

async function findReusablePendingPaymentEvent(applicationId: string, type: string) {
  const db = getDB();
  const existingEvent = await db.query.paymentEventTable.findFirst({
    where: and(
      eq(paymentEventTable.applicationId, applicationId),
      eq(paymentEventTable.type, type),
      eq(paymentEventTable.status, PAYMENT_EVENT_STATUS.PENDING),
    ),
    orderBy: [desc(paymentEventTable.createdAt)],
  });

  if (!existingEvent) return null;
  if (isReusablePendingPaymentEvent(existingEvent)) return existingEvent;

  await db
    .update(paymentEventTable)
    .set({ status: PAYMENT_EVENT_STATUS.EXPIRED, updatedAt: new Date() })
    .where(eq(paymentEventTable.id, existingEvent.id));

  return null;
}

async function createPaymentEventRecord(input: {
  applicationId: string;
  userId: string;
  type: (typeof PAYMENT_EVENT_TYPE)[keyof typeof PAYMENT_EVENT_TYPE];
  amount: number;
  seatDelta: number;
  targetPaidApplicantCount: number;
  plan?: string | null;
  stripeCheckoutSessionId: string;
  stripeCheckoutSessionUrl: string | null;
  stripeCheckoutSessionExpiresAt: Date | null;
}) {
  const db = getDB();

  try {
    const [paymentEvent] = await db
      .insert(paymentEventTable)
      .values({
        applicationId: input.applicationId,
        userId: input.userId,
        type: input.type,
        amount: input.amount,
        seatDelta: input.seatDelta,
        targetPaidApplicantCount: input.targetPaidApplicantCount,
        plan: input.plan ?? null,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        stripeCheckoutSessionUrl: input.stripeCheckoutSessionUrl,
        stripeCheckoutSessionExpiresAt: input.stripeCheckoutSessionExpiresAt,
      })
      .returning();

    return paymentEvent;
  } catch (err) {
    logger.warn("Payment event insert collided; reusing existing checkout session", {
      applicationId: input.applicationId,
      stripeCheckoutSessionId: input.stripeCheckoutSessionId,
      err,
    });

    return db.query.paymentEventTable.findFirst({
      where: eq(paymentEventTable.stripeCheckoutSessionId, input.stripeCheckoutSessionId),
    });
  }
}

async function getStripeCustomerIdForUser(input: {
  userId: string;
  email?: string | null;
  stripe: Awaited<ReturnType<typeof getStripeClient>>;
}) {
  const db = getDB();
  const user = await db.query.userTable.findFirst({
    where: eq(userTable.id, input.userId),
    columns: {
      stripeCustomerId: true,
      email: true,
    },
  });

  if (!user) {
    throw new ZSAError("NOT_FOUND", "User not found");
  }

  return getOrCreateStripeCustomerId({
    userId: input.userId,
    email: user.email ?? input.email,
    existingStripeCustomerId: user.stripeCustomerId,
    createStripeCustomer: (params, options) => input.stripe.customers.create(params, options),
    persistStripeCustomerId: async (stripeCustomerId) => {
      await db
        .update(userTable)
        .set({
          stripeCustomerId,
          updatedAt: new Date(),
        })
        .where(eq(userTable.id, input.userId));
    },
  });
}

// ---------------------------------------------------------------------------
// createCheckoutSessionAction
// Creates a Stripe Checkout Session and returns the redirect URL.
// ---------------------------------------------------------------------------

export const createCheckoutSessionAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
      plan: z.enum(["solo", "family", "custom"]),
      applicantCount: z.number().int().min(1).optional(),
    }),
  )
  .handler(async ({ input }) => {
    const { session } = await requireApplicationOwner(input.applicationId);
    await refreshSessionCookieForCrossSiteRedirect();
    const baseUrl = await getCheckoutBaseUrl();
    const datafastMetadata = await getDataFastStripeMetadata();

    const db = getDB();
    const app = await db.query.visaApplicationTable.findFirst({
      where: eq(visaApplicationTable.id, input.applicationId),
      columns: { paymentStatus: true, name: true },
    });

    if (!app) throw new ZSAError("NOT_FOUND", "Application not found");
    if (app.paymentStatus === PAYMENT_STATUS.PAID) {
      throw new ZSAError("CONFLICT", "This application is already paid for");
    }

    const reusableEvent = await findReusablePendingPaymentEvent(
      input.applicationId,
      PAYMENT_EVENT_TYPE.INITIAL_PURCHASE,
    );
    if (reusableEvent?.stripeCheckoutSessionUrl) {
      return { url: reusableEvent.stripeCheckoutSessionUrl };
    }

    let productName: string;
    let productDescription: string;
    let amount: number;
    let paidApplicantCount: number;
    let plan: string = input.plan;

    if (input.plan === "custom") {
      if (!input.applicantCount || input.applicantCount < 1) {
        throw new ZSAError("PRECONDITION_FAILED", "Custom plan requires an applicant count");
      }
      const custom = calculateCustomPlanPrice({ applicantCount: input.applicantCount });
      productName = `Vidicy — Custom (${input.applicantCount} people)`;
      productDescription = `${app.name} — ${custom.description}`;
      amount = custom.amount;
      paidApplicantCount = custom.paidApplicantCount;
      plan = custom.basePlan;
    } else {
      const planConfig = PLAN_CONFIG[input.plan];
      productName = planConfig.name;
      productDescription = `${app.name} — ${planConfig.description}`;
      amount = planConfig.amount;
      paidApplicantCount = planConfig.paidApplicantCount;
    }

    const stripe = await getStripeClient();
    const stripeCustomerId = await getStripeCustomerIdForUser({
      userId: session.userId,
      email: session.user.email,
      stripe,
    });
    const idempotencyKey = buildStripeIdempotencyKey([
      "checkout",
      "initial",
      input.applicationId,
      plan,
      String(paidApplicantCount),
    ]);

    const checkoutSession = await stripe.checkout.sessions.create(
      {
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: productName,
                description: productDescription,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${baseUrl}/dashboard/${input.applicationId}/payment-success`,
        cancel_url: `${baseUrl}/dashboard/${input.applicationId}/checkout`,
        payment_intent_data: {
          receipt_email: session.user.email ?? undefined,
        },
        metadata: {
          applicationId: input.applicationId,
          userId: session.userId,
          plan,
          paidApplicantCount: String(paidApplicantCount),
          seatDelta: String(paidApplicantCount),
          type: PAYMENT_EVENT_TYPE.INITIAL_PURCHASE,
          ...datafastMetadata,
        },
        customer: stripeCustomerId,
      },
      {
        idempotencyKey,
      },
    );

    const paymentEvent = await createPaymentEventRecord({
      applicationId: input.applicationId,
      userId: session.userId,
      type: PAYMENT_EVENT_TYPE.INITIAL_PURCHASE,
      amount,
      seatDelta: paidApplicantCount,
      targetPaidApplicantCount: paidApplicantCount,
      plan,
      stripeCheckoutSessionId: checkoutSession.id,
      stripeCheckoutSessionUrl: checkoutSession.url ?? null,
      stripeCheckoutSessionExpiresAt: checkoutSession.expires_at
        ? new Date(checkoutSession.expires_at * 1000)
        : null,
    });

    if (!checkoutSession.url && !paymentEvent?.stripeCheckoutSessionUrl) {
      throw new ZSAError("INTERNAL_SERVER_ERROR", "Failed to create checkout session");
    }

    return { url: checkoutSession.url ?? paymentEvent!.stripeCheckoutSessionUrl! };
  });

// ---------------------------------------------------------------------------
// createAdditionalApplicantCheckoutAction
// Creates a $40 Stripe Checkout Session for adding one more applicant.
// ---------------------------------------------------------------------------

export const createAdditionalApplicantCheckoutAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
    }),
  )
  .handler(async ({ input }) => {
    const { session } = await requireApplicationOwner(input.applicationId);
    await refreshSessionCookieForCrossSiteRedirect();
    const baseUrl = await getCheckoutBaseUrl();
    const datafastMetadata = await getDataFastStripeMetadata();

    const db = getDB();
    const app = await db.query.visaApplicationTable.findFirst({
      where: eq(visaApplicationTable.id, input.applicationId),
      columns: { paymentStatus: true, name: true, plan: true, paidApplicantCount: true },
    });

    if (!app) throw new ZSAError("NOT_FOUND", "Application not found");
    if (app.paymentStatus !== PAYMENT_STATUS.PAID) {
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Application must be paid before adding applicants",
      );
    }

    const reusableEvent = await findReusablePendingPaymentEvent(
      input.applicationId,
      PAYMENT_EVENT_TYPE.ADDITIONAL_APPLICANT,
    );
    if (reusableEvent?.stripeCheckoutSessionUrl) {
      return { url: reusableEvent.stripeCheckoutSessionUrl };
    }

    const targetPaidApplicantCount = (app.paidApplicantCount ?? 1) + 1;

    const stripe = await getStripeClient();
    const stripeCustomerId = await getStripeCustomerIdForUser({
      userId: session.userId,
      email: session.user.email,
      stripe,
    });
    const idempotencyKey = buildStripeIdempotencyKey([
      "checkout",
      "seat",
      input.applicationId,
      String(app.paidApplicantCount ?? 0),
    ]);

    const checkoutSession = await stripe.checkout.sessions.create(
      {
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Additional Applicant",
                description: `${app.name} — Add 1 more applicant to your ${app.plan ?? "solo"} plan`,
              },
              unit_amount: ADDITIONAL_APPLICANT_PRICE_CENTS,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${baseUrl}/dashboard/${input.applicationId}/members?added=true`,
        cancel_url: `${baseUrl}/dashboard/${input.applicationId}/members`,
        payment_intent_data: {
          receipt_email: session.user.email ?? undefined,
        },
        metadata: {
          applicationId: input.applicationId,
          userId: session.userId,
          seatDelta: "1",
          targetPaidApplicantCount: String(targetPaidApplicantCount),
          type: PAYMENT_EVENT_TYPE.ADDITIONAL_APPLICANT,
          ...datafastMetadata,
        },
        customer: stripeCustomerId,
      },
      {
        idempotencyKey,
      },
    );

    const paymentEvent = await createPaymentEventRecord({
      applicationId: input.applicationId,
      userId: session.userId,
      type: PAYMENT_EVENT_TYPE.ADDITIONAL_APPLICANT,
      amount: ADDITIONAL_APPLICANT_PRICE_CENTS,
      seatDelta: 1,
      targetPaidApplicantCount,
      plan: app.plan ?? null,
      stripeCheckoutSessionId: checkoutSession.id,
      stripeCheckoutSessionUrl: checkoutSession.url ?? null,
      stripeCheckoutSessionExpiresAt: checkoutSession.expires_at
        ? new Date(checkoutSession.expires_at * 1000)
        : null,
    });

    if (!checkoutSession.url && !paymentEvent?.stripeCheckoutSessionUrl) {
      throw new ZSAError("INTERNAL_SERVER_ERROR", "Failed to create checkout session");
    }

    return { url: checkoutSession.url ?? paymentEvent!.stripeCheckoutSessionUrl! };
  });
