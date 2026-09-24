import { describe, expect, it } from "vitest";

import {
  getApplicationUpdateForCompletedPaymentEvent,
  getApplicationUpdateForRefundedPaymentEvent,
  isReusablePendingPaymentEvent,
} from "@/lib/payment-state";

describe("payment state helpers", () => {
  it("reuses a pending checkout session until it expires", () => {
    const future = new Date(Date.now() + 60_000);

    expect(isReusablePendingPaymentEvent({
      status: "pending",
      stripeCheckoutSessionUrl: "https://checkout.stripe.com/pay/cs_test_123",
      stripeCheckoutSessionExpiresAt: future,
    })).toBe(true);

    expect(isReusablePendingPaymentEvent({
      status: "pending",
      stripeCheckoutSessionUrl: "https://checkout.stripe.com/pay/cs_test_123",
      stripeCheckoutSessionExpiresAt: new Date(Date.now() - 1),
    })).toBe(false);
  });

  it("increments applicant seats from the current count for completed upsells", () => {
    expect(getApplicationUpdateForCompletedPaymentEvent({
      eventType: "additional_applicant",
      seatDelta: 1,
      currentPaidApplicantCount: 4,
    })).toEqual({
      paidApplicantCount: 5,
      updatedAt: expect.any(Date),
    });
  });

  it("resets access for refunded initial purchases", () => {
    expect(getApplicationUpdateForRefundedPaymentEvent({
      eventType: "initial_purchase",
      seatDelta: 3,
      currentPaidApplicantCount: 3,
    })).toEqual({
      paymentStatus: "unpaid",
      paidApplicantCount: 0,
      plan: null,
      stripePaymentIntentId: null,
      updatedAt: expect.any(Date),
    });
  });

  it("reverses only the purchased seat delta for refunded upsells", () => {
    expect(getApplicationUpdateForRefundedPaymentEvent({
      eventType: "additional_applicant",
      seatDelta: 1,
      currentPaidApplicantCount: 5,
    })).toEqual({
      paidApplicantCount: 4,
      updatedAt: expect.any(Date),
    });
  });
});
