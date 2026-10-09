import type { EvaluationCallMetric } from "@/infra/evaluation-metrics";

export interface ModelRates {
  model: string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  source: string;
}
export interface BenchmarkRun<T> {
  status: "succeeded" | "failed";
  durationMs: number;
  value?: T;
}
export interface BenchmarkResult<T> {
  elapsedMs: number;
  runs: BenchmarkRun<T>[];
}

/** Closed-loop load: each worker starts another case when its previous case completes. */
export async function runBenchmark<T, R>({
  items,
  concurrency,
  run,
}: {
  items: T[];
  concurrency: number;
  run: (item: T) => Promise<R>;
}): Promise<BenchmarkResult<R>> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32)
    throw new Error("Benchmark concurrency must be an integer between 1 and 32");
  const runs = new Array<BenchmarkRun<R>>(items.length);
  let next = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        const start = performance.now();
        try {
          const value = await run(items[index]);
          runs[index] = { status: "succeeded", durationMs: performance.now() - start, value };
        } catch {
          // Never include exception payloads, which can contain submitted evidence.
          runs[index] = { status: "failed", durationMs: performance.now() - start };
        }
      }
    }),
  );
  return { elapsedMs: Math.max(0.001, performance.now() - started), runs };
}

export function summarizeBenchmark<T>({ runs, elapsedMs }: BenchmarkResult<T>) {
  const completed = runs.filter((run) => run.status === "succeeded");
  const durations = completed.map((run) => run.durationMs).sort((a, b) => a - b);
  function percentile(fraction: number): number | null {
    return durations.length
      ? durations[Math.max(0, Math.ceil(durations.length * fraction) - 1)]
      : null;
  }
  return {
    attempted: runs.length,
    succeeded: completed.length,
    failed: runs.length - completed.length,
    elapsedMs,
    completedCasesPerMinute: (completed.length * 60_000) / elapsedMs,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
  };
}

/** Estimate model token charges only; rates must come from the caller's rate card. */
export function estimateModelCost({
  calls,
  rates,
}: {
  calls: EvaluationCallMetric[];
  rates?: ModelRates;
}): number | null {
  if (
    !rates ||
    !rates.source ||
    !calls.length ||
    [rates.inputUsdPerMillion, rates.cachedInputUsdPerMillion, rates.outputUsdPerMillion].some(
      (rate) => !Number.isFinite(rate) || rate < 0,
    )
  )
    return null;
  let cost = 0;
  for (const call of calls) {
    if (
      call.model !== rates.model ||
      call.inputTokens === null ||
      call.totalTokens === null ||
      call.totalTokens < call.inputTokens ||
      (call.cachedInputTokens ?? 0) > call.inputTokens
    )
      return null;
    // Total usage includes thinking. An absent cache count is charged at the
    // uncached rate, so this estimate does not invent a cache discount.
    const cached = call.cachedInputTokens ?? 0;
    const uncached = call.inputTokens - cached;
    const billedOutput = call.totalTokens - call.inputTokens;
    cost +=
      (uncached * rates.inputUsdPerMillion +
        cached * rates.cachedInputUsdPerMillion +
        billedOutput * rates.outputUsdPerMillion) /
      1_000_000;
  }
  return cost;
}
