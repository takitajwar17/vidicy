import { PAYMENT_STATUS } from "@/db/schema";

export type PaymentEventType = "initial_purchase" | "additional_applicant";
export type PaymentEventStatus = "pending" | "completed" | "refunded" | "expired";

export function isReusablePendingPaymentEvent(event: {
  status: string;
  stripeCheckoutSessionUrl: string | null;
  stripeCheckoutSessionExpiresAt: Date | null;
}): boolean {
  if (event.status !== "pending") return false;
  if (!event.stripeCheckoutSessionUrl || !event.stripeCheckoutSessionExpiresAt) return false;
  return event.stripeCheckoutSessionExpiresAt.getTime() > Date.now();
}

export function getApplicationUpdateForCompletedPaymentEvent(input: {
  eventType: string;
  seatDelta: number;
  currentPaidApplicantCount: number;
  targetPaidApplicantCount?: number | null;
  paymentIntentId?: string | null;
  plan?: string | null;
  paidApplicantCount?: number | null;
}) {
  if (input.eventType === "additional_applicant") {
    return {
      paidApplicantCount: Math.max(
        input.currentPaidApplicantCount,
        input.targetPaidApplicantCount ?? (input.currentPaidApplicantCount + input.seatDelta),
      ),
      updatedAt: new Date(),
    };
  }

  return {
    paymentStatus: PAYMENT_STATUS.PAID,
    stripePaymentIntentId: input.paymentIntentId ?? null,
    paidApplicantCount: input.paidApplicantCount
      ?? input.targetPaidApplicantCount
      ?? Math.max(input.currentPaidApplicantCount, input.seatDelta),
    plan: input.plan ?? null,
    isFreeTrialApp: false,
    freeEvaluationUsed: false,
    updatedAt: new Date(),
  };
}

export function getApplicationUpdateForRefundedPaymentEvent(input: {
  eventType: string;
  seatDelta: number;
  currentPaidApplicantCount: number;
}) {
  if (input.eventType === "additional_applicant") {
    return {
      paidApplicantCount: Math.max(0, input.currentPaidApplicantCount - input.seatDelta),
      updatedAt: new Date(),
    };
  }

  return {
    paymentStatus: PAYMENT_STATUS.UNPAID,
    paidApplicantCount: 0,
    plan: null,
    stripePaymentIntentId: null,
    updatedAt: new Date(),
  };
}
