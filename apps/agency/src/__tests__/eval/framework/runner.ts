/**
 * Evaluation suite runner.
 *
 * Executes test cases against metrics, aggregates results,
 * and optionally compares against saved baselines for regression detection.
 */

import type {
  EvalTestCase,
  EvalMetric,
  CaseResult,
  MetricAggregate,
  EvalRunResult,
  BaselineEntry,
  RegressionFlag,
} from "./types";

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunOptions<TOutput, TExpected> {
  /** Suite name for reporting */
  suiteName: string;
  /** Test cases to evaluate */
  cases: EvalTestCase<unknown, TExpected>[];
  /** Metrics to score each output against */
  metrics: EvalMetric<TOutput, TExpected>[];
  /**
   * Function that produces an LLM output from a test case input.
   * This is where the actual LLM call (or mock) happens.
   */
  producer: (testCase: EvalTestCase<unknown, TExpected>) => Promise<TOutput>;
  /** Optional baseline for regression comparison */
  baseline?: BaselineEntry;
  /** Regression threshold (fractional, e.g. 0.05 = 5%) */
  regressionThreshold?: number;
  /** Delay between API calls in ms (default: 2000) to avoid rate limits */
  delayBetweenCasesMs?: number;
  /** Max retries on rate limit (429) errors (default: 3) */
  maxRetries?: number;
  /** Mark remaining cases unmeasured after an unrecovered producer failure. */
  stopOnProducerError?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes("429") ||
      err.message.includes("rate limit") ||
      err.message.includes("quota")
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run an evaluation suite: produce outputs, score them, aggregate, check regressions.
 */
export async function runEvalSuite<TOutput, TExpected>(
  options: RunOptions<TOutput, TExpected>,
): Promise<{ result: EvalRunResult; regressions: RegressionFlag[] }> {
  const {
    suiteName,
    cases,
    metrics: evalMetrics,
    producer,
    baseline,
    regressionThreshold = 0.05,
    delayBetweenCasesMs = 2000,
    maxRetries = 3,
    stopOnProducerError = false,
  } = options;

  const caseResults: CaseResult[] = [];

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i];

    // Delay between cases to avoid rate limiting
    if (i > 0) {
      await sleep(delayBetweenCasesMs);
    }

    const start = Date.now();
    let output: TOutput;
    let lastError: unknown;

    // Retry with exponential backoff on rate limit errors
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffMs = Math.min(2000 * Math.pow(2, attempt), 30000);
          console.log(
            `  ⏳ Rate limited on "${testCase.id}", retry ${attempt}/${maxRetries} after ${backoffMs}ms`,
          );
          await sleep(backoffMs);
        }
        output = await producer(testCase);
        lastError = undefined;
        break;
      } catch (err) {
        lastError = err;
        if (!isRateLimitError(err) || attempt === maxRetries) break;
      }
    }

    if (lastError) {
      caseResults.push({
        executionStatus: "failed",
        caseId: testCase.id,
        description: testCase.description,
        scores: evalMetrics.map((m) => ({
          name: m.name,
          score: 0,
          passed: false,
          measured: false,
          detail: `Producer error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        })),
        passed: false,
        latencyMs: Date.now() - start,
      });
      if (stopOnProducerError) {
        for (const pendingCase of cases.slice(i + 1)) {
          caseResults.push({
            executionStatus: "not_run",
            caseId: pendingCase.id,
            description: pendingCase.description,
            scores: evalMetrics.map((metric) => ({
              name: metric.name,
              score: 0,
              passed: false,
              measured: false,
              detail: "Not measured after an unrecovered producer failure",
            })),
            passed: false,
          });
        }
        break;
      }
      continue;
    }

    const latencyMs = Date.now() - start;

    const scores = await Promise.all(
      evalMetrics.map((metric) =>
        metric.score({
          output: output as TOutput,
          expected: testCase.expected as TExpected,
          input: testCase.input,
          context: testCase.context,
        }),
      ),
    );

    const measuredScores = scores.filter((score) => score.measured !== false);
    const allPassed = measuredScores.length > 0 && measuredScores.every((score) => score.passed);

    caseResults.push({
      executionStatus: "completed",
      caseId: testCase.id,
      description: testCase.description,
      scores,
      passed: allPassed,
      latencyMs,
    });
  }

  // Aggregate per-metric stats
  const aggregates = aggregateMetrics(caseResults, evalMetrics);

  const overallPassed = caseResults.every((c) => c.passed);

  const result: EvalRunResult = {
    operational: {
      attempted: caseResults.filter((item) => item.executionStatus !== "not_run").length,
      completed: caseResults.filter((item) => item.executionStatus === "completed").length,
      failed: caseResults.filter((item) => item.executionStatus === "failed").length,
      notRun: caseResults.filter((item) => item.executionStatus === "not_run").length,
    },
    suiteName,
    timestamp: new Date().toISOString(),
    caseResults,
    aggregates,
    overallPassed,
  };

  // Regression detection
  const regressions = baseline
    ? detectRegressions(aggregates, baseline.aggregates, regressionThreshold)
    : [];

  return { result, regressions };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function aggregateMetrics(
  caseResults: CaseResult[],
  evalMetrics: EvalMetric<unknown, unknown>[],
): MetricAggregate[] {
  return evalMetrics.map((metric) => {
    const allScores = caseResults.flatMap((c) => c.scores).filter((s) => s.name === metric.name);
    const measured = allScores.filter((score) => score.measured !== false);
    const scores = measured.map((score) => score.score);
    const passed = measured.filter((score) => score.passed).length;

    return {
      name: metric.name,
      measuredCount: measured.length,
      unmeasuredCount: allScores.length - measured.length,
      mean: scores.length ? mean(scores) : null,
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
      stdDev: scores.length ? stdDev(scores) : null,
      passRate: scores.length ? passed / scores.length : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Regression detection
// ---------------------------------------------------------------------------

function detectRegressions(
  current: MetricAggregate[],
  baseline: MetricAggregate[],
  thresholdPct: number,
): RegressionFlag[] {
  const flags: RegressionFlag[] = [];

  for (const curr of current) {
    const base = baseline.find((b) => b.name === curr.name);
    if (!base || base.mean === null || curr.mean === null) continue;

    const delta = base.mean - curr.mean; // positive = regression
    if (base.mean > 0 && delta / base.mean > thresholdPct) {
      flags.push({
        metric: curr.name,
        baselineScore: base.mean,
        currentScore: curr.mean,
        delta,
        thresholdPct,
      });
    }
  }

  return flags;
}
