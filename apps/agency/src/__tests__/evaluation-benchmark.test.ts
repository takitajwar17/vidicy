import { describe, expect, it, vi } from "vitest";
import { estimateModelCost, runBenchmark, summarizeBenchmark } from "./eval/framework/benchmark";
import {
  withEvaluationMetrics,
  recordEvaluationCall,
  measureProviderCall,
} from "@/infra/evaluation-metrics";
vi.mock("@/infra/logger", () => ({ logger: { info: vi.fn() } }));

describe("evaluation measurements", () => {
  it("retains failed attempts in a supplied collector without error content", async () => {
    const calls: import("@/infra/evaluation-metrics").EvaluationCallMetric[] = [];
    await expect(
      withEvaluationMetrics({
        calls,
        run: () =>
          measureProviderCall({
            model: "embedding-test",
            stage: "embedding",
            run: async () => {
              throw new Error("private response");
            },
          }),
      }),
    ).rejects.toThrow("private response");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ status: "failed", totalTokens: null });
    expect(JSON.stringify(calls)).not.toContain("private response");
  });
  it("captures embedding and extraction token formats", async () => {
    const { calls } = await withEvaluationMetrics({
      run: async () => {
        await measureProviderCall({
          model: "embedding",
          stage: "embedding",
          run: async () => ({ usage: { prompt_tokens: 20, total_tokens: 20 } }),
        });
        await measureProviderCall({
          model: "extraction",
          stage: "extraction",
          run: async () => ({
            usageMetadata: {
              promptTokenCount: 30,
              candidatesTokenCount: 10,
              thoughtsTokenCount: 5,
              totalTokenCount: 45,
            },
          }),
        });
      },
    });
    expect(calls[0]).toMatchObject({ inputTokens: 20, totalTokens: 20 });
    expect(calls[1]).toMatchObject({
      inputTokens: 30,
      outputTokens: 10,
      thinkingTokens: 5,
      totalTokens: 45,
    });
  });
  it("limits concurrent cases, retains failures, and measures completed throughput", async () => {
    let active = 0;
    let peak = 0;
    const result = await runBenchmark({
      items: [1, 2, 3, 4, 5],
      concurrency: 2,
      run: async (item) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        if (item === 3) throw new Error("secret provider detail");
        return item;
      },
    });
    expect(peak).toBe(2);
    expect(result.runs.map((run) => run.status)).toEqual([
      "succeeded",
      "succeeded",
      "failed",
      "succeeded",
      "succeeded",
    ]);
    const summary = summarizeBenchmark(result);
    expect(summary).toMatchObject({ attempted: 5, succeeded: 4, failed: 1 });
    expect(summary.completedCasesPerMinute).toBeCloseTo((4 * 60000) / result.elapsedMs);
    expect(JSON.stringify(result)).not.toContain("secret provider detail");
  });

  it("uses nearest-rank percentiles and excludes failed latency from completed latency", () => {
    const summary = summarizeBenchmark({
      elapsedMs: 1000,
      runs: [
        { status: "succeeded", durationMs: 10, value: 1 },
        { status: "succeeded", durationMs: 30, value: 2 },
        { status: "failed", durationMs: 900 },
      ],
    });
    expect(summary).toMatchObject({ p50Ms: 10, p95Ms: 30, completedCasesPerMinute: 120 });
  });

  it("reports unknown cost when usage or an explicit rate card is missing", () => {
    expect(estimateModelCost({ calls: [], rates: undefined })).toBeNull();
    const call = {
      model: "model",
      stage: "document",
      status: "succeeded" as const,
      durationMs: 10,
      inputTokens: 1000,
      cachedInputTokens: 200,
      outputTokens: 100,
      thinkingTokens: 50,
      totalTokens: 1150,
    };
    expect(
      estimateModelCost({
        calls: [call],
        rates: {
          model: "model",
          inputUsdPerMillion: 2,
          cachedInputUsdPerMillion: 0.5,
          outputUsdPerMillion: 10,
          source: "test fixture",
        },
      }),
    ).toBeCloseTo(0.0032, 8);
    expect(
      estimateModelCost({
        calls: [{ ...call, thinkingTokens: null, cachedInputTokens: null }],
        rates: {
          model: "model",
          inputUsdPerMillion: 2,
          cachedInputUsdPerMillion: 0.5,
          outputUsdPerMillion: 10,
          source: "test",
        },
      }),
    ).toBeCloseTo(0.0035, 8);
    expect(
      estimateModelCost({
        calls: [{ ...call, inputTokens: null }],
        rates: {
          model: "model",
          inputUsdPerMillion: 2,
          cachedInputUsdPerMillion: 0.5,
          outputUsdPerMillion: 10,
          source: "test",
        },
      }),
    ).toBeNull();
  });

  it("isolates concurrent metric collectors and preserves failed call usage", async () => {
    const capture = (stage: string) =>
      withEvaluationMetrics({
        run: async () => {
          await Promise.resolve();
          recordEvaluationCall({
            model: "model",
            stage,
            status: "failed",
            durationMs: 1,
            inputTokens: null,
            cachedInputTokens: null,
            outputTokens: null,
            thinkingTokens: null,
            totalTokens: null,
          });
          return stage;
        },
      });
    const [first, second] = await Promise.all([capture("first"), capture("second")]);
    expect(first.calls.map((call) => call.stage)).toEqual(["first"]);
    expect(second.calls.map((call) => call.stage)).toEqual(["second"]);
  });
});
