/**
 * Checklist generation evaluation tests.
 *
 * Standalone model-only draft proposal probe. It does not run production research,
 * authentication, persistence or staff approval. Developer examples are not law.
 *
 * Requires OPENAI_API_KEY env var. LLM-as-judge requires RUN_LLM_JUDGE=true.
 */

import { describe, it, expect } from "vitest";
import OpenAI from "openai";
import { runEvalSuite } from "./framework/runner";
import { printResults, saveResults, loadBaseline } from "./framework/reporter";
import {
  checklistItemSchema,
  checklistNoDuplicates,
  checklistRequiredDocs,
} from "./framework/metrics";
import { llmJudgeMetric } from "./framework/llm-judge";
import {
  checklistCases,
  type ChecklistInput,
  type ChecklistExpected,
} from "./datasets/checklist-cases";
import type { ChecklistItemOutput, EvalTestCase } from "./framework/types";
import { normalizeChecklistCandidates } from "@/lib/checklist-research";

// ---------------------------------------------------------------------------
// Standalone proposal prompt. Production action safety has separate offline tests.
// ---------------------------------------------------------------------------

function buildChecklistPrompt(input: ChecklistInput): { system: string; user: string } {
  const system = `Propose draft document candidates for staff review. You are not an immigration decision-maker.

RESPONSE FORMAT: Return a JSON object with an "items" array. Each item must have:
- "documentName": string (official document name)
- "description": string (what it should contain, validity requirements, format specs)
- "commonMistakes": string (concrete mistakes that lead to rejection)
- "requirement": required, recommended, conditional, or unknown
- "applicability": applies, does_not_apply, or unknown
- "condition": the applicable condition, or empty
- "sources": [] (this probe has no retrieved source evidence)

RULES:
- Do not invent a document count, legal threshold, validity period or source quotation
- Distinguish required, recommended, conditional and unknown claims
- These are unverified proposals; do not claim they establish statutory requirements
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
Do not add mandatory documents solely because of this refusal.`;
  }

  if (input.approvedBefore) {
    user += `\n\nNote: Applicant was previously approved for ${input.approvedVisaType} in ${input.approvedYear}.`;
  }

  if (input.isDependent) {
    user += `\n\nNote: This is a dependent/family applicant. Resolve any relationship or sponsor-document conditions instead of assuming they are mandatory.`;
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

  return normalizeChecklistCandidates({ items: raw.items ?? raw, researchCitations: [] });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(process.env.RUN_CHECKLIST_EVALS !== "true")(
  "Unverified checklist proposal probe",
  () => {
    it(
      "records draft safety and developer candidate-name checks",
      { timeout: 300_000 },
      async () => {
        const baseline = loadBaseline("checklist-proposals-v2");

        const { result, regressions } = await runEvalSuite<
          ChecklistItemOutput[],
          ChecklistExpected
        >({
          suiteName: "checklist-proposals-v2",
          cases: checklistCases,
          producer: produceChecklist,
          baseline,
          metrics: [
            {
              name: "draftsRemainNonMandatory",
              threshold: 1.0,
              score({ output }) {
                const passed = output.every((item) => item.isRequired === false);
                return { name: "draftsRemainNonMandatory", score: passed ? 1 : 0, passed };
              },
            },
            checklistItemSchema(),
            checklistNoDuplicates(),
            // Developer candidate names; this does not verify mandatory law.
            {
              name: "developerCandidateCoverage",
              threshold: 0.8,
              async score({ output, expected }) {
                const requiredDocs = expected?.requiredDocNames ?? [];
                if (!requiredDocs.length)
                  return {
                    name: "developerCandidateCoverage",
                    score: 0,
                    passed: false,
                    measured: false,
                    detail: "No developer candidate labels supplied",
                  };
                return {
                  ...(await checklistRequiredDocs(requiredDocs).score({
                    output,
                    expected,
                  })),
                  name: "developerCandidateCoverage",
                };
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
          if (agg.passRate === null) continue;
          if (agg.name.startsWith("llmJudge")) continue; // skip when not enabled
          expect(
            agg.passRate,
            `Aggregate ${agg.name}: pass rate ${(agg.passRate * 100).toFixed(0)}% below 70%`,
          ).toBeGreaterThanOrEqual(0.7);
        }

        expect(regressions).toHaveLength(0);
      },
    );
  },
);
