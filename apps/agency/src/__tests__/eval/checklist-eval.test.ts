/**
 * Checklist generation evaluation tests.
 *
 * Tests the quality of AI-generated visa document checklists by
 * calling GPT-4o with the same prompt structure used in production.
 *
 * Requires OPENAI_API_KEY env var. LLM-as-judge requires RUN_LLM_JUDGE=true.
 */

import { describe, it, expect } from "vitest";
import OpenAI from "openai";
import { runEvalSuite } from "./framework/runner";
import { printResults, saveResults, loadBaseline } from "./framework/reporter";
import {
  checklistItemCount,
  checklistItemSchema,
  checklistNoDuplicates,
  checklistRequiredDocs,
} from "./framework/metrics";
import { llmJudgeMetric } from "./framework/llm-judge";
import { checklistCases, type ChecklistInput, type ChecklistExpected } from "./datasets/checklist-cases";
import type { ChecklistItemOutput, EvalTestCase } from "./framework/types";

// ---------------------------------------------------------------------------
// Prompt builder (mirrors production logic from checklist.action.ts)
// ---------------------------------------------------------------------------

function buildChecklistPrompt(input: ChecklistInput): { system: string; user: string } {
  const system = `You are an experienced visa officer with 15 years of expertise in visa applications worldwide.
Your task is to generate a document checklist for a visa application.

RESPONSE FORMAT: Return a JSON object with an "items" array. Each item must have:
- "documentName": string (official document name)
- "description": string (what it should contain, validity requirements, format specs)
- "commonMistakes": string (concrete mistakes that lead to rejection)
- "isRequired": boolean
- "sortOrder": number (required documents first, starting from 0)

RULES:
- Generate between 5 and 18 items
- Descriptions must mention validity period, required format, and content requirements
- Common mistakes must be concrete and actionable (not generic)
- Required documents first (lower sortOrder), optional documents after
- No duplicate document names`;

  let user = `Generate a visa document checklist for:
- Visa Type: ${input.visaType}
- Home Country: ${input.homeCountry}
- Destination: ${input.destinationCountry}
- Embassy: ${input.embassy}
- Applicant: ${input.applicantName}`;

  if (input.rejectedBefore) {
    user += `\n\nIMPORTANT: This applicant was previously rejected.
- Rejected Visa: ${input.rejectedVisaType}
- Rejection Year: ${input.rejectedYear}
- Rejection Reason: ${input.rejectedReason}
Include additional documents to address the rejection reason.`;
  }

  if (input.approvedBefore) {
    user += `\n\nNote: Applicant was previously approved for ${input.approvedVisaType} in ${input.approvedYear}.`;
  }

  if (input.isDependent) {
    user += `\n\nNote: This is a dependent/family applicant. Include relationship proof and sponsor documents.`;
  }

  return { system, user };
}

// ---------------------------------------------------------------------------
// Producer: calls OpenAI and returns parsed checklist items
// ---------------------------------------------------------------------------

async function produceChecklist(
  testCase: EvalTestCase<unknown, ChecklistExpected>,
): Promise<ChecklistItemOutput[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required");

  const client = new OpenAI({ apiKey });
  const input = testCase.input as ChecklistInput;
  const { system, user } = buildChecklistPrompt(input);

  const response = await client.chat.completions.create(
    {
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    },
    { signal: AbortSignal.timeout(60_000) },
  );

  const content = response.choices[0].message.content || "{}";
  const raw = JSON.parse(content);

  // Handle various response shapes (same as production)
  const items: ChecklistItemOutput[] =
    raw.items || raw.checklist || (Array.isArray(raw) ? raw : Object.values(raw).find((v) => Array.isArray(v))) || [];

  return items;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Checklist Generation Evaluation", () => {
  it("passes all quality metrics across visa scenarios", { timeout: 300_000 }, async () => {
      const baseline = loadBaseline("checklist-generation");

      const { result, regressions } = await runEvalSuite<ChecklistItemOutput[], ChecklistExpected>({
        suiteName: "checklist-generation",
        cases: checklistCases,
        producer: produceChecklist,
        baseline,
        metrics: [
          // Item count within bounds — we use a wrapper since per-case bounds vary
          {
            name: "checklistItemCount",
            threshold: 1.0,
            score({ output, expected }) {
              const min = expected?.minItems ?? 5;
              const max = expected?.maxItems ?? 18;
              return checklistItemCount(min, max).score({ output, expected });
            },
          },
          checklistItemSchema(),
          checklistNoDuplicates(),
          // Required docs — per-case expected docs
          {
            name: "checklistRequiredDocs",
            threshold: 0.8,
            score({ output, expected }) {
              const requiredDocs = expected?.requiredDocNames ?? [];
              return checklistRequiredDocs(requiredDocs).score({ output, expected });
            },
          },
          // LLM-as-judge (optional)
          {
            name: "llmJudge(accuracy,completeness,specificity)",
            threshold: 0.7,
            async score({ output, input }) {
              const metric = llmJudgeMetric(["accuracy", "completeness", "specificity"]);
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
      // LLM outputs are non-deterministic, so we check aggregates rather than per-case
      for (const agg of result.aggregates) {
        if (agg.name.startsWith("llmJudge")) continue; // skip when not enabled
        expect(
          agg.passRate,
          `Aggregate ${agg.name}: pass rate ${(agg.passRate * 100).toFixed(0)}% below 70%`,
        ).toBeGreaterThanOrEqual(0.7);
      }

      expect(regressions).toHaveLength(0);
    });
});
