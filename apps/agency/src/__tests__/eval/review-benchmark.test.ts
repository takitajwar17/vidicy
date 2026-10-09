import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import { DEFAULT_EVALUATION_CONCURRENCY, runCaseEvaluation } from "@/services/case-evaluation";
import { withEvaluationMetrics } from "@/infra/evaluation-metrics";
import { GEMINI_DOCUMENT_EVALUATION_MODEL } from "@/lib/gemini";
import { loadEvaluationCases } from "./datasets/load-evaluation-cases";
import { prepareEvaluationInput } from "./datasets/prepare-evaluation-input";
import { estimateModelCost, runBenchmark, summarizeBenchmark } from "./framework/benchmark";
import { itemStatusAgreement, recommendationCoverage } from "./framework/metrics";

function integerOption({ name, fallback, max }: { name: string; fallback: number; max: number }) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  return value;
}

describe.skipIf(process.env.RUN_REVIEW_BENCHMARK !== "true")("Production review benchmark", () => {
  it(
    "records production Gemini throughput, usage, and synthetic reference checks",
    { timeout: 1_800_000 },
    async () => {
      const dataset = await loadEvaluationCases({ path: process.env.EVALUATION_CASES_FILE });
      const limit = integerOption({ name: "BENCHMARK_CASES", fallback: 2, max: 100 });
      const repeats = integerOption({ name: "BENCHMARK_REPEATS", fallback: 1, max: 10 });
      const concurrency = integerOption({ name: "BENCHMARK_CONCURRENCY", fallback: 1, max: 8 });
      const documentConcurrency = integerOption({
        name: "BENCHMARK_DOCUMENT_CONCURRENCY",
        fallback: DEFAULT_EVALUATION_CONCURRENCY,
        max: 8,
      });
      const selected = dataset.cases.slice(0, limit);
      const items = Array.from({ length: repeats }, () => selected).flat();
      if (items.length > 100) throw new Error("A benchmark must not exceed 100 review cases");
      const rates = process.env.MODEL_RATES_FILE
        ? z
            .object({
              model: z.literal(GEMINI_DOCUMENT_EVALUATION_MODEL),
              inputUsdPerMillion: z.number().nonnegative(),
              cachedInputUsdPerMillion: z.number().nonnegative(),
              outputUsdPerMillion: z.number().nonnegative(),
              source: z.string().min(1),
            })
            .parse(JSON.parse(await readFile(process.env.MODEL_RATES_FILE, "utf8")))
        : undefined;
      const sourceSha256 = createHash("sha256")
        .update(await readFile("src/services/case-evaluation.ts"))
        .update(await readFile("src/lib/gemini-evaluation.ts"))
        .update(await readFile("src/__tests__/eval/datasets/prepare-evaluation-input.ts"))
        .digest("hex");
      const metricSourceSha256 = createHash("sha256")
        .update(await readFile("src/__tests__/eval/framework/metrics.ts"))
        .digest("hex");
      const measured = await runBenchmark({
        items,
        concurrency,
        run: async (testCase) => {
          const measurement = await withEvaluationMetrics({
            run: async () => {
              try {
                return {
                  result: await runCaseEvaluation({
                    ...prepareEvaluationInput({ input: testCase.input }),
                    maxConcurrency: documentConcurrency,
                  }),
                };
              } catch {
                return { result: null };
              }
            },
          });
          const output = measurement.result.result;
          const modelCompleted =
            !!output &&
            !output.diagnostics.orchestratorFallback &&
            (!output.diagnostics.skepticalAttempted || output.diagnostics.skepticalSucceeded);
          const expected = testCase.expected;
          const text = output
            ? [
                output.evaluationData.summary,
                ...output.evaluationData.redFlags,
                ...Object.values(output.evaluationData.itemFeedback).flatMap(
                  (item) => item.issues ?? [],
                ),
              ]
                .join(" ")
                .toLowerCase()
            : "";
          return {
            caseId: testCase.id,
            modelCompleted,
            diagnostics: output?.diagnostics ?? null,
            score: output?.evaluationData.overallScore ?? null,
            riskLevel: output?.evaluationData.riskLevel ?? null,
            referenceLabelChecks: output
              ? await Promise.all([
                  itemStatusAgreement().score({ output: output.evaluationData, expected }),
                  recommendationCoverage().score({ output: output.evaluationData, expected }),
                ])
              : null,
            scoreInReferenceRange:
              !!output &&
              output.evaluationData.overallScore >= expected.scoreRange.min &&
              output.evaluationData.overallScore <= expected.scoreRange.max,
            riskMatchesReference:
              !!output && output.evaluationData.riskLevel === expected.expectedRiskLevel,
            referenceFlags: (expected.expectedRedFlags ?? []).map((flag) => ({
              flag,
              matched: text.includes(flag.toLowerCase()),
            })),
            // Keep outputs and document text out of the artifact, especially for supplied cases.
            calls: measurement.calls,
            estimatedModelCostUsd: estimateModelCost({ calls: measurement.calls, rates }),
          };
        },
      });
      const runs = measured.runs.map((run) => ({
        ...run,
        status: run.value?.modelCompleted ? ("succeeded" as const) : ("failed" as const),
      }));
      const summary = summarizeBenchmark({ ...measured, runs });
      const costs = runs.map((run) => run.value?.estimatedModelCostUsd ?? null);
      const callCosts = runs.flatMap((run) =>
        (run.value?.calls ?? []).map((call) => estimateModelCost({ calls: [call], rates })),
      );
      const totalModelCostUsd = costs.every((cost) => cost !== null)
        ? costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0)
        : null;
      const report = {
        formatVersion: 1,
        scope:
          "Production prepared-evidence Gemini review core; excludes upload, extraction, retrieval services, SQL publication, HTTP capacity, and email.",
        method:
          "Closed-loop concurrent case workers; completed latency uses nearest-rank percentiles. No warm-up or steady-state capacity claim.",
        model: GEMINI_DOCUMENT_EVALUATION_MODEL,
        sourceSha256,
        metricSourceSha256,
        commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
        workingTreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
          encoding: "utf8",
        }).trim(),
        dataset: {
          provenance: dataset.provenance,
          sha256: createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
          selectedCaseIds: selected.map((testCase) => testCase.id),
          referenceDates: selected.map((testCase) => ({
            caseId: testCase.id,
            asOfDate: testCase.input.asOfDate ?? "current UTC date",
          })),
        },
        concurrency,
        documentConcurrency,
        repeats,
        summary,
        cost: {
          totalModelCostUsd,
          estimatedKnownModelCostUsd: rates
            ? callCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0)
            : null,
          unpricedCalls: callCosts.filter((cost) => cost === null).length,
          estimatedModelCostPerCompletedCaseUsd:
            totalModelCostUsd !== null && summary.succeeded
              ? totalModelCostUsd / summary.succeeded
              : null,
          rates: rates ?? null,
          limitation:
            "Token estimate using supplied rates, not a billing invoice. Total minus input tokens includes reasoning output. Missing cache counts receive no discount. Missing total/input usage or rates produce null; infrastructure costs excluded.",
        },
        runs,
      };
      const path = resolve(
        process.env.BENCHMARK_OUTPUT ?? `output/verification/review-benchmark-${randomUUID()}.json`,
      );
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ output: path, summary, totalModelCostUsd }));
      expect(summary.succeeded, "Some model stages failed; inspect the saved report").toBe(
        items.length,
      );
    },
  );
});
