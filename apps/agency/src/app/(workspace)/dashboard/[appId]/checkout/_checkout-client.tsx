"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useServerAction } from "zsa-react";
import {
  CheckIcon,
  CreditCardIcon,
  Loader2Icon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";

import { createCheckoutSessionAction } from "@/actions/payment.action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ADDITIONAL_APPLICANT_PRICE_CENTS,
  CUSTOM_APPLICANT_PRICE_CENTS,
  FAMILY_BASE_APPLICANT_COUNT,
  FAMILY_PRICE_CENTS,
  SOLO_PRICE_CENTS,
} from "@/constants";
import { calculateAddLaterTotal, calculateCheckoutTotal, formatCents } from "@/lib/pricing";

interface PlanCard {
  name: string;
  applicants: string;
  price: string;
  notes: string;
  isRecommended?: boolean;
}

const FEATURES = [
  "Embassy-specific checklist generation",
  "Unlimited AI evaluations after checkout",
  "Cross-document red flag detection",
  "Atlas assistant grounded in your files",
  "Per-applicant readiness tracking",
];

const PLAN_CARDS: PlanCard[] = [
  {
    name: "Solo",
    applicants: "1 applicant",
    price: formatCents(SOLO_PRICE_CENTS),
    notes: "Best when preparing your own visa file.",
  },
  {
    name: "Family",
    applicants: `${FAMILY_BASE_APPLICANT_COUNT} applicants`,
    price: formatCents(FAMILY_PRICE_CENTS),
    notes: "Bundle pricing for couples and dependents.",
    isRecommended: true,
  },
  {
    name: "Enterprise",
    applicants: "High-volume teams",
    price: "Custom",
    notes: "Agency workflow and dedicated onboarding.",
  },
];

export function CheckoutClient({
  applicationId,
  applicationName,
}: {
  applicationId: string;
  applicationName: string;
}) {
  const [count, setCount] = useState(1);
  const { execute, isPending } = useServerAction(createCheckoutSessionAction);

  const total = useMemo(() => calculateCheckoutTotal(count), [count]);
  const addLaterTotal = useMemo(() => calculateAddLaterTotal(count), [count]);
  const savings = useMemo(() => addLaterTotal - total, [addLaterTotal, total]);

  const isFamilyBundle = count >= FAMILY_BASE_APPLICANT_COUNT;
  const extraBeyondFamily = Math.max(0, count - FAMILY_BASE_APPLICANT_COUNT);

  async function handleCheckout() {
    const [result, err] = await execute({
      applicationId,
      plan: "custom",
      applicantCount: count,
    });

    if (err) {
      toast.error(err.message ?? "Something went wrong. Please try again.");
      return;
    }

    window.location.href = result.url;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Application</p>
          <p className="truncate text-sm font-medium">{applicationName}</p>
        </div>
        <div className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
          One-time payment
        </div>
      </div>

      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList className="h-auto w-full justify-start rounded-xl border bg-muted/25 p-1">
          <TabsTrigger value="usage" className="rounded-lg">
            Usage
          </TabsTrigger>
          <TabsTrigger value="plans" className="rounded-lg">
            Plans
          </TabsTrigger>
          <TabsTrigger value="billing" className="rounded-lg">
            Billing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <Card className="shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Usage Snapshot</CardTitle>
                <CardDescription>Quick summary of what this purchase unlocks.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Selected Scope</p>
                    <UsersIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-lg font-semibold tabular-nums">
                    {count} applicant{count === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Includes checklist, evaluations, and Atlas access for each applicant.
                  </p>
                </div>

                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Bundle progress</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {Math.min(count, FAMILY_BASE_APPLICANT_COUNT)}/{FAMILY_BASE_APPLICANT_COUNT} applicants in family bundle
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {count < FAMILY_BASE_APPLICANT_COUNT
                      ? `${FAMILY_BASE_APPLICANT_COUNT - count} more to unlock the family base price.`
                      : "Family bundle pricing is active."}
                  </p>
                </div>

                <div className="rounded-xl border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Cost comparison</p>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Checkout now</span>
                    <span className="font-medium tabular-nums">{formatCents(total)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Add later total</span>
                    <span className="font-medium tabular-nums">{formatCents(addLaterTotal)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-primary/5 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Choose Applicant Count</CardTitle>
                <CardDescription>
                  Increase applicants here to lock in bundle discounts before checkout.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-primary/20 bg-background/85 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Total Today</p>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <p className="text-3xl font-semibold tabular-nums">{formatCents(total)}</p>
                    <p className="text-sm text-muted-foreground">{count} applicant{count === 1 ? "" : "s"}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border bg-background px-3 py-2.5">
                  <p className="text-sm font-medium">Applicants</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCount(Math.max(1, count - 1))}
                      disabled={count <= 1}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background transition-colors hover:bg-muted disabled:opacity-40"
                    >
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-2xl font-bold tabular-nums">{count}</span>
                    <button
                      type="button"
                      onClick={() => setCount(count + 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border bg-background transition-colors hover:bg-muted"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border bg-background px-4 py-3 text-sm">
                  {!isFamilyBundle ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Base (1 applicant)</span>
                        <span className="tabular-nums">{formatCents(SOLO_PRICE_CENTS)}</span>
                      </div>
                      {count > 1 ? (
                        <div className="flex justify-between text-muted-foreground">
                          <span>
                            {count - 1} additional × {formatCents(CUSTOM_APPLICANT_PRICE_CENTS)}
                          </span>
                          <span className="tabular-nums">
                            {formatCents((count - 1) * CUSTOM_APPLICANT_PRICE_CENTS)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Family bundle ({FAMILY_BASE_APPLICANT_COUNT} applicants)</span>
                        <span className="tabular-nums">{formatCents(FAMILY_PRICE_CENTS)}</span>
                      </div>
                      {extraBeyondFamily > 0 ? (
                        <div className="flex justify-between text-muted-foreground">
                          <span>
                            {extraBeyondFamily} additional × {formatCents(CUSTOM_APPLICANT_PRICE_CENTS)}
                          </span>
                          <span className="tabular-nums">
                            {formatCents(extraBeyondFamily * CUSTOM_APPLICANT_PRICE_CENTS)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}

                  <div className="mt-2 border-t border-border/60 pt-2.5 flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span className="text-lg tabular-nums">{formatCents(total)}</span>
                  </div>
                </div>

                {savings > 0 ? (
                  <p className="rounded-lg border border-status-success/30 bg-status-success/10 px-3 py-2 text-xs font-medium text-status-success">
                    Save {formatCents(savings)} compared to adding everyone later.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {PLAN_CARDS.map((plan) => (
              <Card
                key={plan.name}
                className={
                  plan.isRecommended
                    ? "border-primary/35 bg-primary/5 shadow-xs"
                    : "border-border/80 shadow-xs"
                }
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{plan.name}</span>
                    {plan.isRecommended ? (
                      <span className="rounded-full bg-primary px-2.5 py-1 text-2xs uppercase tracking-[0.15em] text-primary-foreground">
                        Recommended
                      </span>
                    ) : null}
                  </CardTitle>
                  <CardDescription>{plan.applicants}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-2xl font-semibold tabular-nums">{plan.price}</p>
                  <p className="text-xs text-muted-foreground">{plan.notes}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Included In Every Paid Application</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {FEATURES.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm">
                  <CheckIcon className="mt-0.5 h-4 w-4 text-primary" />
                  <span className="text-foreground/90">{feature}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <Card className="shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Billing Details</CardTitle>
              <CardDescription>Final payment happens on Stripe-hosted checkout.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Billing Email</p>
                <p className="mt-1 text-sm font-medium">Uses your account email during checkout</p>
              </div>

              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Payment Method</p>
                <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium">
                  <CreditCardIcon className="h-4 w-4" />
                  Card payment via Stripe
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-status-success/30 bg-status-success/10 px-3 py-2.5">
                <ShieldCheckIcon className="mt-0.5 h-4 w-4 text-status-success" />
                <p className="text-xs text-foreground/90">
                  Eligible-case guarantee applies when the full guidance workflow is followed and the case
                  outcome can be verified.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button size="lg" className="w-full text-base" onClick={handleCheckout} disabled={isPending}>
        {isPending ? (
          <>
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            Redirecting to payment…
          </>
        ) : (
          <>
            <LockIcon className="mr-2 h-4 w-4" />
            Unlock My Analysis — {formatCents(total)}
          </>
        )}
      </Button>

      <div className="grid gap-2 rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-2">
        <p className="inline-flex items-center gap-1.5">
          <CheckIcon className="h-3.5 w-3.5 text-primary" />
          No recurring subscription.
        </p>
        <p className="inline-flex items-center gap-1.5">
          <CheckIcon className="h-3.5 w-3.5 text-primary" />
          Add applicants later for {formatCents(ADDITIONAL_APPLICANT_PRICE_CENTS)} each.
        </p>
      </div>

      <div className="text-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Save for later
        </Link>
      </div>
    </div>
  );
}
