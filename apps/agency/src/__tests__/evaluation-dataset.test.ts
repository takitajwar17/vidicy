import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEvaluationCases } from "./eval/datasets/load-evaluation-cases";
import { prepareEvaluationInput } from "./eval/datasets/prepare-evaluation-input";
import {
  itemStatusAgreement,
  recommendationCoverage,
  compareReferenceScores,
  redFlagCoverage,
} from "./eval/framework/metrics";
import type { OrchestratorEvalOutput } from "./eval/framework/types";
import { runEvalSuite } from "./eval/framework/runner";
import { resolveReviewRoute } from "@/lib/review-rubric";

let temporaryDirectory: string | undefined;
afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true });
  temporaryDirectory = undefined;
});

describe("evaluation datasets", () => {
  it("labels built-in cases as synthetic and preserves missing uploads", async () => {
    const dataset = await loadEvaluationCases({});
    expect(dataset.provenance.kind).toBe("synthetic");
    expect(dataset.provenance.description).toContain("developer");
    expect(dataset.cases.length).toBeGreaterThan(0);
    const selected = dataset.cases.find((item) => item.id === "missing-required-docs")!;
    const prepared = prepareEvaluationInput({ input: selected.input });
    expect(prepared.asOfDate).toBe("2026-09-30");
    expect(prepared.checklistItems).toHaveLength(selected.input.documents.length);
    expect(prepared.evidence.docByChecklistItem.size).toBe(
      selected.input.documents.filter((item) => item.textContent !== null).length,
    );
    for (const document of prepared.evidence.docByChecklistItem.values()) {
      expect(document.fileName).toMatch(/\.pdf$/);
    }
  });

  it("validates a supplied labelled dataset and keeps its attribution", async () => {
    const dataset = await loadEvaluationCases({});
    temporaryDirectory = await mkdtemp(join(tmpdir(), "vidicy-dataset-"));
    const path = join(temporaryDirectory, "cases.json");
    await writeFile(
      path,
      JSON.stringify({
        provenance: {
          kind: "reviewer-labelled",
          description: "Test-only reviewer attribution",
          version: "test-v1",
          reviewers: ["Test Reviewer"],
        },
        cases: dataset.cases.filter((testCase) => testCase.id === "complete-reference"),
      }),
    );
    const loaded = await loadEvaluationCases({ path });
    expect(loaded.provenance).toMatchObject({
      kind: "reviewer-labelled",
      reviewers: ["Test Reviewer"],
    });
    expect(loaded.cases).toHaveLength(1);
  });

  it.each([
    { scoreRange: { min: 75, max: 100 }, expectedRiskLevel: "low" },
    { scoreRange: { min: 40, max: 72 }, expectedRiskLevel: "medium" },
    { scoreRange: { min: 30, max: 78 }, expectedRiskLevel: "high" },
  ])(
    "does not impose historical score bands on supplied evidence-state labels: $expectedRiskLevel",
    async (expected) => {
      const dataset = await loadEvaluationCases({});
      temporaryDirectory = await mkdtemp(join(tmpdir(), "vidicy-dataset-"));
      const path = join(temporaryDirectory, "conflicting-labels.json");
      await writeFile(
        path,
        JSON.stringify({ ...dataset, cases: [{ ...dataset.cases[0], expected }] }),
      );
      await expect(loadEvaluationCases({ path })).resolves.toMatchObject({ cases: [{ expected }] });
    },
  );

  it("includes a complete reference case and single-change evidence variants", async () => {
    const dataset = await loadEvaluationCases({});
    const base = dataset.cases.find((item) => item.id === "complete-reference")!;
    expect(base).toBeDefined();
    for (const id of [
      "reference-missing-bank",
      "reference-expired-passport",
      "reference-name-mismatch",
    ]) {
      const variant = dataset.cases.find((item) => item.id === id)!;
      expect(variant).toBeDefined();
      expect(variant.input.documents).toHaveLength(base.input.documents.length);
      const changed = variant.input.documents.filter(
        (document, index) =>
          JSON.stringify(document) !== JSON.stringify(base.input.documents[index]),
      );
      expect(changed).toHaveLength(1);
      expect(variant.expected.lowerScoreThanCaseId).toBeUndefined();
    }
  });

  it("prepares exact catalog routes without obsolete aliases or substring inference", async () => {
    const dataset = await loadEvaluationCases({});
    for (const testCase of dataset.cases) {
      const prepared = prepareEvaluationInput({ input: testCase.input });
      expect(prepared.routeContext).toMatchObject({
        destinationCountry: testCase.input.destinationCountry,
        visaType: testCase.input.visaType,
      });
      expect(resolveReviewRoute(prepared.routeContext!).status).toBe("research_draft");
      expect(testCase.expected.scoreRange).toBeUndefined();
      expect(testCase.expected.expectedRiskLevel).toBeUndefined();
    }
  });

  it("rejects mismatched route context instead of silently changing the case route", async () => {
    const dataset = await loadEvaluationCases({});
    const input = {
      ...dataset.cases[0].input,
      routeContext: { destinationCountry: "Canada", visaType: "Visitor" },
    };
    expect(() => prepareEvaluationInput({ input })).toThrow(/route context/i);
  });

  it("rejects duplicate checklist identifiers before provider work", async () => {
    const dataset = await loadEvaluationCases({});
    const testCase = structuredClone(dataset.cases[0]);
    testCase.input.documents.push(testCase.input.documents[0]);
    temporaryDirectory = await mkdtemp(join(tmpdir(), "vidicy-dataset-"));
    const path = join(temporaryDirectory, "cases.json");
    await writeFile(path, JSON.stringify({ ...dataset, cases: [testCase] }));
    await expect(loadEvaluationCases({ path })).rejects.toThrow("unique");
  });

  it.each(["unknown-reference", "complete-reference"])(
    "rejects an invalid score comparison: %s",
    async (referenceCaseId) => {
      const dataset = await loadEvaluationCases({});
      const testCase = structuredClone(
        dataset.cases.find((item) => item.id === "complete-reference")!,
      );
      testCase.expected.lowerScoreThanCaseId = referenceCaseId;
      temporaryDirectory = await mkdtemp(join(tmpdir(), "vidicy-dataset-"));
      const path = join(temporaryDirectory, "cases.json");
      await writeFile(path, JSON.stringify({ ...dataset, cases: [testCase] }));
      await expect(loadEvaluationCases({ path })).rejects.toThrow("reference another case");
    },
  );
});

const reviewOutput: OrchestratorEvalOutput = {
  overallScore: 90,
  riskLevel: "low",
  summary: "Provide evidence of funds",
  redFlags: [],
  strengths: [],
  recommendations: ["Book an interview"],
  itemFeedback: { passport: { status: "ok", feedback: "Readable document" } },
};

describe("evaluation reference labels", () => {
  it("rejects a wrong document status even when the overall review is strong", async () => {
    const score = await itemStatusAgreement().score({
      output: reviewOutput,
      expected: { expectedItemStatuses: { passport: "needs_review" } },
    });
    expect(score).toMatchObject({ score: 0, passed: false });
    expect(score.detail).toContain("passport");
    expect(score.detail).toContain("needs_review");
    expect(score.detail).toContain("ok");
  });
  it("reports missing item feedback as a label mismatch", async () => {
    const score = await itemStatusAgreement().score({
      output: reviewOutput,
      expected: { expectedItemStatuses: { bank: "missing" } },
    });
    expect(score.passed).toBe(false);
    expect(score.detail).toContain("bank");
  });
  it("requires recommendation labels in recommendations, not the summary", async () => {
    const score = await recommendationCoverage().score({
      output: reviewOutput,
      expected: { expectedRecommendations: ["fund", "evidence"] },
    });
    expect(score).toMatchObject({ score: 0, passed: false });
    expect(score.detail).toContain("fund");
    expect(score.detail).toContain("evidence");
  });
  it("accepts explicit word alternatives without dropping a required finding", async () => {
    const expected = {
      expectedRedFlags: [["mismatch", "contradiction"], "employer"],
      expectedRecommendations: [["financial evidence", "bank statement"], "balance"],
    };
    const output = {
      ...reviewOutput,
      redFlags: ["Employer contradiction between the two documents"],
      recommendations: ["Request bank statements showing sufficient balance"],
    };
    expect(await redFlagCoverage().score({ output, expected })).toMatchObject({ passed: true });
    expect(await recommendationCoverage().score({ output, expected })).toMatchObject({
      passed: true,
    });
    expect(
      await redFlagCoverage().score({
        output: { ...output, redFlags: ["Employer recorded"] },
        expected,
      }),
    ).toMatchObject({ passed: false });
    expect(
      await recommendationCoverage().score({
        output: { ...output, recommendations: ["Check the balance"] },
        expected,
      }),
    ).toMatchObject({ passed: false });
  });
  it("does not accept a required flag found only in the summary", async () => {
    expect(
      await redFlagCoverage().score({
        output: reviewOutput,
        expected: { expectedRedFlags: ["fund"] },
      }),
    ).toMatchObject({ passed: false });
  });
  it("recognizes concrete employer and pay contradictions in the mixed case", async () => {
    const dataset = await loadEvaluationCases({});
    const testCase = dataset.cases.find((item) => item.id === "mixed-quality-docs")!;
    const output = {
      ...reviewOutput,
      redFlags: [
        "Severe cross-document contradiction: The LMIA lists ABC Tech Solutions Inc. for a Software Developer role in Toronto at CAD 85,000/year, whereas the Employment Offer Letter is from XYZ Design Studio for a Junior Web Designer role in Vancouver at CAD 45,000/year.",
      ],
    };
    expect(await redFlagCoverage().score({ output, expected: testCase.expected })).toMatchObject({
      passed: true,
    });
    expect(
      await redFlagCoverage().score({
        output: { ...output, redFlags: ["There is a contradiction"] },
        expected: testCase.expected,
      }),
    ).toMatchObject({ passed: false });
  });
  it("checks every supplied status and recommendation label", async () => {
    const output = { ...reviewOutput, recommendations: ["Provide evidence of funds"] };
    expect(
      await itemStatusAgreement().score({
        output,
        expected: { expectedItemStatuses: { passport: "ok" } },
      }),
    ).toMatchObject({ score: 1, passed: true });
    expect(
      await recommendationCoverage().score({
        output,
        expected: { expectedRecommendations: ["FUND", "EVIDENCE"] },
      }),
    ).toMatchObject({ score: 1, passed: true });
  });
  it("does not accept a partial document-status match", async () => {
    const score = await itemStatusAgreement().score({
      output: reviewOutput,
      expected: { expectedItemStatuses: { passport: "ok", bank: "missing" } },
    });
    expect(score).toMatchObject({ score: 0.5, passed: false });
  });
  it("makes cases without supplied labels explicit", async () => {
    expect(await itemStatusAgreement().score({ output: reviewOutput })).toMatchObject({
      measured: false,
      passed: false,
      detail: "No item-status labels supplied",
    });
    expect(await recommendationCoverage().score({ output: reviewOutput })).toMatchObject({
      measured: false,
      passed: false,
      detail: "No recommendation labels supplied",
    });
  });
});

describe("controlled review score comparisons", () => {
  const cases = [{ id: "variant", expected: { lowerScoreThanCaseId: "reference" } }];
  it("rejects a defect scoring at or above its reference", () => {
    for (const score of [90, 95])
      expect(
        compareReferenceScores({ cases, scores: { reference: 90, variant: score } })[0],
      ).toMatchObject({ caseId: "variant", passed: false });
  });
  it("checks actual scores and retains both values", () => {
    expect(
      compareReferenceScores({ cases, scores: { reference: 90, variant: 65 } })[0],
    ).toMatchObject({ score: 65, referenceScore: 90, passed: true });
  });
  it("does not treat an unmeasured reference or failed variant as a pass", () => {
    expect(compareReferenceScores({ cases, scores: { variant: 65 } })[0].passed).toBe(false);
    expect(compareReferenceScores({ cases, scores: { reference: 90 } })[0].passed).toBe(false);
  });
});

describe("evaluation provider failures", () => {
  it("marks remaining cases unmeasured after a terminal provider error", async () => {
    const producer = vi.fn().mockRejectedValue(new Error("Provider unavailable"));
    const { result } = await runEvalSuite({
      suiteName: "provider-unavailable",
      cases: [
        { id: "failed", description: "Failed case", input: {} },
        { id: "unmeasured", description: "Unmeasured case", input: {} },
      ],
      producer,
      metrics: [itemStatusAgreement()],
      maxRetries: 0,
      stopOnProducerError: true,
    });
    expect(producer).toHaveBeenCalledTimes(1);
    expect(result.caseResults[1].scores[0].detail).toContain("Not measured");
    expect(result.caseResults[1].passed).toBe(false);
    expect(result.aggregates[0].passRate).toBeNull();
    expect(result.operational).toEqual({ attempted: 1, completed: 0, failed: 1, notRun: 1 });
  });

  it("records provider failures operationally without treating them as labelled model answers", async () => {
    const { result } = await runEvalSuite({
      suiteName: "provider-failures",
      cases: [
        { id: "limited", description: "Rate-limited case", input: {} },
        { id: "completed", description: "Completed case", input: {} },
      ],
      producer: async (testCase) => {
        if (testCase.id === "limited") throw new Error("Provider rate limit 429");
        return reviewOutput;
      },
      metrics: [itemStatusAgreement()],
      maxRetries: 0,
      delayBetweenCasesMs: 0,
    });
    expect(result.caseResults).toHaveLength(2);
    expect(result.aggregates[0].passRate).toBeNull();
    expect(result.operational).toEqual({ attempted: 2, completed: 1, failed: 1, notRun: 0 });
    expect(result.overallPassed).toBe(false);
  });

  it.each([true, false])("bounds rate-limit retries (recovery: %s)", async (recovers) => {
    vi.useFakeTimers();
    try {
      const producer = vi
        .fn<() => Promise<OrchestratorEvalOutput>>()
        .mockRejectedValueOnce(new Error("Provider rate limit 429"));
      if (recovers) producer.mockResolvedValue(reviewOutput);
      else producer.mockRejectedValue(new Error("Provider rate limit 429"));
      const pending = runEvalSuite({
        suiteName: "provider-retry",
        cases: [{ id: "case", description: "Retry case", input: {} }],
        producer,
        metrics: [
          {
            ...itemStatusAgreement(),
            score: ({ output }) =>
              itemStatusAgreement().score({
                output,
                expected: { expectedItemStatuses: { passport: "ok" } },
              }),
          },
        ],
        maxRetries: 1,
        delayBetweenCasesMs: 0,
      });
      await vi.runAllTimersAsync();
      const { result } = await pending;
      expect(producer).toHaveBeenCalledTimes(2);
      expect(result.overallPassed).toBe(recovers);
      expect(result.aggregates[0].passRate).toBe(recovers ? 1 : null);
    } finally {
      vi.useRealTimers();
    }
  });
});
