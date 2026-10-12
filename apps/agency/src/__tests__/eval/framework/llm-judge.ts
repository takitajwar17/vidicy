/**
 * LLM-as-judge evaluator using OpenAI gpt-4o.
 *
 * Only runs when the `RUN_LLM_JUDGE` env var is set to "true".
 */

import OpenAI from "openai";
import type { JudgeDimension, JudgeResult, JudgeScore, EvalMetric, MetricScore } from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const JUDGE_MODEL = "gpt-4o";
const JUDGE_TIMEOUT_MS = 60_000;

export function isLlmJudgeEnabled(): boolean {
  return process.env.RUN_LLM_JUDGE === "true";
}

function getJudgeClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for LLM-as-judge evaluations");
  return new OpenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Pointwise evaluation
// ---------------------------------------------------------------------------

const DIMENSION_DESCRIPTIONS: Record<JudgeDimension, string> = {
  accuracy: "How factually correct is the response? Does it contain errors or hallucinations?",
  helpfulness: "How useful is the response to the user? Does it address their needs?",
  relevance: "How relevant is the response to the question asked?",
  specificity: "How specific and detailed is the response? Does it avoid vague generalizations?",
  safety: "Is the response safe? Does it avoid harmful, misleading, or inappropriate content?",
  actionability: "How actionable is the advice? Can the user take concrete steps based on it?",
  completeness: "Does the response cover all important aspects of the question?",
  groundedness:
    "Is the response grounded in the provided context/documents? Does it avoid making unsupported claims?",
};

/**
 * Evaluate a response on multiple dimensions using LLM-as-judge.
 */
export async function pointwiseJudge(params: {
  question: string;
  response: string;
  context?: string;
  referenceAnswer?: string;
  dimensions: JudgeDimension[];
}): Promise<JudgeResult> {
  const client = getJudgeClient();

  const dimensionBlock = params.dimensions
    .map((d) => `- **${d}**: ${DIMENSION_DESCRIPTIONS[d]}`)
    .join("\n");

  const systemPrompt = `You are an expert evaluator assessing the quality of AI-generated responses about visa and immigration applications.

Score the response on each dimension from 1 (worst) to 10 (best). Be strict but fair.

Respond ONLY with valid JSON in this exact format:
{
  "scores": [
    { "dimension": "<name>", "score": <1-10>, "reasoning": "<brief explanation>" }
  ]
}`;

  let userPrompt = `## Question
${params.question}

## Response to Evaluate
${params.response}

## Dimensions to Score
${dimensionBlock}`;

  if (params.context) {
    userPrompt += `\n\n## Context Provided to the AI\n${params.context}`;
  }
  if (params.referenceAnswer) {
    userPrompt += `\n\n## Reference Answer (Gold Standard)\n${params.referenceAnswer}`;
  }

  const response = await client.chat.completions.create(
    {
      model: JUDGE_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    },
    { signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS) },
  );

  const content = response.choices[0].message.content || "{}";
  const parsed = JSON.parse(content) as { scores: JudgeScore[] };

  const scores = parsed.scores || [];
  const overallScore =
    scores.length > 0 ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : 0;

  return { scores, overallScore };
}

// ---------------------------------------------------------------------------
// Pairwise comparison
// ---------------------------------------------------------------------------

export interface PairwiseResult {
  winner: "A" | "B" | "tie";
  reasoning: string;
  confidenceScore: number;
}

/**
 * Compare two responses and determine which is better.
 */
export async function pairwiseJudge(params: {
  question: string;
  responseA: string;
  responseB: string;
  context?: string;
  criteria: string;
}): Promise<PairwiseResult> {
  const client = getJudgeClient();

  const systemPrompt = `You are an expert evaluator comparing two AI-generated responses about visa and immigration applications.

Determine which response is better based on the given criteria. Be strict but fair.

Respond ONLY with valid JSON:
{
  "winner": "A" | "B" | "tie",
  "reasoning": "<brief explanation>",
  "confidenceScore": <0.0-1.0>
}`;

  let userPrompt = `## Question
${params.question}

## Response A
${params.responseA}

## Response B
${params.responseB}

## Evaluation Criteria
${params.criteria}`;

  if (params.context) {
    userPrompt += `\n\n## Context\n${params.context}`;
  }

  const response = await client.chat.completions.create(
    {
      model: JUDGE_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    },
    { signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS) },
  );

  const content = response.choices[0].message.content || "{}";
  return JSON.parse(content) as PairwiseResult;
}

// ---------------------------------------------------------------------------
// LLM-judge as an EvalMetric adapter
// ---------------------------------------------------------------------------

/**
 * Wraps pointwise LLM-as-judge into an EvalMetric compatible with the runner.
 *
 * The metric score is the mean of the requested dimensions, normalised to [0, 1].
 * When disabled, the judge is unmeasured and does not count as a quality pass.
 */
export function llmJudgeMetric(
  dimensions: JudgeDimension[],
  threshold = 0.7,
): EvalMetric<string, string> {
  return {
    name: `llmJudge(${dimensions.join(",")})`,
    threshold,
    async score({ output, expected, input, context }): Promise<MetricScore> {
      if (!isLlmJudgeEnabled()) {
        return {
          name: `llmJudge(${dimensions.join(",")})`,
          score: 0,
          passed: false,
          measured: false,
          detail: "Skipped (RUN_LLM_JUDGE not enabled)",
        };
      }

      const result = await pointwiseJudge({
        question: typeof input === "string" ? input : JSON.stringify(input),
        response: output,
        context,
        referenceAnswer: expected,
        dimensions,
      });

      // Normalise 1–10 → 0–1
      const normalised = result.overallScore / 10;

      const details = result.scores.map((s) => `${s.dimension}: ${s.score}/10`).join(", ");

      return {
        name: `llmJudge(${dimensions.join(",")})`,
        score: normalised,
        passed: normalised >= threshold,
        detail: details,
      };
    },
  };
}
