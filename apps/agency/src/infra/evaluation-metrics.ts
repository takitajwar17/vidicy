import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "@/infra/logger";

export interface EvaluationCallMetric {
  model: string;
  stage: string;
  status: "succeeded" | "failed";
  providerStatus?: number;
  failureReason?: "deadline" | "rate_limit" | "provider";
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
}

const collectors = new AsyncLocalStorage<EvaluationCallMetric[]>();

/** Capture only usage and timing. Never collect prompts, responses, or document IDs. */
export function recordEvaluationCall(metric: EvaluationCallMetric): void {
  collectors.getStore()?.push(metric);
  logger.info("AI evaluation call", { ...metric });
}

/** Measure extraction, translation, and embedding usage without response content. */
export async function measureProviderCall<T>({
  model,
  stage,
  run,
}: {
  model: string;
  stage: string;
  run: () => Promise<T>;
}): Promise<T> {
  const started = performance.now();
  let response: T | undefined;
  let status: EvaluationCallMetric["status"] = "failed";
  let providerStatus: number | undefined;
  let failureReason: EvaluationCallMetric["failureReason"];
  try {
    response = await run();
    status = "succeeded";
    return response;
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && typeof error.status === "number")
      providerStatus = error.status;
    const message = error instanceof Error ? error.message : "";
    failureReason = /timeout|timed out|deadline|aborted/i.test(message)
      ? "deadline"
      : providerStatus === 429
        ? "rate_limit"
        : "provider";
    throw error;
  } finally {
    const value = response as
      | { usage?: Record<string, unknown>; usageMetadata?: Record<string, unknown> }
      | undefined;
    const usage = value?.usageMetadata ?? value?.usage;
    function count(...keys: string[]) {
      for (const key of keys) {
        const n = usage?.[key];
        if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
      }
      return null;
    }
    recordEvaluationCall({
      model,
      stage,
      status,
      providerStatus,
      failureReason,
      durationMs: performance.now() - started,
      inputTokens: count("promptTokenCount", "input_tokens", "prompt_tokens"),
      outputTokens: count("candidatesTokenCount", "output_tokens", "completion_tokens"),
      totalTokens: count("totalTokenCount", "total_tokens"),
      thinkingTokens: count("thoughtsTokenCount"),
      cachedInputTokens: count("cachedContentTokenCount"),
    });
  }
}

export async function withEvaluationMetrics<T>({
  run,
  calls = [],
}: {
  run: () => Promise<T>;
  calls?: EvaluationCallMetric[];
}): Promise<{ result: T; calls: EvaluationCallMetric[] }> {
  const result = await collectors.run(calls, run);
  return { result, calls };
}
