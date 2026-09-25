/**
 * Document evaluation scoring evaluation tests.
 *
 * Tests the quality of AI-generated document evaluations by
 * calling GPT-4o with the same prompt structure used in production.
 *
 * Requires OPENAI_API_KEY env var. LLM-as-judge requires RUN_LLM_JUDGE=true.
 */

import { describe, it, expect } from "vitest";
import OpenAI from "openai";
import { runEvalSuite } from "./framework/runner";
import { printResults, saveResults, loadBaseline } from "./framework/reporter";
import {
  scoreRange,
  riskLevelConsistency,
  hasRecommendations,
  schemaCompleteness,
} from "./framework/metrics";
import { llmJudgeMetric } from "./framework/llm-judge";
import {
  evaluationCases,
  type EvaluationInput,
  type EvaluationExpected,
} from "./datasets/evaluation-cases";
import type { OrchestratorEvalOutput, EvalTestCase } from "./framework/types";

// ---------------------------------------------------------------------------
// Prompt builder (mirrors production Phase 2 orchestrator logic)
// ---------------------------------------------------------------------------

function buildOrchestratorPrompt(input: EvaluationInput): { system: string; user: string } {
  const system = `You are an expert visa application evaluator. Analyze the provided document summaries and produce an overall assessment.

RESPONSE FORMAT: Return a JSON object with:
- "overallScore": number (0-100)
- "riskLevel": "low" | "medium" | "high" (low = score ≥ 80, medium = 65-79, high = < 65)
- "summary": string (2-3 sentence overall assessment)
- "redFlags": string[] (critical issues that could cause rejection)
- "strengths": string[] (positive aspects of the application)
- "recommendations": string[] (actionable steps to improve)
- "itemFeedback": object with checklist item IDs as keys, each containing:
  - "status": "ok" | "missing" | "needs_review"
  - "feedback": string
  - "score": number (0-100)

SCORING RULES:
- Required documents missing = major penalty (each missing required doc reduces score by 15-20 points)
- Expired documents = critical red flag
- Required documents weighted 2x vs optional
- Score must be consistent with riskLevel: low ≥ 80, medium = 65-79, high < 65`;

  const docSummaries = input.documents
    .map((doc) => {
      const content = doc.textContent
        ? `Content:\n${doc.textContent}`
        : "Status: NOT UPLOADED (missing)";
      return `### ${doc.documentName} [${doc.isRequired ? "REQUIRED" : "OPTIONAL"}] (ID: ${doc.checklistItemId})
${content}`;
    })
    .join("\n\n");

  const user = `Evaluate this ${input.visaType} visa application from ${input.homeCountry} to ${input.destinationCountry}.

## Documents Submitted:

${docSummaries}`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Producer: calls OpenAI and returns parsed evaluation
// ---------------------------------------------------------------------------

async function produceEvaluation(
  testCase: EvalTestCase<unknown, EvaluationExpected>,
): Promise<OrchestratorEvalOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required");

  const client = new OpenAI({ apiKey });
  const input = testCase.input as EvaluationInput;
  const { system, user } = buildOrchestratorPrompt(input);

  const response = await client.chat.completions.create(
    {
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    },
    { signal: AbortSignal.timeout(60_000) },
  );

  const content = response.choices[0].message.content || "{}";
  return JSON.parse(content) as OrchestratorEvalOutput;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Document Evaluation Scoring", () => {
  it("passes all quality metrics across document scenarios", { timeout: 300_000 }, async () => {
      const baseline = loadBaseline("document-evaluation");

      const { result, regressions } = await runEvalSuite<OrchestratorEvalOutput, EvaluationExpected>({
        suiteName: "document-evaluation",
        cases: evaluationCases,
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
          // Expected risk level matches
          {
            name: "expectedRiskLevel",
            threshold: 1.0,
            score({ output, expected }) {
              if (!expected?.expectedRiskLevel) {
                return { name: "expectedRiskLevel", score: 1, passed: true, detail: "No expected risk level" };
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
          // Red flags contain expected keywords (at least 1 match suffices)
          {
            name: "redFlagDetection",
            threshold: 0.5,
            score({ output, expected }) {
              const expectedFlags = expected?.expectedRedFlags ?? [];
              if (expectedFlags.length === 0) {
                return { name: "redFlagDetection", score: 1, passed: true, detail: "No expected red flags" };
              }
              const allFlags = (output.redFlags || []).join(" ").toLowerCase()
                + " " + (output.summary || "").toLowerCase()
                + " " + (output.recommendations || []).join(" ").toLowerCase();
              const found = expectedFlags.filter((kw) => allFlags.includes(kw.toLowerCase()));
              const ratio = found.length / expectedFlags.length;
              return {
                name: "redFlagDetection",
                score: ratio,
                passed: ratio >= 0.5,
                detail: ratio < 1
                  ? `Missing red flag keywords: ${expectedFlags.filter((kw) => !allFlags.includes(kw.toLowerCase())).join(", ")}`
                  : undefined,
              };
            },
          },
          // LLM-as-judge (optional)
          {
            name: "llmJudge(accuracy,helpfulness,actionability)",
            threshold: 0.7,
            async score({ output, input }) {
              const metric = llmJudgeMetric(["accuracy", "helpfulness", "actionability"]);
              return metric.score({
                output: JSON.stringify(output, null, 2),
                input: JSON.stringify(input),
              });
            },
          },
        ],
      });

      printResults(result, regressions);
      saveResults(result);

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
});
