/**
 * Automated evaluation metrics — no external dependencies.
 *
 * Every metric returns a score in [0, 1] and a pass/fail flag.
 */

import type { EvalMetric, ChecklistItemOutput, OrchestratorEvalOutput } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 1 : intersection.size / union.size;
}

// ---------------------------------------------------------------------------
// Generic metrics
// ---------------------------------------------------------------------------

/**
 * Checks if output is valid JSON. Expects `output` to be a string.
 */
export function jsonValidity(threshold = 1.0): EvalMetric<string> {
  return {
    name: "jsonValidity",
    threshold,
    score({ output }) {
      try {
        JSON.parse(output);
        return { name: "jsonValidity", score: 1, passed: true };
      } catch {
        return {
          name: "jsonValidity",
          score: 0,
          passed: false,
          detail: "Invalid JSON",
        };
      }
    },
  };
}

/**
 * Checks that all `requiredKeys` exist on the parsed object.
 */
export function schemaCompleteness(
  requiredKeys: string[],
  threshold = 1.0,
): EvalMetric<Record<string, unknown>> {
  return {
    name: "schemaCompleteness",
    threshold,
    score({ output }) {
      const present = requiredKeys.filter((k) => k in output);
      const ratio = requiredKeys.length === 0 ? 1 : present.length / requiredKeys.length;
      const missing = requiredKeys.filter((k) => !(k in output));
      return {
        name: "schemaCompleteness",
        score: ratio,
        passed: ratio >= threshold,
        detail: missing.length ? `Missing: ${missing.join(", ")}` : undefined,
      };
    },
  };
}

/**
 * Checks a numeric value falls within [min, max].
 */
export function scoreRange(min: number, max: number, threshold = 1.0): EvalMetric<number> {
  return {
    name: "scoreRange",
    threshold,
    score({ output }) {
      const inRange = output >= min && output <= max;
      return {
        name: "scoreRange",
        score: inRange ? 1 : 0,
        passed: inRange,
        detail: inRange ? undefined : `${output} not in [${min}, ${max}]`,
      };
    },
  };
}

/**
 * Jaccard text similarity between output and expected (both strings).
 */
export function textSimilarity(threshold = 0.3): EvalMetric<string, string> {
  return {
    name: "textSimilarity",
    threshold,
    score({ output, expected }) {
      if (!expected)
        return { name: "textSimilarity", score: 0, passed: false, detail: "No expected text" };
      const sim = jaccardSimilarity(tokenize(output), tokenize(expected));
      return {
        name: "textSimilarity",
        score: sim,
        passed: sim >= threshold,
        detail: `Jaccard similarity: ${sim.toFixed(3)}`,
      };
    },
  };
}

/**
 * Checks that all required items appear in a list (case-insensitive substring match).
 */
export function listCompleteness(requiredItems: string[], threshold = 0.8): EvalMetric<string[]> {
  return {
    name: "listCompleteness",
    threshold,
    score({ output }) {
      const outputLower = output.map((s) => s.toLowerCase());
      const found = requiredItems.filter((item) =>
        outputLower.some((o) => o.includes(item.toLowerCase())),
      );
      const ratio = requiredItems.length === 0 ? 1 : found.length / requiredItems.length;
      const missing = requiredItems.filter(
        (item) => !outputLower.some((o) => o.includes(item.toLowerCase())),
      );
      return {
        name: "listCompleteness",
        score: ratio,
        passed: ratio >= threshold,
        detail: missing.length ? `Missing: ${missing.join(", ")}` : undefined,
      };
    },
  };
}

/**
 * Measures how well the output text is grounded in the provided context.
 * Uses keyword overlap between output claims and context.
 */
export function groundedness(threshold = 0.5): EvalMetric<string> {
  return {
    name: "groundedness",
    threshold,
    score({ output, context }) {
      if (!context)
        return { name: "groundedness", score: 0, passed: false, detail: "No context provided" };
      const outputTokens = tokenize(output);
      const contextTokens = new Set(tokenize(context));
      if (outputTokens.length === 0) return { name: "groundedness", score: 0, passed: false };
      const grounded = outputTokens.filter((t) => contextTokens.has(t));
      const ratio = grounded.length / outputTokens.length;
      return {
        name: "groundedness",
        score: ratio,
        passed: ratio >= threshold,
        detail: `${grounded.length}/${outputTokens.length} tokens grounded`,
      };
    },
  };
}

/**
 * Checks whether output text contains any of the given keywords.
 */
export function containsKeywords(keywords: string[], threshold = 0.8): EvalMetric<string> {
  return {
    name: "containsKeywords",
    threshold,
    score({ output }) {
      const outputLower = output.toLowerCase();
      const found = keywords.filter((kw) => outputLower.includes(kw.toLowerCase()));
      const ratio = keywords.length === 0 ? 1 : found.length / keywords.length;
      return {
        name: "containsKeywords",
        score: ratio,
        passed: ratio >= threshold,
        detail:
          ratio < threshold
            ? `Missing: ${keywords.filter((kw) => !outputLower.includes(kw.toLowerCase())).join(", ")}`
            : undefined,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Checklist-specific metrics
// ---------------------------------------------------------------------------

/**
 * Validates checklist item count is within [min, max].
 */
export function checklistItemCount(
  min = 5,
  max = 18,
  threshold = 1.0,
): EvalMetric<ChecklistItemOutput[]> {
  return {
    name: "checklistItemCount",
    threshold,
    score({ output }) {
      const count = output.length;
      const inRange = count >= min && count <= max;
      return {
        name: "checklistItemCount",
        score: inRange ? 1 : 0,
        passed: inRange,
        detail: `${count} items (expected ${min}–${max})`,
      };
    },
  };
}

/**
 * Validates each checklist item has all required fields with non-empty values.
 */
export function checklistItemSchema(threshold = 1.0): EvalMetric<ChecklistItemOutput[]> {
  return {
    name: "checklistItemSchema",
    threshold,
    score({ output }) {
      let validCount = 0;
      const issues: string[] = [];

      for (const item of output) {
        const problems: string[] = [];
        if (!item.documentName || typeof item.documentName !== "string")
          problems.push("missing documentName");
        if (!item.description || typeof item.description !== "string")
          problems.push("missing description");
        if (typeof item.isRequired !== "boolean") problems.push("missing isRequired");
        if (typeof item.sortOrder !== "number") problems.push("missing sortOrder");
        // commonMistakes can be empty string but must be string
        if (typeof item.commonMistakes !== "string") problems.push("missing commonMistakes");

        if (problems.length === 0) {
          validCount++;
        } else {
          issues.push(`"${item.documentName || "unknown"}": ${problems.join(", ")}`);
        }
      }

      const ratio = output.length === 0 ? 0 : validCount / output.length;
      return {
        name: "checklistItemSchema",
        score: ratio,
        passed: ratio >= threshold,
        detail: issues.length ? issues.join("; ") : undefined,
      };
    },
  };
}

/**
 * Checks that no duplicate document names exist in the checklist.
 */
export function checklistNoDuplicates(threshold = 1.0): EvalMetric<ChecklistItemOutput[]> {
  return {
    name: "checklistNoDuplicates",
    threshold,
    score({ output }) {
      const names = output.map((i) => i.documentName.toLowerCase().trim());
      const unique = new Set(names);
      const ratio = names.length === 0 ? 1 : unique.size / names.length;
      return {
        name: "checklistNoDuplicates",
        score: ratio,
        passed: ratio >= threshold,
        detail: ratio < 1 ? `${names.length - unique.size} duplicates found` : undefined,
      };
    },
  };
}

/**
 * Checks that required core documents are present (passport, photo, form).
 */
export function checklistRequiredDocs(
  requiredDocs: string[] = ["passport", "photo", "application form"],
  threshold = 0.8,
): EvalMetric<ChecklistItemOutput[]> {
  return {
    name: "checklistRequiredDocs",
    threshold,
    score({ output }) {
      const docNames = output.map((i) => i.documentName.toLowerCase());
      const found = requiredDocs.filter((req) =>
        docNames.some((name) => name.includes(req.toLowerCase())),
      );
      const ratio = requiredDocs.length === 0 ? 1 : found.length / requiredDocs.length;
      return {
        name: "checklistRequiredDocs",
        score: ratio,
        passed: ratio >= threshold,
        detail:
          ratio < 1
            ? `Missing: ${requiredDocs.filter((r) => !found.includes(r)).join(", ")}`
            : undefined,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Evaluation-specific metrics
// ---------------------------------------------------------------------------

/**
 * Validates that risk level is consistent with overall score.
 */
export function riskLevelConsistency(threshold = 1.0): EvalMetric<OrchestratorEvalOutput> {
  return {
    name: "riskLevelConsistency",
    threshold,
    score({ output }) {
      const { overallScore, riskLevel } = output;
      let expectedRisk: "low" | "medium" | "high";
      if (overallScore >= 80) expectedRisk = "low";
      else if (overallScore >= 65) expectedRisk = "medium";
      else expectedRisk = "high";

      const consistent = riskLevel === expectedRisk;
      return {
        name: "riskLevelConsistency",
        score: consistent ? 1 : 0,
        passed: consistent,
        detail: consistent
          ? undefined
          : `Score ${overallScore} → expected "${expectedRisk}" but got "${riskLevel}"`,
      };
    },
  };
}

/**
 * Checks that the evaluation contains non-empty recommendations.
 */
export function hasRecommendations(
  minCount = 1,
  threshold = 1.0,
): EvalMetric<OrchestratorEvalOutput> {
  return {
    name: "hasRecommendations",
    threshold,
    score({ output }) {
      const count = output.recommendations?.length ?? 0;
      const passed = count >= minCount;
      return {
        name: "hasRecommendations",
        score: passed ? 1 : 0,
        passed,
        detail: `${count} recommendations (min: ${minCount})`,
      };
    },
  };
}

/**
 * Validates item feedback keys match the provided checklist item IDs.
 */
export function itemFeedbackCoverage(
  expectedItemIds: string[],
  threshold = 0.8,
): EvalMetric<OrchestratorEvalOutput> {
  return {
    name: "itemFeedbackCoverage",
    threshold,
    score({ output }) {
      const feedbackKeys = Object.keys(output.itemFeedback || {});
      const found = expectedItemIds.filter((id) => feedbackKeys.includes(id));
      const ratio = expectedItemIds.length === 0 ? 1 : found.length / expectedItemIds.length;
      return {
        name: "itemFeedbackCoverage",
        score: ratio,
        passed: ratio >= threshold,
        detail:
          ratio < 1
            ? `Missing feedback for: ${expectedItemIds.filter((id) => !found.includes(id)).join(", ")}`
            : undefined,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Chat-specific metrics
// ---------------------------------------------------------------------------

/**
 * Checks that an off-topic question was refused (output contains refusal signals).
 */
export function refusalDetection(threshold = 1.0): EvalMetric<string> {
  const REFUSAL_SIGNALS = [
    "can't help with",
    "cannot help with",
    "can't assist with",
    "cannot assist with",
    "outside my scope",
    "not related to visa",
    "not related to immigration",
    "only assist with visa",
    "only help with visa",
    "visa and immigration",
    "i'm not able to",
    "i am not able to",
    "beyond my expertise",
    "not within my area",
    "i specialize in",
    "i focus on",
    "not something i can",
    "don't have the ability",
    "outside the scope",
    "beyond the scope",
    "visa-related",
    "immigration-related",
    "here to help with visa",
    "designed to assist with visa",
    "assist with visa",
    "only answer",
    "can't provide",
    "cannot provide",
    "not able to help",
    "not equipped to",
    "falls outside",
    "outside of my",
    "sorry, but i",
    "apologies, but",
    "unfortunately, i",
    "isn't something i",
  ];

  return {
    name: "refusalDetection",
    threshold,
    score({ output }) {
      const outputLower = output.toLowerCase();
      const refused = REFUSAL_SIGNALS.some((signal) => outputLower.includes(signal));
      return {
        name: "refusalDetection",
        score: refused ? 1 : 0,
        passed: refused,
        detail: refused ? "Refusal detected" : "No refusal signal found",
      };
    },
  };
}

/**
 * Checks for presence of markdown-style source citations.
 */
export function citationPresence(threshold = 0.7): EvalMetric<string> {
  return {
    name: "citationPresence",
    threshold,
    score({ output }) {
      // Look for markdown links [text](url) or "Source:" references
      const hasMarkdownLinks = /\[.+?\]\(https?:\/\/.+?\)/.test(output);
      const hasSourceRefs = /source:?\s/i.test(output);
      const hasUrlRefs = /https?:\/\/[^\s)]+/.test(output);
      const hasCitation = hasMarkdownLinks || hasSourceRefs || hasUrlRefs;
      return {
        name: "citationPresence",
        score: hasCitation ? 1 : 0,
        passed: hasCitation,
        detail: hasCitation ? "Citations found" : "No citations detected",
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Export all metric factories
// ---------------------------------------------------------------------------

export const metrics = {
  jsonValidity,
  schemaCompleteness,
  scoreRange,
  textSimilarity,
  listCompleteness,
  groundedness,
  containsKeywords,
  checklistItemCount,
  checklistItemSchema,
  checklistNoDuplicates,
  checklistRequiredDocs,
  riskLevelConsistency,
  hasRecommendations,
  itemFeedbackCoverage,
  refusalDetection,
  citationPresence,
} as const;
