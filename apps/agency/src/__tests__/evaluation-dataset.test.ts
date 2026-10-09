import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEvaluationCases } from "./eval/datasets/load-evaluation-cases";
import { prepareEvaluationInput } from "./eval/datasets/prepare-evaluation-input";
import { itemStatusAgreement, recommendationCoverage } from "./eval/framework/metrics";
import type { OrchestratorEvalOutput } from "./eval/framework/types";

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
        cases: dataset.cases.slice(0, 1),
      }),
    );
    const loaded = await loadEvaluationCases({ path });
    expect(loaded.provenance).toMatchObject({
      kind: "reviewer-labelled",
      reviewers: ["Test Reviewer"],
    });
    expect(loaded.cases).toHaveLength(1);
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
      passed: true,
      detail: "No item-status labels supplied",
    });
    expect(await recommendationCoverage().score({ output: reviewOutput })).toMatchObject({
      passed: true,
      detail: "No recommendation labels supplied",
    });
  });
});
