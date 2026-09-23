import {
  SOLO_PRICE_CENTS,
  FAMILY_PRICE_CENTS,
  FAMILY_BASE_APPLICANT_COUNT,
  CUSTOM_APPLICANT_PRICE_CENTS,
  ADDITIONAL_APPLICANT_PRICE_CENTS,
} from "@/constants";

/** "$79" from 7900, "$35" from 3500, etc. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

/**
 * Upfront checkout total for `count` applicants.
 * Applies the family bundle automatically at FAMILY_BASE_APPLICANT_COUNT.
 * Uses CUSTOM_APPLICANT_PRICE_CENTS ($35) for extras — cheaper than post-purchase.
 */
export function calculateCheckoutTotal(count: number): number {
  if (count < FAMILY_BASE_APPLICANT_COUNT) {
    return SOLO_PRICE_CENTS + (count - 1) * CUSTOM_APPLICANT_PRICE_CENTS;
  }
  return FAMILY_PRICE_CENTS + (count - FAMILY_BASE_APPLICANT_COUNT) * CUSTOM_APPLICANT_PRICE_CENTS;
}

/**
 * Hypothetical total if all extras were added post-purchase at $40/person.
 * Used for "save X vs adding later" callout in the checkout UI.
 */
export function calculateAddLaterTotal(count: number): number {
  if (count < FAMILY_BASE_APPLICANT_COUNT) {
    return SOLO_PRICE_CENTS + (count - 1) * ADDITIONAL_APPLICANT_PRICE_CENTS;
  }
  return FAMILY_PRICE_CENTS + (count - FAMILY_BASE_APPLICANT_COUNT) * ADDITIONAL_APPLICANT_PRICE_CENTS;
}

/**
 * Server-side custom plan price for Stripe checkout.
 * Same formula as calculateCheckoutTotal but returns the full metadata shape
 * needed by createCheckoutSessionAction.
 */
export function calculateCustomPlanPrice({ applicantCount }: { applicantCount: number }): {
  amount: number;
  basePlan: "solo" | "family";
  paidApplicantCount: number;
  description: string;
} {
  if (applicantCount < 1) throw new Error("Applicant count must be at least 1");

  if (applicantCount < FAMILY_BASE_APPLICANT_COUNT) {
    const extras = applicantCount - 1;
    return {
      amount: SOLO_PRICE_CENTS + extras * CUSTOM_APPLICANT_PRICE_CENTS,
      basePlan: "solo",
      paidApplicantCount: applicantCount,
      description: `${applicantCount} applicant${applicantCount > 1 ? "s" : ""}, unlimited AI evaluations, full checklist & Atlas chat`,
    };
  }

  const extras = applicantCount - FAMILY_BASE_APPLICANT_COUNT;
  return {
    amount: FAMILY_PRICE_CENTS + extras * CUSTOM_APPLICANT_PRICE_CENTS,
    basePlan: "family",
    paidApplicantCount: applicantCount,
    description: `${applicantCount} applicants, unlimited AI evaluations, full checklist & Atlas chat`,
  };
}
