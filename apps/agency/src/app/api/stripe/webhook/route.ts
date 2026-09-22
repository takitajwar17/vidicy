import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

const HANDLED_EVENT_TYPES = new Set<string>([
  "checkout.session.completed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
]);

async function loadWebhookDeps() {
  const [
    drizzleOrm,
    dbModule,
    schemaModule,
    loggerModule,
    marketingEventModule,
    marketingSchedulerModule,
    stripeModule,
    paymentStateModule,
  ] = await Promise.all([
    import("drizzle-orm"),
    import("@/db"),
    import("@/db/schema"),
    import("@/infra/logger"),
    import("@/server/marketing/events"),
    import("@/server/marketing/scheduler"),
    import("@/lib/stripe"),
    import("@/lib/payment-state"),
  ]);

  return {
    and: drizzleOrm.and,
    eq: drizzleOrm.eq,
    getDB: dbModule.getDB,
    paymentEventTable: schemaModule.paymentEventTable,
    PAYMENT_EVENT_STATUS: schemaModule.PAYMENT_EVENT_STATUS,
    PAYMENT_EVENT_TYPE: schemaModule.PAYMENT_EVENT_TYPE,
    PAYMENT_STATUS: schemaModule.PAYMENT_STATUS,
    MARKETING_EVENT_TYPE: schemaModule.MARKETING_EVENT_TYPE,
    visaApplicationTable: schemaModule.visaApplicationTable,
    logger: loggerModule.logger,
    recordMarketingEvent: marketingEventModule.recordMarketingEvent,
    runMarketingLifecyclePass: marketingSchedulerModule.runMarketingLifecyclePass,
    getStripeClient: stripeModule.getStripeClient,
    getApplicationUpdateForCompletedPaymentEvent:
      paymentStateModule.getApplicationUpdateForCompletedPaymentEvent,
    getApplicationUpdateForRefundedPaymentEvent:
      paymentStateModule.getApplicationUpdateForRefundedPaymentEvent,
  };
}

function extractPaymentIntentId(pi: Stripe.Checkout.Session["payment_intent"] | Stripe.Charge["payment_intent"]): string | null {
  if (typeof pi === "string") return pi;
  if (pi && typeof pi === "object" && "id" in pi) return pi.id;
  return null;
}

function normalizeLegacyPlan(plan: string | null, paidApplicantCount: number): string | null {
  if (plan !== "custom") return plan;
  return paidApplicantCount >= 4 ? "family" : "solo";
}

async function fulfillTrackedCheckoutSession(
  deps: Awaited<ReturnType<typeof loadWebhookDeps>>,
  db: ReturnType<Awaited<ReturnType<typeof loadWebhookDeps>>["getDB"]>,
  stripeSession: Stripe.Checkout.Session,
) {
  const {
    eq,
    logger,
    paymentEventTable,
    PAYMENT_EVENT_STATUS,
    PAYMENT_EVENT_TYPE,
    MARKETING_EVENT_TYPE,
    recordMarketingEvent,
    runMarketingLifecyclePass,
    visaApplicationTable,
    getApplicationUpdateForCompletedPaymentEvent,
  } = deps;
  const paymentIntentId = extractPaymentIntentId(stripeSession.payment_intent);
  const paymentEvent = await db.query.paymentEventTable.findFirst({
    where: eq(paymentEventTable.stripeCheckoutSessionId, stripeSession.id),
  });

  if (!paymentEvent) {
    return null;
  }

  if (paymentEvent.status === PAYMENT_EVENT_STATUS.COMPLETED || paymentEvent.status === PAYMENT_EVENT_STATUS.REFUNDED) {
    logger.info("Duplicate webhook for tracked payment event", {
      paymentEventId: paymentEvent.id,
      stripeSessionId: stripeSession.id,
      status: paymentEvent.status,
    });
    return NextResponse.json({ received: true });
  }

  const app = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, paymentEvent.applicationId),
    columns: {
      id: true,
      paidApplicantCount: true,
      paymentStatus: true,
    },
  });

  if (!app) {
    logger.warn("Tracked payment event references missing application", {
      paymentEventId: paymentEvent.id,
      applicationId: paymentEvent.applicationId,
    });
    return NextResponse.json({ received: true });
  }

  const applicationUpdate = getApplicationUpdateForCompletedPaymentEvent({
    eventType: paymentEvent.type,
    seatDelta: paymentEvent.seatDelta,
    targetPaidApplicantCount: paymentEvent.targetPaidApplicantCount,
    currentPaidApplicantCount: app.paidApplicantCount,
    paymentIntentId,
    plan: paymentEvent.plan,
    paidApplicantCount: paymentEvent.targetPaidApplicantCount,
  });

  try {
    await db
      .update(visaApplicationTable)
      .set(applicationUpdate)
      .where(eq(visaApplicationTable.id, paymentEvent.applicationId));

    await db
      .update(paymentEventTable)
      .set({
        status: PAYMENT_EVENT_STATUS.COMPLETED,
        stripePaymentIntentId: paymentIntentId,
        updatedAt: new Date(),
      })
      .where(eq(paymentEventTable.id, paymentEvent.id));

    if (paymentEvent.type === PAYMENT_EVENT_TYPE.INITIAL_PURCHASE) {
      await recordMarketingEvent({
        db,
        type: MARKETING_EVENT_TYPE.PAYMENT_COMPLETED,
        userId: paymentEvent.userId,
        applicationId: paymentEvent.applicationId,
        payload: {
          paymentEventId: paymentEvent.id,
          stripeSessionId: stripeSession.id,
        },
      });

      try {
        await runMarketingLifecyclePass({ db });
      } catch (marketingError) {
        logger.error("Failed to run immediate post-purchase lifecycle pass", {
          paymentEventId: paymentEvent.id,
          applicationId: paymentEvent.applicationId,
          marketingError,
        });
      }
    }
  } catch (err) {
    logger.error("Failed to fulfill tracked checkout session", {
      paymentEventId: paymentEvent.id,
      applicationId: paymentEvent.applicationId,
      err,
    });
    return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  }

  logger.info("Tracked payment completed", {
    paymentEventId: paymentEvent.id,
    applicationId: paymentEvent.applicationId,
    type: paymentEvent.type,
    stripeSessionId: stripeSession.id,
  });

  return NextResponse.json({ received: true });
}

async function fulfillLegacyCheckoutSession(
  deps: Awaited<ReturnType<typeof loadWebhookDeps>>,
  db: ReturnType<Awaited<ReturnType<typeof loadWebhookDeps>>["getDB"]>,
  stripeSession: Stripe.Checkout.Session,
) {
  const {
    and,
    eq,
    logger,
    PAYMENT_EVENT_TYPE,
    PAYMENT_STATUS,
    MARKETING_EVENT_TYPE,
    recordMarketingEvent,
    runMarketingLifecyclePass,
    visaApplicationTable,
    getApplicationUpdateForCompletedPaymentEvent,
  } = deps;
  const metadata = stripeSession.metadata ?? {};
  const applicationId = metadata.applicationId;

  if (!applicationId) {
    logger.warn("Stripe webhook missing applicationId in legacy session metadata", {
      stripeSessionId: stripeSession.id,
    });
    return NextResponse.json({ received: true });
  }

  const app = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, applicationId),
    columns: {
      id: true,
      userId: true,
      paidApplicantCount: true,
      paymentStatus: true,
    },
  });

  if (!app) {
    logger.warn("Legacy checkout session references missing application", {
      applicationId,
      stripeSessionId: stripeSession.id,
    });
    return NextResponse.json({ received: true });
  }

  const type = metadata.type ?? PAYMENT_EVENT_TYPE.INITIAL_PURCHASE;
  const paymentIntentId = extractPaymentIntentId(stripeSession.payment_intent);

  if (type === PAYMENT_EVENT_TYPE.ADDITIONAL_APPLICANT) {
    const targetPaidApplicantCount = parseInt(
      metadata.targetPaidApplicantCount ?? metadata.newPaidApplicantCount ?? String(app.paidApplicantCount + 1),
      10,
    );

    try {
      await db
        .update(visaApplicationTable)
        .set(getApplicationUpdateForCompletedPaymentEvent({
          eventType: PAYMENT_EVENT_TYPE.ADDITIONAL_APPLICANT,
          seatDelta: 1,
          targetPaidApplicantCount,
          currentPaidApplicantCount: app.paidApplicantCount,
        }))
        .where(eq(visaApplicationTable.id, applicationId));
    } catch (err) {
      logger.error("Failed to fulfill legacy additional-applicant payment", {
        applicationId,
        stripeSessionId: stripeSession.id,
        err,
      });
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    logger.info("Legacy additional applicant payment completed", {
      applicationId,
      stripeSessionId: stripeSession.id,
      targetPaidApplicantCount,
    });
    return NextResponse.json({ received: true });
  }

  const paidApplicantCount = parseInt(metadata.paidApplicantCount ?? "1", 10);
  const plan = normalizeLegacyPlan(metadata.plan ?? null, paidApplicantCount);

  try {
    await db
      .update(visaApplicationTable)
      .set(getApplicationUpdateForCompletedPaymentEvent({
        eventType: PAYMENT_EVENT_TYPE.INITIAL_PURCHASE,
        seatDelta: paidApplicantCount,
        targetPaidApplicantCount: paidApplicantCount,
        currentPaidApplicantCount: app.paidApplicantCount,
        paymentIntentId,
        plan,
        paidApplicantCount,
      }))
      .where(and(
        eq(visaApplicationTable.id, applicationId),
        eq(visaApplicationTable.paymentStatus, PAYMENT_STATUS.UNPAID),
      ));

    await recordMarketingEvent({
      db,
      type: MARKETING_EVENT_TYPE.PAYMENT_COMPLETED,
      userId: metadata.userId ?? app.userId,
      applicationId,
      payload: {
        stripeSessionId: stripeSession.id,
        plan,
      },
    });

    try {
      await runMarketingLifecyclePass({ db });
    } catch (marketingError) {
      logger.error("Failed to run immediate legacy post-purchase lifecycle pass", {
        applicationId,
        stripeSessionId: stripeSession.id,
        marketingError,
      });
    }
  } catch (err) {
    logger.error("Failed to fulfill legacy initial checkout session", {
      applicationId,
      stripeSessionId: stripeSession.id,
      err,
    });
    return NextResponse.json({ error: "DB update failed" }, { status: 500 });
  }

  logger.info("Legacy initial payment completed", {
    applicationId,
    stripeSessionId: stripeSession.id,
    paidApplicantCount,
    plan,
  });
  return NextResponse.json({ received: true });
}

async function fulfillCheckoutSession(
  deps: Awaited<ReturnType<typeof loadWebhookDeps>>,
  db: ReturnType<Awaited<ReturnType<typeof loadWebhookDeps>>["getDB"]>,
  stripeSession: Stripe.Checkout.Session,
) {
  const trackedResponse = await fulfillTrackedCheckoutSession(deps, db, stripeSession);
  if (trackedResponse) return trackedResponse;
  return fulfillLegacyCheckoutSession(deps, db, stripeSession);
}

async function expireCheckoutSession(
  deps: Awaited<ReturnType<typeof loadWebhookDeps>>,
  db: ReturnType<Awaited<ReturnType<typeof loadWebhookDeps>>["getDB"]>,
  stripeSession: Stripe.Checkout.Session,
) {
  const { and, eq, paymentEventTable, PAYMENT_EVENT_STATUS } = deps;
  await db
    .update(paymentEventTable)
    .set({ status: PAYMENT_EVENT_STATUS.EXPIRED, updatedAt: new Date() })
    .where(and(
      eq(paymentEventTable.stripeCheckoutSessionId, stripeSession.id),
      eq(paymentEventTable.status, PAYMENT_EVENT_STATUS.PENDING),
    ));
}

async function processRefund(
  deps: Awaited<ReturnType<typeof loadWebhookDeps>>,
  db: ReturnType<Awaited<ReturnType<typeof loadWebhookDeps>>["getDB"]>,
  charge: Stripe.Charge,
) {
  const {
    eq,
    logger,
    paymentEventTable,
    PAYMENT_EVENT_STATUS,
    PAYMENT_STATUS,
    visaApplicationTable,
    getApplicationUpdateForRefundedPaymentEvent,
  } = deps;
  const paymentIntentId = extractPaymentIntentId(charge.payment_intent);
  if (!paymentIntentId) {
    logger.warn("Refund webhook missing paymentIntentId", { chargeId: charge.id });
    return NextResponse.json({ received: true });
  }

  if (!charge.refunded && charge.amount_refunded < charge.amount) {
    logger.warn("Partial refund received; manual review required", {
      chargeId: charge.id,
      paymentIntentId,
      amount: charge.amount,
      amountRefunded: charge.amount_refunded,
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  const paymentEvent = await db.query.paymentEventTable.findFirst({
    where: eq(paymentEventTable.stripePaymentIntentId, paymentIntentId),
  });

  if (!paymentEvent) {
    try {
      await db
        .update(visaApplicationTable)
        .set({
          paymentStatus: PAYMENT_STATUS.UNPAID,
          paidApplicantCount: 0,
          plan: null,
          stripePaymentIntentId: null,
          updatedAt: new Date(),
        })
        .where(eq(visaApplicationTable.stripePaymentIntentId, paymentIntentId));
    } catch (err) {
      logger.error("Failed to process legacy refund", { paymentIntentId, err });
      return NextResponse.json({ error: "Refund processing failed" }, { status: 500 });
    }

    logger.info("Legacy refund processed", { paymentIntentId, chargeId: charge.id });
    return NextResponse.json({ received: true });
  }

  if (paymentEvent.status === PAYMENT_EVENT_STATUS.REFUNDED) {
    logger.info("Duplicate refund webhook for tracked payment event", {
      paymentEventId: paymentEvent.id,
      paymentIntentId,
    });
    return NextResponse.json({ received: true });
  }

  const app = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, paymentEvent.applicationId),
    columns: {
      id: true,
      paidApplicantCount: true,
    },
  });

  if (!app) {
    logger.warn("Refunded payment event references missing application", {
      paymentEventId: paymentEvent.id,
      applicationId: paymentEvent.applicationId,
    });
    return NextResponse.json({ received: true });
  }

  try {
    await db
      .update(visaApplicationTable)
      .set(getApplicationUpdateForRefundedPaymentEvent({
        eventType: paymentEvent.type,
        seatDelta: paymentEvent.seatDelta,
        currentPaidApplicantCount: app.paidApplicantCount,
      }))
      .where(eq(visaApplicationTable.id, paymentEvent.applicationId));

    await db
      .update(paymentEventTable)
      .set({
        status: PAYMENT_EVENT_STATUS.REFUNDED,
        updatedAt: new Date(),
      })
      .where(eq(paymentEventTable.id, paymentEvent.id));
  } catch (err) {
    logger.error("Failed to process tracked refund", {
      paymentEventId: paymentEvent.id,
      applicationId: paymentEvent.applicationId,
      err,
    });
    return NextResponse.json({ error: "Refund processing failed" }, { status: 500 });
  }

  logger.info("Tracked refund processed", {
    paymentEventId: paymentEvent.id,
    paymentIntentId,
    chargeId: charge.id,
  });
  return NextResponse.json({ received: true });
}

export async function POST(req: NextRequest) {
  const deps = await loadWebhookDeps();
  const { getDB, getStripeClient, logger } = deps;
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  const stripe = await getStripeClient();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", { err });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  if (event.type === "checkout.session.completed") {
    return fulfillCheckoutSession(deps, getDB(), event.data.object as Stripe.Checkout.Session);
  }

  if (event.type === "checkout.session.expired") {
    const stripeSession = event.data.object as Stripe.Checkout.Session;
    await expireCheckoutSession(deps, getDB(), stripeSession);
    logger.info("Checkout session expired", {
      stripeSessionId: stripeSession.id,
      applicationId: stripeSession.metadata?.applicationId,
      customerEmail: stripeSession.customer_email,
    });
    return NextResponse.json({ received: true });
  }

  if (event.type === "charge.refunded") {
    return processRefund(deps, getDB(), event.data.object as Stripe.Charge);
  }

  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
    logger.warn("Dispute created — manual review required", {
      disputeId: dispute.id,
      chargeId,
      amount: dispute.amount,
      reason: dispute.reason,
    });
  }

  return NextResponse.json({ received: true });
}
