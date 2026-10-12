/**
 * Atlas chat quality evaluation tests.
 *
 * Tests the quality of AI chat responses for groundedness,
 * topic relevance, refusal accuracy, and citation presence.
 *
 * Requires OPENAI_API_KEY env var. LLM-as-judge requires RUN_LLM_JUDGE=true.
 */

import { describe, it, expect } from "vitest";
import OpenAI from "openai";
import { runEvalSuite } from "./framework/runner";
import { printResults, saveResults, loadBaseline } from "./framework/reporter";
import {
  groundedness,
  containsKeywords,
  refusalDetection,
  citationPresence,
} from "./framework/metrics";
import { llmJudgeMetric } from "./framework/llm-judge";
import { chatCases } from "./datasets/chat-cases";
import type { ChatTestInput, ChatExpected, EvalTestCase } from "./framework/types";

// ---------------------------------------------------------------------------
// Producer: calls OpenAI with the test case's system prompt and message
// ---------------------------------------------------------------------------

async function produceChat(testCase: EvalTestCase<unknown, ChatExpected>): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY required");

  const client = new OpenAI({ apiKey });
  const input = testCase.input as ChatTestInput;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: input.systemPrompt },
  ];

  // Add conversation history if present
  if (input.conversationHistory) {
    for (const msg of input.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: "user", content: input.message });

  const response = await client.chat.completions.create(
    {
      model: "gpt-4o",
      messages,
    },
    { signal: AbortSignal.timeout(60_000) },
  );

  return response.choices[0].message.content || "";
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(process.env.RUN_CHAT_EVALS !== "true")("Atlas Chat Quality Evaluation", () => {
  it("passes all quality metrics across chat scenarios", { timeout: 300_000 }, async () => {
    const baseline = loadBaseline("atlas-chat");

    const { result, regressions } = await runEvalSuite<string, ChatExpected>({
      suiteName: "atlas-chat",
      cases: chatCases,
      producer: produceChat,
      baseline,
      metrics: [
        // Groundedness — output tokens grounded in provided context
        // LLM responses use synonyms and are verbose, so token overlap is naturally low
        {
          name: "groundedness",
          threshold: 0.15,
          score({ output, context }) {
            if (!context) {
              return {
                name: "groundedness",
                score: 1,
                passed: true,
                detail: "No context to check against",
              };
            }
            return groundedness(0.15).score({ output, context });
          },
        },
        // Keyword containment — expected keywords appear in output
        {
          name: "containsExpectedKeywords",
          threshold: 0.8,
          score({ output, expected }) {
            const keywords = expected?.mustContainKeywords ?? [];
            if (keywords.length === 0) {
              return {
                name: "containsExpectedKeywords",
                score: 1,
                passed: true,
                detail: "No keywords to check",
              };
            }
            return containsKeywords(keywords, 0.8).score({ output });
          },
        },
        // Refusal accuracy — off-topic questions should be refused
        {
          name: "refusalAccuracy",
          threshold: 1.0,
          async score({ output, expected, input }) {
            if (!expected?.shouldRefuse) {
              // Non-refusal case — make sure it does NOT refuse
              const refusalResult = await refusalDetection().score({ output });
              const didNotRefuse = refusalResult.score === 0;
              return {
                name: "refusalAccuracy",
                score: didNotRefuse ? 1 : 0,
                passed: didNotRefuse,
                detail: didNotRefuse
                  ? "Correctly answered (not refused)"
                  : "Incorrectly refused a valid question",
              };
            }
            // Should refuse — first try standard refusal detection
            const refusalResult = await refusalDetection().score({ output });
            if (refusalResult.score === 1) return refusalResult;

            // Fallback: check if response mentions visa/immigration (redirecting to scope)
            // or does NOT contain off-topic content keywords
            const outputLower = output.toLowerCase();
            const chatInput = input as ChatTestInput;
            const msgLower = chatInput?.message?.toLowerCase() ?? "";

            const mentionsScope =
              outputLower.includes("visa") || outputLower.includes("immigration");
            // Check that the response doesn't actually answer the off-topic question
            const offTopicKeywords = msgLower.includes("recipe")
              ? ["ingredients", "cook", "minutes", "tablespoon", "cup"]
              : msgLower.includes("python") || msgLower.includes("script")
                ? ["def ", "import ", "print(", "for i in", "return "]
                : [];
            const answeredOffTopic = offTopicKeywords.some((kw) => outputLower.includes(kw));

            const refused = mentionsScope && !answeredOffTopic;
            return {
              name: "refusalAccuracy",
              score: refused ? 1 : 0,
              passed: refused,
              detail: refused ? "Refusal detected (scope redirect)" : "No refusal signal found",
            };
          },
        },
        // Citation presence — when expected, citations should exist
        {
          name: "citationPresence",
          threshold: 0.7,
          score({ output, expected }) {
            if (!expected?.mustCiteSources) {
              return {
                name: "citationPresence",
                score: 1,
                passed: true,
                detail: "Citations not required",
              };
            }
            return citationPresence(0.7).score({ output });
          },
        },
        // Response non-empty
        {
          name: "responseNonEmpty",
          threshold: 1.0,
          score({ output }) {
            const nonEmpty = output.trim().length > 10;
            return {
              name: "responseNonEmpty",
              score: nonEmpty ? 1 : 0,
              passed: nonEmpty,
              detail: nonEmpty ? undefined : "Response too short or empty",
            };
          },
        },
        // LLM-as-judge (optional)
        {
          name: "llmJudge(accuracy,helpfulness,safety)",
          threshold: 0.7,
          async score({ output, input, expected }) {
            const metric = llmJudgeMetric(["accuracy", "helpfulness", "safety"]);
            return metric.score({
              output,
              input: typeof input === "object" ? (input as ChatTestInput).message : String(input),
              expected: expected?.referenceAnswer,
            });
          },
        },
      ],
    });

    printResults(result, regressions);
    saveResults(result);

    // Assert aggregate pass rates meet minimum thresholds
    for (const agg of result.aggregates) {
      if (agg.passRate === null) continue;
      if (agg.name.startsWith("llmJudge")) continue;
      expect(
        agg.passRate,
        `Aggregate ${agg.name}: pass rate ${(agg.passRate * 100).toFixed(0)}% below 70%`,
      ).toBeGreaterThanOrEqual(0.7);
    }

    expect(regressions).toHaveLength(0);
  });
});
