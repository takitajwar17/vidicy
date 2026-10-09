/**
 * Document evaluation scoring evaluation tests.
 *
 * Tests the quality of AI-generated document evaluations by
 * calling the same Gemini core, prompts, schemas and stages as production.
 *
 * Requires RUN_MODEL_EVALS=true and Vertex AI credentials.
 * Fixtures are synthetic developer expectations, not expert-labelled accuracy evidence.
 * This measures review of prepared evidence; extraction and retrieval are excluded.
 * Optional independent LLM judging requires RUN_LLM_JUDGE=true and OPENAI_API_KEY.
 */

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { GEMINI_DOCUMENT_EVALUATION_MODEL } from "@/lib/gemini";
import { runCaseEvaluation } from "@/services/case-evaluation";
import { prepareEvaluationInput } from "./datasets/prepare-evaluation-input";
import { runEvalSuite } from "./framework/runner";
import { printResults, saveResults, loadBaseline } from "./framework/reporter";
import {
  scoreRange,
  riskLevelConsistency,
  hasRecommendations,
  schemaCompleteness,
  itemStatusAgreement,
  recommendationCoverage,
} from "./framework/metrics";
import { isLlmJudgeEnabled, llmJudgeMetric } from "./framework/llm-judge";
import type { EvaluationInput, EvaluationExpected } from "./datasets/evaluation-cases";
import { loadEvaluationCases } from "./datasets/load-evaluation-cases";
import type { OrchestratorEvalOutput, EvalTestCase } from "./framework/types";

/** Uses the production per-document, combined and skeptical stages without prompt copies. */
async function produceEvaluation(
  testCase: EvalTestCase<unknown, EvaluationExpected>,
): Promise<OrchestratorEvalOutput> {
  const result = await runCaseEvaluation(
    prepareEvaluationInput({ input: testCase.input as EvaluationInput }),
  );
  if (result.diagnostics.orchestratorFallback) {
    throw new Error(
      "Combined review used a deterministic fallback; this is not a successful model evaluation",
    );
  }
  if (result.diagnostics.skepticalAttempted && !result.diagnostics.skepticalSucceeded) {
    throw new Error("The production skeptical pass failed");
  }
  return result.evaluationData;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(process.env.RUN_MODEL_EVALS !== "true")(
  "Production Gemini Document Evaluation (synthetic cases)",
  () => {
    it("passes all quality metrics across document scenarios", { timeout: 1_800_000 }, async () => {
      const dataset = await loadEvaluationCases({ path: process.env.EVALUATION_CASES_FILE });
      const reviewEvidence = {
        model: GEMINI_DOCUMENT_EVALUATION_MODEL,
        scope: "Production prepared-evidence review; extraction and retrieval services excluded",
        provenance: dataset.provenance,
        datasetSha256: createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
        metricSourceSha256: createHash("sha256")
          .update(await readFile("src/__tests__/eval/framework/metrics.ts"))
          .digest("hex"),
        sourceSha256: createHash("sha256")
          .update(await readFile("src/services/case-evaluation.ts"))
          .update(await readFile("src/lib/gemini-evaluation.ts"))
          .update(await readFile("src/__tests__/eval/datasets/prepare-evaluation-input.ts"))
          .digest("hex"),
        referenceDates: dataset.cases.map((testCase) => ({
          caseId: testCase.id,
          asOfDate: testCase.input.asOfDate ?? "current UTC date",
        })),
      };
      const suiteName = `production-gemini-${dataset.provenance.kind}-${dataset.provenance.version.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const baseline = loadBaseline(suiteName);
      console.log(
        JSON.stringify({
          scope: "Production prepared-evidence review; extraction and retrieval services excluded",
          provenance: dataset.provenance,
        }),
      );

      const { result, regressions } = await runEvalSuite<
        OrchestratorEvalOutput,
        EvaluationExpected
      >({
        suiteName,
        cases: dataset.cases,
        producer: produceEvaluation,
        baseline,
        metrics: [
          // Schema completeness
          {
            name: "schemaCompleteness",
            threshold: 1.0,
            score({ output }) {
              return schemaCompleteness([
                "overallScore",
                "riskLevel",
                "summary",
                "redFlags",
                "strengths",
                "recommendations",
                "itemFeedback",
              ]).score({ output: output as unknown as Record<string, unknown> });
            },
          },
          // Overall score in valid range
          {
            name: "scoreRange",
            threshold: 1.0,
            score({ output }) {
              return scoreRange(0, 100).score({ output: output.overallScore });
            },
          },
          // Score falls in the expected range for this test case
          {
            name: "expectedScoreRange",
            threshold: 1.0,
            score({ output, expected }) {
              const min = expected?.scoreRange?.min ?? 0;
              const max = expected?.scoreRange?.max ?? 100;
              const inRange = output.overallScore >= min && output.overallScore <= max;
              return {
                name: "expectedScoreRange",
                score: inRange ? 1 : 0,
                passed: inRange,
                detail: inRange
                  ? `Score ${output.overallScore} in [${min}, ${max}]`
                  : `Score ${output.overallScore} NOT in expected [${min}, ${max}]`,
              };
            },
          },
          // Risk level consistency
          riskLevelConsistency(),
          // Has recommendations
          hasRecommendations(1),
          itemStatusAgreement(),
          recommendationCoverage(),
          // Expected risk level matches
          {
            name: "expectedRiskLevel",
            threshold: 1.0,
            score({ output, expected }) {
              if (!expected?.expectedRiskLevel) {
                return {
                  name: "expectedRiskLevel",
                  score: 1,
                  passed: true,
                  detail: "No expected risk level",
                };
              }
              const matches = output.riskLevel === expected.expectedRiskLevel;
              return {
                name: "expectedRiskLevel",
                score: matches ? 1 : 0,
                passed: matches,
                detail: matches
                  ? undefined
                  : `Expected "${expected.expectedRiskLevel}" but got "${output.riskLevel}"`,
              };
            },
          },
          // Red flags contain at least half of the expected keywords
          {
            name: "redFlagDetection",
            threshold: 0.5,
            score({ output, expected }) {
              const expectedFlags = expected?.expectedRedFlags ?? [];
              if (expectedFlags.length === 0) {
                return {
                  name: "redFlagDetection",
                  score: 1,
                  passed: true,
                  detail: "No expected red flags",
                };
              }
              const allFlags =
                (output.redFlags || []).join(" ").toLowerCase() +
                " " +
                (output.summary || "").toLowerCase() +
                " " +
                (output.recommendations || []).join(" ").toLowerCase();
              const found = expectedFlags.filter((kw) => allFlags.includes(kw.toLowerCase()));
              const ratio = found.length / expectedFlags.length;
              return {
                name: "redFlagDetection",
                score: ratio,
                passed: ratio >= 0.5,
                detail:
                  ratio < 1
                    ? `Missing red flag keywords: ${expectedFlags.filter((kw) => !allFlags.includes(kw.toLowerCase())).join(", ")}`
                    : undefined,
              };
            },
          },
          // LLM-as-judge (optional, reported separately from reference-label checks).
          ...(isLlmJudgeEnabled()
            ? [
                {
                  name: "llmJudge(accuracy,helpfulness,actionability)",
                  threshold: 0.7,
                  async score({
                    output,
                    input,
                  }: {
                    output: OrchestratorEvalOutput;
                    input?: unknown;
                  }) {
                    const metric = llmJudgeMetric(["accuracy", "helpfulness", "actionability"]);
                    return metric.score({
                      output: JSON.stringify(output, null, 2),
                      input: JSON.stringify(input),
                    });
                  },
                },
              ]
            : []),
        ],
      });

      printResults(result, regressions);
      const recordedResult = { ...result, reviewEvidence };
      saveResults(recordedResult);

      // A supplied item or recommendation label is a required case assertion.
      // Do not let aggregate averages hide a mismatch on a labelled case.
      for (const testCase of result.caseResults) {
        for (const score of testCase.scores.filter((score) =>
          ["itemStatusAgreement", "recommendationCoverage"].includes(score.name),
        )) {
          expect(
            score.passed,
            `${testCase.caseId}: ${score.name}: ${score.detail ?? "label mismatch"}`,
          ).toBe(true);
        }
      }

      // Assert aggregate pass rates meet minimum thresholds
      for (const agg of result.aggregates) {
        if (agg.name.startsWith("llmJudge")) continue;
        expect(
          agg.passRate,
          `Aggregate ${agg.name}: pass rate ${(agg.passRate * 100).toFixed(0)}% below 70%`,
        ).toBeGreaterThanOrEqual(0.7);
      }

      expect(regressions).toHaveLength(0);
    });
  },
);
