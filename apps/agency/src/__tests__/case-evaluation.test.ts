import { describe, expect, it, vi } from "vitest";
import {
  runCaseEvaluation,
  type EvaluationEvidence,
  type EvaluationChecklistItem,
} from "@/services/case-evaluation";

const documentResult = {
  status: "ok",
  score: 90,
  issues: [],
  strengths: ["Readable document"],
  feedback: "Complete document.",
  confidence: 95,
  confidenceReason: "Readable text",
  extractedFields: {
    holderName: "Test Applicant",
    expiryDate: null,
    documentNumber: null,
    issuingAuthority: "Test issuer",
    language: "en",
    dateRange: null,
  },
};

function fixture(count = 1) {
  const checklistItems: EvaluationChecklistItem[] = Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    documentName: "Passport",
    isRequired: true,
    description: "A valid passport",
    commonMistakes: null,
  }));
  const evidence: EvaluationEvidence = {
    docByChecklistItem: new Map(
      checklistItems.map((item) => [item.id, { id: `doc-${item.id}`, fileName: "passport.pdf" }]),
    ),
    textByDocId: new Map(
      checklistItems.map((item) => [`doc-${item.id}`, "Passport: Test Applicant"]),
    ),
    translatedTextByDocId: new Map(),
    relevantChunksByItemId: new Map(),
    visionDataByDocId: new Map(),
    metadataByDocId: new Map(),
  };
  return {
    checklistItems,
    evidence,
    applicationContext: "Synthetic applicant; tourist visa",
    visaType: "tourist",
  };
}

function overall(score: number) {
  return JSON.stringify({
    overallScore: score,
    riskLevel: score >= 80 ? "low" : score >= 65 ? "medium" : "high",
    summary: "Synthetic result",
    redFlags: [],
    strengths: [],
    recommendations: [],
    itemFeedback: {},
  });
}

describe("production case evaluation core", () => {
  it.each([
    { names: ["PRIYA SHARMA", "Ms. Priya Sharma"], hasMismatch: false },
    { names: ["PRIYA SHARMA", " Dr. Priya Sharma "], hasMismatch: false },
    { names: ["Priya Sharma", "Ananya Sharma"], hasMismatch: true },
    { names: ["নাফিস ইসলাম", "সাদিক ইসলাম"], hasMismatch: true },
    { names: ["李明", "王芳"], hasMismatch: true },
    { names: [" José Alvarez ", "ALVAREZ JOSÉ"], hasMismatch: false },
  ])("checks document holder identities: $names", async ({ names, hasMismatch }) => {
    const evaluate = vi.fn();
    for (const holderName of names) {
      evaluate.mockResolvedValueOnce(
        JSON.stringify({
          ...documentResult,
          extractedFields: { ...documentResult.extractedFields, holderName },
        }),
      );
    }
    evaluate.mockResolvedValueOnce(overall(40));
    await runCaseEvaluation({ ...fixture(2), evaluate });
    const combinedPrompt = evaluate.mock.calls[2][0].userContent;
    expect(combinedPrompt.includes("Name mismatch:")).toBe(hasMismatch);
  });

  it("uses production schemas, individual review, combined review and the skeptical pass", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(documentResult))
      .mockResolvedValueOnce(overall(80))
      .mockResolvedValueOnce(overall(60));
    const result = await runCaseEvaluation({ ...fixture(), evaluate });
    expect(evaluate.mock.calls.map(([request]) => request.schemaName)).toEqual([
      "per_document_evaluation",
      "orchestrator_evaluation",
      "orchestrator_evaluation",
    ]);
    expect(evaluate.mock.calls[0][0].systemPrompt).toContain(
      "senior visa agency review specialist",
    );
    expect(evaluate.mock.calls[1][0].userContent).toContain(
      "5-DIMENSION AGENCY READINESS SCORING FRAMEWORK",
    );
    expect(evaluate.mock.calls[2][0].systemPrompt).toContain("highly skeptical");
    expect(evaluate.mock.calls[2][0].userContent).toBe(evaluate.mock.calls[1][0].userContent);
    expect(evaluate.mock.calls[2][0].systemPrompt).not.toMatch(
      /assume the worst|deliberate omissions/i,
    );
    expect(result.evaluationData.overallScore).toBe(70);
    expect(result.evaluationData.riskLevel).toBe("medium");
    expect(result.scoreConfidence).toBe("low");
    expect(result.diagnostics).toMatchObject({
      orchestratorFallback: false,
      skepticalAttempted: true,
    });
  });

  it("bounds concurrent document calls and preserves checklist order", async () => {
    let active = 0;
    let peak = 0;
    const evaluate = vi.fn(async ({ schemaName }: { schemaName: string }) => {
      if (schemaName !== "per_document_evaluation") return overall(40);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return JSON.stringify(documentResult);
    });
    const result = await runCaseEvaluation({ ...fixture(7), evaluate, maxConcurrency: 2 });
    expect(peak).toBe(2);
    expect(result.perDocumentEvaluations.map((item) => item.checklistItemId)).toEqual(
      Array.from({ length: 7 }, (_, i) => `item-${i}`),
    );
  });

  it("fails the case when a document provider call fails", async () => {
    const evaluate = vi.fn().mockRejectedValue(new Error("Provider unavailable"));
    await expect(runCaseEvaluation({ ...fixture(), evaluate })).rejects.toThrow(
      "could not evaluate",
    );
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it("waits for active calls after failure and does not start more documents", async () => {
    let finishActive!: () => void;
    let activeStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      activeStarted = resolve;
    });
    const activeCall = new Promise<void>((resolve) => {
      finishActive = resolve;
    });
    let calls = 0;
    let settled = false;
    const outcome = runCaseEvaluation({
      ...fixture(5),
      maxConcurrency: 2,
      evaluate: async () => {
        calls++;
        if (calls === 1) throw new Error("Provider unavailable");
        activeStarted();
        await activeCall;
        return JSON.stringify(documentResult);
      },
    }).then(
      () => {
        settled = true;
        return null;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    await started;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(settled).toBe(false);
    finishActive();
    expect(await outcome).toBeInstanceOf(Error);
    expect(calls).toBe(2);
  });

  it("limits the default document concurrency to two", async () => {
    let active = 0;
    let peak = 0;
    await runCaseEvaluation({
      ...fixture(5),
      evaluate: async ({ schemaName }) => {
        if (schemaName !== "per_document_evaluation") return overall(40);
        active++;
        peak = Math.max(peak, active);
        await new Promise((done) => setTimeout(done, 5));
        active--;
        return JSON.stringify(documentResult);
      },
    });
    expect(peak).toBe(2);
  });

  it.each(["provider", "json", "schema"])(
    "rejects an incomplete combined review: %s",
    async (failure) => {
      const evaluate = vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ ...documentResult, score: 98 }));
      if (failure === "provider") evaluate.mockRejectedValueOnce(new Error("Provider unavailable"));
      else evaluate.mockResolvedValueOnce(failure === "json" ? "not JSON" : "{}");
      await expect(runCaseEvaluation({ ...fixture(), evaluate })).rejects.toThrow(
        "combined review did not complete",
      );
      expect(evaluate).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["provider", "json", "schema"])(
    "rejects an incomplete required second pass: %s",
    async (failure) => {
      const evaluate = vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(documentResult))
        .mockResolvedValueOnce(overall(80));
      if (failure === "provider") evaluate.mockRejectedValueOnce(new Error("Provider unavailable"));
      else evaluate.mockResolvedValueOnce(failure === "json" ? "not JSON" : "{}");
      await expect(runCaseEvaluation({ ...fixture(), evaluate })).rejects.toThrow(
        "second review did not complete",
      );
      expect(evaluate).toHaveBeenCalledTimes(3);
    },
  );

  it("uses the same reference date for prompts and deterministic expiry checks", async () => {
    for (const asOfDate of ["2026-09-19", "2026-10-18"]) {
      const evaluate = vi.fn(async ({ schemaName }: { schemaName: string }) =>
        schemaName === "per_document_evaluation"
          ? JSON.stringify({
              ...documentResult,
              extractedFields: { ...documentResult.extractedFields, expiryDate: "2026-10-01" },
            })
          : overall(40),
      );
      await runCaseEvaluation({ ...fixture(), asOfDate, evaluate });
      const documentPrompt = evaluate.mock.calls[0][0] as { userContent?: string };
      const combinedPrompt = evaluate.mock.calls[1][0] as { userContent?: string };
      expect(documentPrompt.userContent).toContain(`Review date: ${asOfDate}`);
      expect(combinedPrompt.userContent).toContain(`Review date: ${asOfDate}`);
      expect(combinedPrompt.userContent?.includes("Expired document:")).toBe(
        asOfDate === "2026-10-18",
      );
    }
  });

  it("keeps identity, expiry and language checks after saved feedback is reused", async () => {
    const input = fixture(2);
    const fields = [
      {
        ...documentResult.extractedFields,
        holderName: "PRIYA SHARMA",
        expiryDate: "2026-10-01",
        language: "fr",
      },
      { ...documentResult.extractedFields, holderName: "ANANYA SHARMA" },
    ];
    const evaluate = vi.fn();
    for (const extractedFields of fields) {
      evaluate.mockResolvedValueOnce(JSON.stringify({ ...documentResult, extractedFields }));
    }
    evaluate.mockResolvedValueOnce(overall(40));
    const first = await runCaseEvaluation({ ...input, asOfDate: "2026-09-19", evaluate });
    const previousEvaluation = JSON.parse(
      JSON.stringify({
        docSnapshots: first.docSnapshots,
        itemFeedback: first.evaluationData.itemFeedback,
      }),
    );
    const reviewAgain = vi.fn().mockResolvedValue(overall(40));
    const second = await runCaseEvaluation({
      ...input,
      asOfDate: "2026-10-18",
      previousEvaluation,
      evaluate: reviewAgain,
    });
    expect(reviewAgain).toHaveBeenCalledTimes(1);
    expect(second.perDocumentEvaluations.every((document) => document.reused)).toBe(true);
    expect(second.perDocumentEvaluations.map((document) => document.extractedFields)).toEqual(
      fields,
    );
    const prompt = reviewAgain.mock.calls[0][0].userContent;
    expect(prompt).toContain("Name mismatch:");
    expect(prompt).toContain("Expired document:");
    expect(prompt).toContain("FOREIGN LANGUAGE DOCUMENTS DETECTED");
  });

  it("reviews legacy feedback again when extracted fields were not saved", async () => {
    const input = fixture();
    const firstProvider = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(documentResult))
      .mockResolvedValueOnce(overall(40));
    const first = await runCaseEvaluation({ ...input, evaluate: firstProvider });
    const itemFeedback = structuredClone(first.evaluationData.itemFeedback);
    delete (itemFeedback["item-0"] as { extractedFields?: unknown }).extractedFields;
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(documentResult))
      .mockResolvedValueOnce(overall(40));
    const second = await runCaseEvaluation({
      ...input,
      previousEvaluation: { docSnapshots: first.docSnapshots, itemFeedback },
      evaluate,
    });
    expect(evaluate.mock.calls.map(([request]) => request.schemaName)).toEqual([
      "per_document_evaluation",
      "orchestrator_evaluation",
    ]);
    expect(second.perDocumentEvaluations[0].reused).not.toBe(true);
  });

  it("rejects invalid concurrency before provider work", async () => {
    const evaluate = vi.fn();
    await expect(runCaseEvaluation({ ...fixture(), evaluate, maxConcurrency: 0 })).rejects.toThrow(
      "concurrency",
    );
    expect(evaluate).not.toHaveBeenCalled();
  });
});
