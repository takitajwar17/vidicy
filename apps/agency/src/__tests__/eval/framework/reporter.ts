/**
 * Evaluation reporter — console output and JSON persistence.
 *
 * Results are saved to logs/eval/ for trend tracking.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalRunResult, BaselineEntry, RegressionFlag } from "./types";

// ---------------------------------------------------------------------------
// Console reporter
// ---------------------------------------------------------------------------

/**
 * Print evaluation results to the console in a readable table format.
 */
export function printResults(result: EvalRunResult, regressions: RegressionFlag[] = []): void {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  EVAL: ${result.suiteName}`);
  console.log(`  ${result.timestamp}`);
  console.log(`${"═".repeat(70)}\n`);

  // Per-case results
  console.log("┌─ Per-Case Results ─────────────────────────────────────────────────┐");
  for (const c of result.caseResults) {
    const icon =
      c.executionStatus === "completed" && c.scores.every((score) => score.measured === false)
        ? "—"
        : c.passed
          ? "✅"
          : "❌";
    const latency = c.latencyMs ? ` (${c.latencyMs}ms)` : "";
    console.log(`│ ${icon} ${c.caseId}${latency}`);
    console.log(`│   ${c.description}`);

    for (const s of c.scores) {
      const sIcon = s.measured === false ? "—" : s.passed ? "✓" : "✗";
      const detail = s.detail ? ` — ${s.detail}` : "";
      console.log(
        `│     ${sIcon} ${s.name}: ${s.measured === false ? "unmeasured" : s.score.toFixed(3)}${detail}`,
      );
    }
    console.log("│");
  }
  console.log("└────────────────────────────────────────────────────────────────────┘\n");

  // Aggregate metrics
  console.log("┌─ Aggregate Metrics ────────────────────────────────────────────────┐");
  console.log("│  Metric                          Mean    Min     Max     Pass Rate  │");
  console.log("│  ─────────────────────────────────────────────────────────────────  │");
  for (const a of result.aggregates) {
    const name = a.name.padEnd(32);
    const avg = (a.mean?.toFixed(3) ?? "—").padStart(6);
    const min = (a.min?.toFixed(3) ?? "—").padStart(6);
    const max = (a.max?.toFixed(3) ?? "—").padStart(6);
    const pass = (
      a.passRate === null ? "unmeasured" : `${(a.passRate * 100).toFixed(0)}%`
    ).padStart(8);
    console.log(`│  ${name} ${avg}  ${min}  ${max}  ${pass}   │`);
  }
  console.log("└────────────────────────────────────────────────────────────────────┘\n");

  // Regressions
  if (regressions.length > 0) {
    console.log("⚠️  REGRESSIONS DETECTED:");
    for (const r of regressions) {
      console.log(
        `   ${r.metric}: ${r.baselineScore.toFixed(3)} → ${r.currentScore.toFixed(3)} ` +
          `(Δ ${(-r.delta).toFixed(3)}, threshold: ${(r.thresholdPct * 100).toFixed(0)}%)`,
      );
    }
    console.log();
  }

  // Overall
  const hasMeasuredChecks = result.aggregates.some((aggregate) => aggregate.mean !== null);
  const overallIcon = !hasMeasuredChecks
    ? "UNMEASURED"
    : result.overallPassed
      ? "✅ PASSED"
      : "❌ FAILED";
  console.log(`  Measured checks: ${overallIcon}; this does not establish immigration accuracy.\n`);
  if (result.operational)
    console.log("  Operational completion:", JSON.stringify(result.operational));
}

// ---------------------------------------------------------------------------
// JSON persistence
// ---------------------------------------------------------------------------

const EVAL_LOGS_DIR = join(process.cwd(), "logs", "eval");
const BASELINES_DIR = join(EVAL_LOGS_DIR, "baselines");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Save evaluation results to a JSON file in logs/eval/.
 * When SAVE_BASELINE env var is set, also saves as baseline.
 */
export function saveResults(result: EvalRunResult): string {
  ensureDir(EVAL_LOGS_DIR);
  const ts = result.timestamp.replace(/[:.]/g, "-");
  const fileName = `${result.suiteName}-${ts}.json`;
  const filePath = join(EVAL_LOGS_DIR, fileName);
  writeFileSync(filePath, JSON.stringify(result, null, 2));
  console.log(`  Results saved to ${filePath}`);

  if (process.env.SAVE_BASELINE === "true") {
    saveBaseline(result);
  }

  return filePath;
}

/**
 * Save current results as the baseline for future regression comparison.
 */
export function saveBaseline(result: EvalRunResult): string {
  ensureDir(BASELINES_DIR);
  const baseline: BaselineEntry = {
    suiteName: result.suiteName,
    timestamp: result.timestamp,
    aggregates: result.aggregates,
  };
  const filePath = join(BASELINES_DIR, `${result.suiteName}.json`);
  writeFileSync(filePath, JSON.stringify(baseline, null, 2));
  console.log(`  Baseline saved to ${filePath}`);
  return filePath;
}

/**
 * Load a previously saved baseline for a suite.
 */
export function loadBaseline(suiteName: string): BaselineEntry | undefined {
  const filePath = join(BASELINES_DIR, `${suiteName}.json`);
  if (!existsSync(filePath)) return undefined;

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as BaselineEntry;
  } catch {
    return undefined;
  }
}
