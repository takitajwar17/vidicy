import "server-only";
import type Stripe from "stripe";

export async function getStripeClient(): Promise<Stripe> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  const { default: Stripe } = await import("stripe");
  return new Stripe(key, {
    apiVersion: "2026-02-25.clover",
    httpClient: Stripe.createFetchHttpClient(),
  });
}
