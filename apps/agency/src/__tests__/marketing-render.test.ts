import { describe, expect, it } from "vitest";

import { renderLifecycleEmail } from "@/server/marketing/render";

describe("renderLifecycleEmail", () => {
  it("switches onboarding atlas messaging based on uploaded-document state", () => {
    const uploaded = renderLifecycleEmail({
      sequence: "onboarding",
      stepKey: "atlas_feature_highlight",
      firstName: "Tajwar",
      applicationId: "vapp_123",
      lifecycleState: {
        latestApplicationId: "vapp_123",
        hasApplication: true,
        hasUploadedDocuments: true,
        hasEvaluation: false,
        hasPaid: false,
        riskLevel: null,
      },
    });

    const notUploaded = renderLifecycleEmail({
      sequence: "onboarding",
      stepKey: "atlas_feature_highlight",
      firstName: "Tajwar",
      applicationId: "vapp_123",
      lifecycleState: {
        latestApplicationId: "vapp_123",
        hasApplication: true,
        hasUploadedDocuments: false,
        hasEvaluation: false,
        hasPaid: false,
        riskLevel: null,
      },
    });

    expect(uploaded.subject).toContain("Meet Atlas");
    expect(uploaded.text).toContain("/dashboard/vapp_123/atlas");
    expect(notUploaded.text).toContain("/dashboard/vapp_123/checklist");
  });

  it("branches the post-purchase nudges based on upload and evaluation progress", () => {
    const uploadNudge = renderLifecycleEmail({
      sequence: "post_purchase",
      stepKey: "upload_or_evaluate_nudge",
      firstName: "Tajwar",
      applicationId: "vapp_123",
      lifecycleState: {
        applicationId: "vapp_123",
        hasUploadedDocuments: false,
        hasEvaluation: false,
        hasPaid: true,
        riskLevel: null,
      },
    });

    const evalNudge = renderLifecycleEmail({
      sequence: "post_purchase",
      stepKey: "upload_or_evaluate_nudge",
      firstName: "Tajwar",
      applicationId: "vapp_123",
      lifecycleState: {
        applicationId: "vapp_123",
        hasUploadedDocuments: true,
        hasEvaluation: false,
        hasPaid: true,
        riskLevel: null,
      },
    });

    expect(uploadNudge.subject).toContain("visa review is waiting");
    expect(uploadNudge.text).toContain("/dashboard/vapp_123/checklist");
    expect(evalNudge.subject).toContain("documents are uploaded");
    expect(evalNudge.text).toContain("/dashboard/vapp_123/evaluation");
  });

  it("includes the comeback offer in later win-back emails", () => {
    const comebackOffer = renderLifecycleEmail({
      sequence: "winback",
      stepKey: "discount_offer",
      firstName: "Tajwar",
      lifecycleState: {
        latestApplicationId: null,
        hasApplication: false,
        hasUploadedDocuments: false,
        hasEvaluation: false,
        hasPaid: false,
        riskLevel: null,
      },
      now: new Date("2026-09-26T00:00:00.000Z"),
    });

    expect(comebackOffer.subject).toContain("20% off");
    expect(comebackOffer.text).toContain("COMEBACK20");
    expect(comebackOffer.text).toContain("March");
  });
});
