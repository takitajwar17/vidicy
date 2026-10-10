import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const requireNext = createRequire(require.resolve("next/package.json"));
const env = requireNext("@next/env");
env.loadEnvConfig(process.cwd(), true);
const live = process.argv.includes("--live");
const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "src/__tests__/eval/workflow-benchmark.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RUN_WORKFLOW_BENCHMARK: "true",
      WORKFLOW_LIVE: String(live),
      WORKFLOW_BENCHMARK_OUTPUT:
        process.env.WORKFLOW_BENCHMARK_OUTPUT ??
        `output/verification/workflow-${live ? "live" : "isolated"}-${Date.now()}.json`,
    },
  },
);
process.exitCode = result.status ?? 1;
