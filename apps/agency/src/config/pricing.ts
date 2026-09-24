import type { Route } from "next";

export interface PricingPlan {
  name: string;
  href: Route;
  price: string;
  originalPrice?: string;
  savingsBadge?: string;
  period: string;
  yearlyPrice: string;
  features: string[];
  description: string;
  buttonText: string;
  isPopular: boolean;
}

export const ADDITIONAL_PERSON_PRICE = "$40";
export const CUSTOM_PERSON_PRICE = "$35";

export const pricingPlans: PricingPlan[] = [
  {
    name: "SOLO",
    href: "/sign-up" as Route,
    price: "$79",
    period: "one-time",
    yearlyPrice: "$79",
    features: [
      "1 applicant (you)",
      "Embassy-specific document checklist",
      "Unlimited AI document evaluations",
      "Full red-flag & risk detection",
      "Readiness score + recommendations",
      "Atlas AI chat — ask anything",
      "Money-back guarantee*",
      `+${ADDITIONAL_PERSON_PRICE} for each additional person`,
    ],
    description:
      "Everything you need to prepare, review, and improve a strong single-applicant visa file.",
    buttonText: "Start My Application",
    isPopular: false,
  },
  {
    name: "FAMILY",
    href: "/sign-up" as Route,
    price: "$169",
    savingsBadge: "Save $30 vs adding later",
    period: "one-time",
    yearlyPrice: "$169",
    features: [
      "4 applicants (you + 3 people)",
      "Embassy-specific document checklist",
      "Unlimited AI document evaluations",
      "Full red-flag & risk detection",
      "Readiness score per applicant",
      "Atlas AI chat — ask anything",
      "Money-back guarantee*",
      `+${ADDITIONAL_PERSON_PRICE} for each additional person`,
    ],
    description:
      "One shared application workflow for the whole family with per-applicant scoring and review.",
    buttonText: "Start as a Family",
    isPopular: true,
  },
  {
    name: "ENTERPRISE",
    href: "/enterprise" as Route,
    price: "Custom",
    period: "one-time",
    yearlyPrice: "Custom",
    features: [
      "Unlimited applicants",
      "Bulk application management",
      "Dedicated account manager",
      "White-label portal option",
      "API access",
      "SLA & priority support",
      "Custom onboarding & training",
      "Money-back guarantee*",
    ],
    description:
      "For immigration agencies, consultancies, and high-volume teams that need shared review workflows.",
    buttonText: "Contact Us",
    isPopular: false,
  },
];
