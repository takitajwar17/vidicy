import { describe, expect, it } from "vitest";

import { getWorkflowStepStates } from "@/app/(workspace)/dashboard/[appId]/_workspace-types";

describe("getWorkflowStepStates", () => {
  it("blocks evaluation and Atlas until checklist prerequisites are met", () => {
    expect(
      getWorkflowStepStates({
        currentStep: "checklist",
        hasChecklist: false,
        missingRequiredCount: 0,
        hasEvaluation: false,
        isTrialLocked: false,
      }),
    ).toEqual({
      checklist: "current",
      evaluation: "blocked",
      chat: "blocked",
    });
  });

  it("marks evaluation as ready once required documents are uploaded", () => {
    expect(
      getWorkflowStepStates({
        currentStep: "checklist",
        hasChecklist: true,
        missingRequiredCount: 0,
        hasEvaluation: false,
        isTrialLocked: false,
      }),
    ).toEqual({
      checklist: "current",
      evaluation: "ready",
      chat: "blocked",
    });
  });

  it("locks Atlas for unpaid trial applications even after evaluation", () => {
    expect(
      getWorkflowStepStates({
        currentStep: "evaluation",
        hasChecklist: true,
        missingRequiredCount: 0,
        hasEvaluation: true,
        isTrialLocked: true,
      }),
    ).toEqual({
      checklist: "done",
      evaluation: "current",
      chat: "locked",
    });
  });
});
