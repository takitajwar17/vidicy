import { describe, expect, it, vi } from "vitest";
import * as reviewRubric from "@/lib/review-rubric";
import {
  runCaseEvaluation,
  type EvaluationEvidence,
  type EvaluationChecklistItem,
  type EvaluationProvider,
  type DocumentEvaluationCheckpoint,
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

function overall(score: number, count = 1) {
  return JSON.stringify({
    overallScore: score,
    riskLevel: score >= 80 ? "low" : score >= 65 ? "medium" : "high",
    summary: "Synthetic result",
    redFlags: [],
    strengths: [],
    recommendations: [],
    itemFeedback: Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        `item-${index}`,
        {
          status: "ok",
          title: "Passport evidence needs review",
          recommendation: "Provide the relevant passport evidence.",
          feedback: "Synthetic evidence review.",
        },
      ]),
    ),
  });
}

describe("production case evaluation core", () => {
  const finding = {
    title: "Financial evidence missing",
    details: "The uploaded file is a curriculum vitae rather than financial evidence.",
    recommendation: "Provide evidence of the funds available for the trip.",
  };

  it("asks the model for separate short titles, details, and recommendations", async () => {
    const evaluate = vi.fn(async (request: Parameters<EvaluationProvider>[0]) =>
      request.schemaName === "per_document_evaluation"
        ? JSON.stringify(documentResult)
        : JSON.stringify({ ...JSON.parse(overall(90)), redFlags: [finding] }),
    );
    const result = await runCaseEvaluation({ ...fixture(), evaluate });
    expect(result.evaluationData.redFlags).toEqual([finding]);
    const request = evaluate.mock.calls[1][0];
    expect(request.userContent).toContain("8 words");
    expect(request.userContent).toContain("80 characters");
    expect(request.userContent).toContain('"title"');
    expect(request.userContent).toContain('"details"');
    expect(request.userContent).toContain('"recommendation"');
    const properties = (
      request.schema as {
        properties: { redFlags: { items: { properties: { title: { maxLength: number } } } } };
      }
    ).properties;
    expect(properties.redFlags.items.properties.title.maxLength).toBe(100);
  });

  it.each([
    "A".repeat(81),
    "A".repeat(100),
    "One two three four five six seven eight nine",
    "One two three four five six seven eight nine ten",
  ])("accepts a title within the buffer without repair: %s", async (title) => {
    const evaluate = vi.fn(async (request: Parameters<EvaluationProvider>[0]) => {
      if (request.schemaName === "per_document_evaluation") return JSON.stringify(documentResult);
      const response = JSON.parse(overall(90));
      return JSON.stringify({
        ...response,
        redFlags: [{ ...finding, title }],
        itemFeedback: {
          "item-0": { ...response.itemFeedback["item-0"], title },
        },
      });
    });
    const result = await runCaseEvaluation({ ...fixture(), evaluate });
    expect(result.evaluationData.redFlags).toEqual([{ ...finding, title }]);
    expect(result.evaluationData.itemFeedback["item-0"].title).toBe(title);
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(
      evaluate.mock.calls.every(
        ([request]) =>
          !(
            typeof request.userContent === "string" && request.userContent.includes("TITLE REPAIR")
          ),
      ),
    ).toBe(true);
  });

  it.each([
    "A".repeat(101),
    "One two three four five six seven eight nine ten eleven",
    "Review citem_dghhw7heorfrjhgrvtkyktvs evidence",
    "resume.pdf",
  ])("asks the model to repair an invalid title: %s", async (title) => {
    let combinedCalls = 0;
    const evaluate = vi.fn(async (request: Parameters<EvaluationProvider>[0]) => {
      if (request.schemaName === "per_document_evaluation") return JSON.stringify(documentResult);
      combinedCalls++;
      return JSON.stringify({
        ...JSON.parse(overall(90)),
        redFlags: [{ ...finding, title: combinedCalls === 1 ? title : finding.title }],
      });
    });
    const result = await runCaseEvaluation({ ...fixture(), evaluate });
    expect(result.evaluationData.redFlags).toEqual([finding]);
    expect(combinedCalls).toBe(3);
    expect(evaluate.mock.calls[2][0].userContent).toContain("TITLE REPAIR");
    expect(evaluate.mock.calls[2][0].userContent).toContain(finding.details);
  });

  it("rejects a finding when its title is still invalid after one repair attempt", async () => {
    const evaluate = vi.fn(async (request: Parameters<EvaluationProvider>[0]) =>
      request.schemaName === "per_document_evaluation"
        ? JSON.stringify(documentResult)
        : JSON.stringify({
            ...JSON.parse(overall(90)),
            redFlags: [{ ...finding, title: "A".repeat(101) }],
          }),
    );
    await expect(runCaseEvaluation({ ...fixture(), evaluate })).rejects.toThrow(
      "combined review did not complete",
    );
    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  it("does not accept a title repair that removes the original concern", async () => {
    let combinedCalls = 0;
    const evaluate = vi.fn(async (request: Parameters<EvaluationProvider>[0]) => {
      if (request.schemaName === "per_document_evaluation") return JSON.stringify(documentResult);
      return JSON.stringify({
        ...JSON.parse(overall(90)),
        redFlags: ++combinedCalls === 1 ? [{ ...finding, title: "A".repeat(101) }] : [],
      });
    });
    await expect(runCaseEvaluation({ ...fixture(), evaluate })).rejects.toThrow(
      "combined review did not complete",
    );
    expect(evaluate).toHaveBeenCalledTimes(3);
  });

  it("repairs a document title while keeping its complete explanation and next action", async () => {
    let combinedCalls = 0;
    const evaluate = vi.fn(async (request: Parameters<EvaluationProvider>[0]) => {
      if (request.schemaName === "per_document_evaluation") return JSON.stringify(documentResult);
      return JSON.stringify({
        ...JSON.parse(overall(90)),
        itemFeedback: {
          "item-0": {
            status: "needs_review",
            title: ++combinedCalls === 1 ? "A".repeat(101) : finding.title,
            feedback: finding.details,
            recommendation: finding.recommendation,
          },
        },
      });
    });
    const result = await runCaseEvaluation({ ...fixture(), evaluate });
    expect(result.evaluationData.itemFeedback["item-0"]).toMatchObject({
      title: finding.title,
      feedback: finding.details,
      recommendation: finding.recommendation,
    });
    expect(combinedCalls).toBe(3);
  });

  it("rejects an invalid second-pass title after its one repair attempt", async () => {
    let combinedCalls = 0;
    const evaluate = vi.fn(async (request: Parameters<EvaluationProvider>[0]) => {
      if (request.schemaName === "per_document_evaluation") return JSON.stringify(documentResult);
      return JSON.stringify({
        ...JSON.parse(overall(90)),
        redFlags: [
          {
            ...finding,
            title: ++combinedCalls === 1 ? finding.title : "A".repeat(101),
          },
        ],
      });
    });
    await expect(runCaseEvaluation({ ...fixture(), evaluate })).rejects.toThrow(
      "second review did not complete",
    );
    expect(evaluate).toHaveBeenCalledTimes(4);
  });

  it("excludes non-applicable items and supplies the requirement condition", async () => {
    const input = fixture(2);
    Object.assign(input.checklistItems[0], { applicability: "does_not_apply" });
    Object.assign(input.checklistItems[1], {
      requirementType: "conditional",
      applicability: "applies",
      requirementCondition: "Only when the employer pays",
    });
    const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
      schemaName === "per_document_evaluation" ? JSON.stringify(documentResult) : overall(100),
    );
    const result = await runCaseEvaluation({ ...input, evaluate });
    expect(result.perDocumentEvaluations.map((item) => item.checklistItemId)).toEqual(["item-1"]);
    expect(JSON.stringify(evaluate.mock.calls[0][0].userContent)).toContain(
      "Only when the employer pays",
    );
  });
  it("does not call a model for an empty checklist or absent evidence", async () => {
    const evaluate = vi.fn().mockResolvedValue(overall(0));
    await expect(runCaseEvaluation({ ...fixture(0), evaluate })).rejects.toThrow("checklist");
    const input = fixture();
    input.evidence.docByChecklistItem.clear();
    await expect(runCaseEvaluation({ ...input, evaluate })).rejects.toThrow("usable");
    expect(evaluate).not.toHaveBeenCalled();
  });
  it("resumes saved document checks after the combined review fails", async () => {
    const saved: Record<string, DocumentEvaluationCheckpoint> = {};
    const onDocumentEvaluated = vi.fn(async (checkpoint: DocumentEvaluationCheckpoint) => {
      saved[checkpoint.evaluation.checklistItemId] = checkpoint;
    });
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(documentResult))
      .mockRejectedValueOnce(new Error("Deadline exceeded"));
    const input = { ...fixture(), evaluate, onDocumentEvaluated };
    await expect(runCaseEvaluation(input)).rejects.toThrow();
    expect(onDocumentEvaluated).toHaveBeenCalledTimes(1);
    expect(saved["item-0"].evaluation.status).toBe("ok");

    evaluate.mockReset().mockResolvedValue(overall(100));
    const result = await runCaseEvaluation({ ...input, resumeDocuments: saved });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(evaluate.mock.calls[0][0].schemaName).toBe("orchestrator_evaluation");
    expect(result.perDocumentEvaluations[0]).toMatchObject({ status: "ok", reused: true });

    // Changed case facts must require a fresh document check.
    evaluate
      .mockReset()
      .mockResolvedValueOnce(JSON.stringify(documentResult))
      .mockResolvedValueOnce(overall(100));
    await runCaseEvaluation({
      ...input,
      applicationContext: "Changed applicant",
      resumeDocuments: saved,
    });
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("saves an active document check even when another document fails", async () => {
    const saved = vi.fn();
    const evaluate = vi.fn(async (request: Parameters<EvaluationProvider>[0]) => {
      if (request.schemaName !== "per_document_evaluation") throw new Error("Must not combine");
      if (String(request.userContent).includes("file-0.pdf")) throw new Error("Timeout");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return JSON.stringify(documentResult);
    });
    const input = fixture(2);
    input.evidence.docByChecklistItem.get("item-0")!.fileName = "file-0.pdf";
    await expect(
      runCaseEvaluation({ ...input, evaluate, onDocumentEvaluated: saved }),
    ).rejects.toThrow();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0][0].evaluation.checklistItemId).toBe("item-1");
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("ignores malformed saved results and stops when saving a result fails", async () => {
    const evaluate = vi.fn().mockResolvedValueOnce(JSON.stringify(documentResult));
    const checkpoints: Record<string, DocumentEvaluationCheckpoint> = {};
    await expect(
      runCaseEvaluation({
        ...fixture(),
        evaluate,
        onDocumentEvaluated: async (checkpoint) => {
          checkpoints["item-0"] = checkpoint;
          throw new Error("Database unavailable");
        },
      }),
    ).rejects.toThrow("Database unavailable");
    expect(evaluate).toHaveBeenCalledTimes(1);
    const corrupted = { ...checkpoints["item-0"], evaluation: { status: "ok" } };
    evaluate
      .mockReset()
      .mockResolvedValueOnce(JSON.stringify(documentResult))
      .mockResolvedValueOnce(overall(100));
    await runCaseEvaluation({
      ...fixture(),
      evaluate,
      resumeDocuments: { "item-0": corrupted as DocumentEvaluationCheckpoint },
    });
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it("keeps different document subjects as observations until their roles are known", async () => {
    const evaluate = vi.fn();
    for (const holderName of ["Applicant Example", "Sponsor Example"]) {
      evaluate.mockResolvedValueOnce(
        JSON.stringify({
          ...documentResult,
          extractedFields: { ...documentResult.extractedFields, holderName },
        }),
      );
    }
    evaluate.mockResolvedValueOnce(overall(99));
    await runCaseEvaluation({ ...fixture(2), evaluate });
    const prompt = evaluate.mock.calls[2][0].userContent;
    expect(prompt).not.toContain("Name mismatch:");
    expect(prompt).toContain("Applicant Example");
    expect(prompt).toContain("Sponsor Example");
    expect(prompt).toContain("expected subject");
    expect(prompt).toContain("name-change or alias evidence");
  });

  it("uses route-aware evidence review without weighted approval scoring or score averaging", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(documentResult))
      .mockResolvedValueOnce(overall(1));
    const result = await runCaseEvaluation({
      ...fixture(),
      routeContext: {
        destinationCountry: "Switzerland",
        visaType: "student",
        stage: "initial application",
        facts: { sponsorName: "Sponsor Example" },
      },
      evaluate,
    });
    expect(evaluate.mock.calls.map(([request]) => request.schemaName)).toEqual([
      "per_document_evaluation",
      "orchestrator_evaluation",
    ]);
    for (const [request] of evaluate.mock.calls) {
      expect(request.userContent).toContain("ROUTE REVIEW CONTEXT");
      expect(request.userContent).toContain("Switzerland");
      expect(request.userContent).toContain("Sponsor Example");
      expect(request.systemPrompt).toContain("Do not invent mandatory");
      expect(request.userContent).not.toMatch(
        /5-DIMENSION|OVERSTAY RISK DIMENSION|Ties to Home Country \(25 pts\)/,
      );
    }
    expect(result.routeAssessment).toBeDefined();
    expect(result.evaluationData.overallScore).toBe(100);
    expect(result.evaluationData.riskLevel).toBe("low");
    expect(result.scoreConfidence).toBeNull();
    expect(result.ensembleDivergence).toBeNull();
    expect(result.diagnostics).toMatchObject({ skepticalAttempted: false });
  });

  it("includes selected route guidance in both prompt stages", async () => {
    const route = reviewRubric.resolveReviewRoute({
      destinationCountry: "Switzerland",
      visaType: "student",
    });
    const selectedRoute = vi
      .spyOn(reviewRubric, "resolveReviewRoute")
      .mockReturnValue({ ...route, guidance: ["Selected route guidance marker"] });
    try {
      const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
        schemaName === "per_document_evaluation" ? JSON.stringify(documentResult) : overall(99),
      );
      await runCaseEvaluation({
        ...fixture(),
        routeContext: { destinationCountry: "Switzerland", visaType: "student" },
        evaluate,
      });
      for (const [request] of evaluate.mock.calls) {
        expect(request.userContent).toContain("Selected route guidance marker");
      }
    } finally {
      selectedRoute.mockRestore();
    }
  });

  it("reviews uncertain evidence again without promoting model agreement to confidence", async () => {
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          ...documentResult,
          status: "needs_review",
          issues: ["The relationship to the named sponsor is not established"],
        }),
      )
      .mockResolvedValueOnce(overall(99))
      .mockResolvedValueOnce(overall(99));
    const result = await runCaseEvaluation({ ...fixture(), evaluate });
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(evaluate.mock.calls[2][0].systemPrompt).toContain("unresolved evidence");
    expect(result.evaluationData.overallScore).toBe(0);
    expect(result.evaluationData.riskLevel).toBe("medium");
    expect(result.scoreConfidence).toBeNull();
    expect(result.ensembleDivergence).toBeNull();
    expect(result.evaluationData.itemFeedback["item-0"].status).toBe("needs_review");
    expect(result.diagnostics).toMatchObject({
      skepticalAttempted: true,
      skepticalSucceeded: true,
    });
  });

  it("calculates coverage from supported readable required items and excludes optional items", async () => {
    const input = fixture(3);
    input.checklistItems[2].isRequired = false;
    input.evidence.docByChecklistItem.delete("item-1");
    input.evidence.docByChecklistItem.delete("item-2");
    const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
      schemaName === "per_document_evaluation"
        ? JSON.stringify({ ...documentResult, score: 2 })
        : overall(99, 3),
    );
    const result = await runCaseEvaluation({ ...input, evaluate });
    expect(result.evaluationData.overallScore).toBe(50);
    expect(result.evaluationData.riskLevel).toBe("high");
    expect(result.evaluationData.itemFeedback["item-1"].status).toBe("missing");
  });

  it("does not count a present but unreadable file as supported", async () => {
    const input = fixture(2);
    input.evidence.textByDocId.delete("doc-item-0");
    const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
      schemaName === "per_document_evaluation" ? JSON.stringify(documentResult) : overall(99),
    );
    const result = await runCaseEvaluation({ ...input, evaluate });
    expect(result.evaluationData.overallScore).toBe(50);
    expect(result.evaluationData.itemFeedback["item-0"].status).toBe("needs_review");
    expect(result.evaluationData.riskLevel).toBe("high");
  });

  it("does not infer authenticity from PDF metadata or apparent formatting", async () => {
    const input = fixture();
    input.evidence.metadataByDocId.set("doc-item-0", {
      creator: null,
      producer: null,
      creationDate: null,
      modDate: null,
      isModified: false,
      modificationGapDays: null,
      creationInFuture: true,
      hasNoMetadata: true,
      pageCount: 1,
    });
    const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
      schemaName === "per_document_evaluation" ? JSON.stringify(documentResult) : overall(40),
    );
    await runCaseEvaluation({ ...input, evaluate });
    const prompt = evaluate.mock.calls[0][0].userContent;
    expect(prompt).not.toMatch(/impossible for a genuine document|deliberately stripped/);
    expect(prompt).toContain("do not establish fraud");
    expect(prompt).toContain("issuer verification");
  });

  it("does not clear a combined evidence concern because its status says ok", async () => {
    const combined = JSON.stringify({
      ...JSON.parse(overall(99)),
      itemFeedback: {
        "item-0": {
          title: "Sponsor relationship not established",
          recommendation: "Provide evidence of the sponsor relationship.",
          status: "ok",
          feedback: "Relationship unclear",
          issues: ["Sponsor relationship needs evidence"],
        },
      },
    });
    const evaluate = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(documentResult))
      .mockResolvedValueOnce(combined)
      .mockResolvedValueOnce(overall(99));
    const result = await runCaseEvaluation({ ...fixture(), evaluate });
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(result.evaluationData.itemFeedback["item-0"].status).toBe("needs_review");
    expect(result.evaluationData.itemFeedback["item-0"].issues).toContain(
      "Sponsor relationship needs evidence",
    );
    expect(result.evaluationData.overallScore).toBe(0);
  });

  it("blocks a party review without a checklist or evidence", async () => {
    const evaluate = vi.fn();
    await expect(runCaseEvaluation({ ...fixture(0), evaluate })).rejects.toThrow("checklist");
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("bounds concurrent document calls and preserves checklist order", async () => {
    let active = 0;
    let peak = 0;
    const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) => {
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
        .mockResolvedValueOnce(JSON.stringify({ ...documentResult, status: "needs_review" }))
        .mockResolvedValueOnce(overall(80));
      if (failure === "provider") evaluate.mockRejectedValueOnce(new Error("Provider unavailable"));
      else evaluate.mockResolvedValueOnce(failure === "json" ? "not JSON" : "{}");
      await expect(runCaseEvaluation({ ...fixture(), evaluate })).rejects.toThrow(
        "second review did not complete",
      );
      expect(evaluate).toHaveBeenCalledTimes(3);
    },
  );

  it("keeps printed expiry dates separate from route-specific validity requirements", async () => {
    for (const asOfDate of ["2026-09-19", "2026-10-18"]) {
      const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
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
      expect(combinedPrompt.userContent).not.toContain("Expired document:");
      expect(combinedPrompt.userContent).toContain("2026-10-01");
      expect(combinedPrompt.userContent).toMatch(/printed dates do not establish invalidity/i);
    }
  });

  it("keeps uncertain subject, date and language observations after saved feedback is reused", async () => {
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
    const first = await runCaseEvaluation({ ...input, asOfDate: "2026-10-18", evaluate });
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
    expect(prompt).not.toMatch(
      /Name mismatch:|Expired document:|FOREIGN LANGUAGE DOCUMENTS DETECTED|treat as facts/,
    );
    expect(prompt).toContain("ANANYA SHARMA");
    expect(prompt).toContain("2026-10-01");
    expect(prompt).toContain('"language":"fr"');
    expect(prompt).toContain("accepted languages and translation exceptions");
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

  it.each([
    "requirement name",
    "requirement description",
    "common mistakes",
    "required status",
    "case context",
    "review date",
    "document identity",
    "file name",
    "extracted text",
    "translated text",
    "retrieved text",
    "image bytes",
    "PDF metadata",
    "route context",
  ])("refreshes saved document findings after a change to %s", async (change) => {
    const input = { ...fixture(), asOfDate: "2026-10-18" };
    const docId = "doc-item-0";
    input.evidence.visionDataByDocId.set(docId, ["data:image/png;base64,AAAA"]);
    input.evidence.relevantChunksByItemId.set("item-0", "Original retrieved text");
    const first = await runCaseEvaluation({
      ...input,
      evaluate: async ({ schemaName }) =>
        schemaName === "per_document_evaluation" ? JSON.stringify(documentResult) : overall(40),
    });
    const changed = structuredClone(input);
    const item = changed.checklistItems[0];
    const doc = changed.evidence.docByChecklistItem.get(item.id)!;
    switch (change) {
      case "requirement name":
        item.documentName = "Bank statement";
        break;
      case "requirement description":
        item.description = "Valid for six months";
        break;
      case "common mistakes":
        item.commonMistakes = "Missing signatures";
        break;
      case "required status":
        item.isRequired = false;
        break;
      case "case context":
        changed.applicationContext = "Different applicant; student visa";
        break;
      case "review date":
        changed.asOfDate = "2026-10-19";
        break;
      case "document identity":
        changed.evidence.textByDocId.set(
          "replacement-document",
          changed.evidence.textByDocId.get(doc.id)!,
        );
        doc.id = "replacement-document";
        break;
      case "file name":
        doc.fileName = "replacement.pdf";
        break;
      case "extracted text":
        changed.evidence.textByDocId.set(docId, "Corrected passport text");
        break;
      case "translated text":
        changed.evidence.translatedTextByDocId.set(docId, "Translated passport text");
        break;
      case "retrieved text":
        changed.evidence.relevantChunksByItemId.set(item.id, "Corrected retrieved text");
        break;
      case "image bytes":
        changed.evidence.visionDataByDocId.set(docId, ["data:image/png;base64,BBBB"]);
        break;
      case "route context":
        Object.assign(changed, {
          routeContext: {
            destinationCountry: "Canada",
            visaType: "permanent residence",
            facts: { sponsorName: "Different Sponsor" },
          },
        });
        break;
      case "PDF metadata":
        changed.evidence.metadataByDocId.set(docId, {
          creator: "Changed authoring tool",
          producer: null,
          creationDate: null,
          modDate: null,
          isModified: false,
          modificationGapDays: null,
          creationInFuture: false,
          hasNoMetadata: false,
          pageCount: 1,
        });
        break;
    }
    const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
      schemaName === "per_document_evaluation"
        ? JSON.stringify({ ...documentResult, issues: ["New evidence needs review"] })
        : overall(40),
    );
    const result = await runCaseEvaluation({
      ...changed,
      previousEvaluation: {
        docSnapshots: first.docSnapshots,
        itemFeedback: first.evaluationData.itemFeedback,
      },
      evaluate,
    });
    expect(evaluate.mock.calls.map(([request]) => request.schemaName)).toEqual([
      "per_document_evaluation",
      "orchestrator_evaluation",
      "orchestrator_evaluation",
    ]);
    expect(result.perDocumentEvaluations[0].reused).not.toBe(true);
    expect(result.perDocumentEvaluations[0].issues).toContain("New evidence needs review");
    expect(result.docSnapshots[item.id]).not.toBe(first.docSnapshots[item.id]);
    expect((evaluate.mock.calls[1][0] as { userContent?: string }).userContent).toContain(
      "New evidence needs review",
    );
  });

  it("reuses unchanged translated evidence and refreshes a changed translation", async () => {
    const input = { ...fixture(), asOfDate: "2026-10-18" };
    input.evidence.textByDocId.set("doc-item-0", "");
    input.evidence.translatedTextByDocId.set("doc-item-0", "Original translated text");
    const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
      schemaName === "per_document_evaluation" ? JSON.stringify(documentResult) : overall(40),
    );
    const first = await runCaseEvaluation({ ...input, evaluate });
    const previousEvaluation = {
      docSnapshots: first.docSnapshots,
      itemFeedback: first.evaluationData.itemFeedback,
    };
    evaluate.mockClear();
    const second = await runCaseEvaluation({ ...input, previousEvaluation, evaluate });
    expect(second.perDocumentEvaluations[0].reused).toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(1);
    input.evidence.translatedTextByDocId.set("doc-item-0", "Corrected translated text");
    evaluate.mockClear();
    const third = await runCaseEvaluation({ ...input, previousEvaluation, evaluate });
    expect(third.perDocumentEvaluations[0].reused).not.toBe(true);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });

  it.each(["source", "translation"])(
    "refreshes findings when %s text changes beyond all prompt excerpts",
    async (kind) => {
      const input = { ...fixture(), asOfDate: "2026-10-18" };
      const texts =
        kind === "source" ? input.evidence.textByDocId : input.evidence.translatedTextByDocId;
      texts.set("doc-item-0", "A".repeat(9000) + "Original ending");
      const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
        schemaName === "per_document_evaluation" ? JSON.stringify(documentResult) : overall(40),
      );
      const first = await runCaseEvaluation({ ...input, evaluate });
      texts.set("doc-item-0", "A".repeat(9000) + "Corrected ending");
      evaluate.mockClear();
      const second = await runCaseEvaluation({
        ...input,
        previousEvaluation: {
          docSnapshots: first.docSnapshots,
          itemFeedback: first.evaluationData.itemFeedback,
        },
        evaluate,
      });
      expect(second.perDocumentEvaluations[0].reused).not.toBe(true);
      expect(evaluate).toHaveBeenCalledTimes(2);
    },
  );

  it("recomputes missing document findings when the requirement changes", async () => {
    const input = { ...fixture(2), asOfDate: "2026-10-18" };
    input.evidence.docByChecklistItem.delete("item-0");
    const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
      schemaName === "per_document_evaluation" ? JSON.stringify(documentResult) : overall(40),
    );
    const first = await runCaseEvaluation({ ...input, evaluate });
    input.checklistItems[0].isRequired = false;
    input.checklistItems[0].documentName = "Optional evidence";
    const second = await runCaseEvaluation({
      ...input,
      previousEvaluation: {
        docSnapshots: first.docSnapshots,
        itemFeedback: first.evaluationData.itemFeedback,
      },
      evaluate,
    });
    expect(second.docSnapshots["item-0"]).toBe("missing");
    expect(second.perDocumentEvaluations[0].issues).toEqual([
      "Optional document has not been uploaded.",
    ]);
    expect(second.perDocumentEvaluations[0].feedback).toContain("Optional evidence");
    expect(
      evaluate.mock.calls.filter(([request]) => request.schemaName === "per_document_evaluation")
        .length,
    ).toBe(1);
  });

  it("refreshes only the changed document and rejects old snapshot keys", async () => {
    const input = { ...fixture(2), asOfDate: "2026-10-18" };
    const evaluate = vi.fn(async ({ schemaName }: Parameters<EvaluationProvider>[0]) =>
      schemaName === "per_document_evaluation" ? JSON.stringify(documentResult) : overall(40),
    );
    const first = await runCaseEvaluation({ ...input, evaluate });
    input.checklistItems[0].description = "Changed requirement";
    const previousEvaluation = {
      docSnapshots: first.docSnapshots,
      itemFeedback: first.evaluationData.itemFeedback,
    };
    evaluate.mockClear();
    const second = await runCaseEvaluation({ ...input, previousEvaluation, evaluate });
    expect(second.perDocumentEvaluations.map((document) => !!document.reused)).toEqual([
      false,
      true,
    ]);
    expect(evaluate).toHaveBeenCalledTimes(2);
    previousEvaluation.docSnapshots["item-1"] =
      `doc-item-1:${first.docSnapshots["item-1"].split(":")[1]}:1:0`;
    evaluate.mockClear();
    const third = await runCaseEvaluation({ ...input, previousEvaluation, evaluate });
    expect(third.perDocumentEvaluations.every((document) => !document.reused)).toBe(true);
  });

  it("rejects invalid concurrency before provider work", async () => {
    const evaluate = vi.fn();
    await expect(runCaseEvaluation({ ...fixture(), evaluate, maxConcurrency: 0 })).rejects.toThrow(
      "concurrency",
    );
    expect(evaluate).not.toHaveBeenCalled();
  });
});
