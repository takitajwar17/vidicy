import { describe, expect, it } from "vitest";
import { calculateCheckoutTotal, calculateCustomPlanPrice, formatCents } from "@/lib/pricing";
import {
  FAMILY_BASE_APPLICANT_COUNT,
  FAMILY_PRICE_CENTS,
  CUSTOM_APPLICANT_PRICE_CENTS,
} from "@/constants";

describe("pricing", () => {
  it("supports custom-plan pricing for applicant counts above the old checkout cap", () => {
    const applicantCount = 80;
    const extras = applicantCount - FAMILY_BASE_APPLICANT_COUNT;

    expect(calculateCheckoutTotal(applicantCount)).toBe(
      FAMILY_PRICE_CENTS + extras * CUSTOM_APPLICANT_PRICE_CENTS,
    );

    expect(calculateCustomPlanPrice({ applicantCount })).toEqual({
      amount: FAMILY_PRICE_CENTS + extras * CUSTOM_APPLICANT_PRICE_CENTS,
      basePlan: "family",
      paidApplicantCount: applicantCount,
      description: "80 applicants, unlimited AI evaluations, full checklist & Atlas chat",
    });
  });

  it("formats cents as whole-dollar USD strings", () => {
    expect(formatCents(7900)).toBe("$79");
  });
});
