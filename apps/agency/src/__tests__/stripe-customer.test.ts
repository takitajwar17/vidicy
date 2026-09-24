import { describe, expect, it, vi } from "vitest";

import { getOrCreateStripeCustomerId } from "@/lib/stripe-customer";

describe("getOrCreateStripeCustomerId", () => {
  it("reuses an existing Stripe customer id without creating a new customer", async () => {
    const createStripeCustomer = vi.fn();
    const persistStripeCustomerId = vi.fn();

    const customerId = await getOrCreateStripeCustomerId({
      userId: "usr_123",
      email: "owner@example.com",
      existingStripeCustomerId: "cus_existing",
      createStripeCustomer,
      persistStripeCustomerId,
    });

    expect(customerId).toBe("cus_existing");
    expect(createStripeCustomer).not.toHaveBeenCalled();
    expect(persistStripeCustomerId).not.toHaveBeenCalled();
  });

  it("creates and persists a Stripe customer the first time a user checks out", async () => {
    const createStripeCustomer = vi.fn(async () => ({ id: "cus_new" }));
    const persistStripeCustomerId = vi.fn(async () => undefined);

    const customerId = await getOrCreateStripeCustomerId({
      userId: "usr_123",
      email: "owner@example.com",
      existingStripeCustomerId: null,
      createStripeCustomer,
      persistStripeCustomerId,
    });

    expect(customerId).toBe("cus_new");
    expect(createStripeCustomer).toHaveBeenCalledWith({
      email: "owner@example.com",
      metadata: { userId: "usr_123" },
    }, {
      idempotencyKey: "stripe-customer:usr_123",
    });
    expect(persistStripeCustomerId).toHaveBeenCalledWith("cus_new");
  });
});
