import { describe, expect, it, vi } from "vitest";

import { MARKETING_SEQUENCE, RISK_LEVEL } from "@/db/schema";
import {
  claimEnrollmentForProcessing,
  getLifecycleExitReason,
  shouldSkipLifecycleStep,
} from "@/server/marketing/enrollment";

describe("lifecycle enrollment branching", () => {
  it("skips onboarding checklist nudges after an application already exists", () => {
    expect(shouldSkipLifecycleStep({
      sequence: MARKETING_SEQUENCE.ONBOARDING,
      stepKey: "quick_win_checklist",
      lifecycleState: {
        hasApplication: true,
        hasUploadedDocuments: false,
        hasEvaluation: false,
        hasPaid: false,
        latestApplicationId: "vapp_123",
        riskLevel: null,
      },
    })).toBe(true);
  });

  it("exits onboarding and win-back once the user has paid", () => {
    expect(getLifecycleExitReason({
      sequence: MARKETING_SEQUENCE.ONBOARDING,
      lifecycleState: {
        hasPaid: true,
        hasApplication: true,
        hasUploadedDocuments: true,
        hasEvaluation: true,
        latestApplicationId: "vapp_123",
        riskLevel: RISK_LEVEL.MEDIUM,
      },
    })).toBe("purchased");

    expect(getLifecycleExitReason({
      sequence: MARKETING_SEQUENCE.WINBACK,
      lifecycleState: {
        hasPaid: true,
        hasApplication: true,
        hasUploadedDocuments: false,
        hasEvaluation: false,
        latestApplicationId: "vapp_123",
        riskLevel: null,
      },
    })).toBe("purchased");
  });

  it("exits post-purchase once the application reaches low risk", () => {
    expect(getLifecycleExitReason({
      sequence: MARKETING_SEQUENCE.POST_PURCHASE,
      lifecycleState: {
        applicationId: "vapp_123",
        hasPaid: true,
        hasUploadedDocuments: true,
        hasEvaluation: true,
        riskLevel: RISK_LEVEL.LOW,
      },
    })).toBe("low_risk_achieved");
  });
});

describe("claimEnrollmentForProcessing", () => {
  it("returns false when another worker already moved the lease window", async () => {
    type ClaimDb = Parameters<typeof claimEnrollmentForProcessing>[0]["db"];
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    const claimed = await claimEnrollmentForProcessing({
      db: { update } as unknown as ClaimDb,
      enrollmentId: "mseq_123",
      now: new Date("2026-09-26T00:00:00.000Z"),
    });

    expect(claimed).toBe(false);
  });
});
