type CreateStripeCustomer = (
  params: {
    email?: string;
    metadata: Record<string, string>;
  },
  options: {
    idempotencyKey: string;
  },
) => Promise<{ id: string }>;

export async function getOrCreateStripeCustomerId(input: {
  userId: string;
  email?: string | null;
  existingStripeCustomerId?: string | null;
  createStripeCustomer: CreateStripeCustomer;
  persistStripeCustomerId: (stripeCustomerId: string) => Promise<void>;
}): Promise<string> {
  if (input.existingStripeCustomerId) {
    return input.existingStripeCustomerId;
  }

  const customer = await input.createStripeCustomer({
    email: input.email ?? undefined,
    metadata: { userId: input.userId },
  }, {
    idempotencyKey: `stripe-customer:${input.userId}`,
  });

  await input.persistStripeCustomerId(customer.id);

  return customer.id;
}
