import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "@/infra/logger";

export interface EvaluationCallMetric {
  model: string;
  stage: string;
  status: "succeeded" | "failed";
  providerStatus?: number;
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

export async function withEvaluationMetrics<T>({
  run,
}: {
  run: () => Promise<T>;
}): Promise<{ result: T; calls: EvaluationCallMetric[] }> {
  const calls: EvaluationCallMetric[] = [];
  const result = await collectors.run(calls, run);
  return { result, calls };
}
