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
import { withEvaluationMetrics } from "@/infra/evaluation-metrics";
import type { EvaluationCallMetric } from "@/infra/evaluation-metrics";
import { prepareEvaluationInput } from "./datasets/prepare-evaluation-input";
import { runEvalSuite } from "./framework/runner";
import { printResults, saveResults, loadBaseline } from "./framework/reporter";
import {
  scoreRange,
  schemaCompleteness,
  itemStatusAgreement,
  recommendationCoverage,
  compareReferenceScores,
  redFlagCoverage,
} from "./framework/metrics";
import { isLlmJudgeEnabled, llmJudgeMetric } from "./framework/llm-judge";
import type { EvaluationInput, EvaluationExpected } from "./datasets/evaluation-cases";
import { loadEvaluationCases } from "./datasets/load-evaluation-cases";
import type { OrchestratorEvalOutput, EvalTestCase } from "./framework/types";

const QUALITY_DOCUMENT_CONCURRENCY = 1;

/** Uses production evidence review; conditional second reviews follow evidence concerns. */
async function produceEvaluation(testCase: EvalTestCase<unknown, EvaluationExpected>) {
  const result = await runCaseEvaluation({
    ...prepareEvaluationInput({ input: testCase.input as EvaluationInput }),
    maxConcurrency: QUALITY_DOCUMENT_CONCURRENCY,
  });
  if (result.diagnostics.orchestratorFallback) {
    throw new Error(
      "Combined review used a deterministic fallback; this is not a successful model evaluation",
    );
  }
  if (result.diagnostics.skepticalAttempted && !result.diagnostics.skepticalSucceeded) {
    throw new Error("The production skeptical pass failed");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(process.env.RUN_MODEL_EVALS !== "true")(
  "Production Gemini Document Evaluation (synthetic cases)",
  () => {
    it(
      "records completion and supplied evidence-reference checks",
      { timeout: 1_800_000 },
      async () => {
        const dataset = await loadEvaluationCases({ path: process.env.EVALUATION_CASES_FILE });
        const reviewEvidence = {
          model: GEMINI_DOCUMENT_EVALUATION_MODEL,
          documentConcurrency: QUALITY_DOCUMENT_CONCURRENCY,
          scope: "Production prepared-evidence review; extraction and retrieval services excluded",
          provenance: dataset.provenance,
          qualityLimit:
            "Synthetic/developer reference checks and optional model judging do not establish legal accuracy or approval probability. Missing labels are unmeasured.",
          datasetSha256: createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
          metricSourceSha256: createHash("sha256")
            .update(await readFile("src/__tests__/eval/framework/metrics.ts"))
            .digest("hex"),
          harnessSourceSha256: createHash("sha256")
            .update(await readFile("src/__tests__/eval/evaluation-eval.test.ts"))
            .update(await readFile("src/__tests__/eval/framework/runner.ts"))
            .digest("hex"),
          sourceSha256: createHash("sha256")
            .update(await readFile("src/services/case-evaluation.ts"))
            .update(await readFile("src/lib/gemini-evaluation.ts"))
            .update(await readFile("src/lib/review-rubric.ts"))
            .update(await readFile("src/lib/visa-route-catalog.ts"))
            .update(await readFile("src/__tests__/eval/datasets/prepare-evaluation-input.ts"))
            .digest("hex"),
          referenceDates: dataset.cases.map((testCase) => ({
            caseId: testCase.id,
            asOfDate: testCase.input.asOfDate ?? "current UTC date",
          })),
        };
        const suiteName = `production-gemini-${dataset.provenance.kind}-${dataset.provenance.version.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const baseline = loadBaseline(suiteName);
        const reviewScores: Record<string, number> = {};
        // Only built-in synthetic cases may retain model text for failure analysis.
        const syntheticOutputs: Record<string, Awaited<ReturnType<typeof produceEvaluation>>> = {};
        const reviewAttempts: Record<string, EvaluationCallMetric[][]> = {};
        console.log(
          JSON.stringify({
            scope:
              "Production prepared-evidence review; extraction and retrieval services excluded",
            provenance: dataset.provenance,
          }),
        );

        const { result, regressions } = await runEvalSuite<
          OrchestratorEvalOutput,
          EvaluationExpected
        >({
          suiteName,
          cases: dataset.cases,
          maxRetries: 1,
          stopOnProducerError: true,
          producer: async (testCase) => {
            const measured = await withEvaluationMetrics({
              run: async () => {
                try {
                  return { review: await produceEvaluation(testCase) };
                } catch (error) {
                  return { error };
                }
              },
            });
            (reviewAttempts[testCase.id] ??= []).push(measured.calls);
            if (!measured.result.review) {
              // The core returns a safe action error, without the provider status.
              // Use recorded status metadata for the runner's bounded 429 retry.
              if (measured.calls.some((call) => call.providerStatus === 429)) {
                throw new Error("Vertex AI rate limit (429); review attempt failed");
              }
              throw measured.result.error;
            }
            const review = measured.result.review;
            reviewScores[testCase.id] = review.evaluationData.overallScore;
            if (!process.env.EVALUATION_CASES_FILE) {
              syntheticOutputs[testCase.id] = review;
              console.log(
                JSON.stringify({
                  caseId: testCase.id,
                  overallScore: review.evaluationData.overallScore,
                  riskLevel: review.evaluationData.riskLevel,
                }),
              );
            }
            return review.evaluationData;
          },
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
            // Explicit caller-supplied coverage ranges are independent of evidence-state labels.
            {
              name: "expectedScoreRange",
              threshold: 1.0,
              score({ output, expected }) {
                if (!expected?.scoreRange)
                  return {
                    name: "expectedScoreRange",
                    score: 0,
                    passed: false,
                    measured: false,
                    detail: "No coverage-score range supplied",
                  };
                const { min, max } = expected.scoreRange;
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
                    score: 0,
                    passed: false,
                    measured: false,
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
            redFlagCoverage(),
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

        const scoreComparisons = compareReferenceScores({
          cases: dataset.cases,
          scores: reviewScores,
        });
        const recordedResult = {
          ...result,
          overallPassed: result.overallPassed && scoreComparisons.every((check) => check.passed),
          reviewEvidence,
          reviewScores,
          scoreComparisons,
          syntheticOutputs,
          reviewAttempts,
        };
        saveResults(recordedResult);
        printResults(recordedResult, regressions);
        console.log("Reference score comparisons:", JSON.stringify(scoreComparisons));

        for (const comparison of scoreComparisons) {
          expect(comparison.passed, comparison.detail).toBe(true);
        }

        // Every reference check is required. Averages must not hide a failed case.
        // Optional LLM judging remains separate from these reference assertions.
        for (const testCase of result.caseResults) {
          for (const score of testCase.scores.filter(
            (score) => score.measured !== false && !score.name.startsWith("llmJudge"),
          )) {
            expect(
              score.passed,
              `${testCase.caseId}: ${score.name}: ${score.detail ?? "label mismatch"}`,
            ).toBe(true);
          }
        }

        expect(regressions).toHaveLength(0);
      },
    );
  },
);
