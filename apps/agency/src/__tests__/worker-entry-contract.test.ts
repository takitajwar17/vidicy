import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("worker entry contract", () => {
  it("points wrangler at the checked-in custom worker entry", () => {
    const wranglerConfig = readFile("wrangler.jsonc");

    expect(wranglerConfig).toContain('"main": "worker.ts"');
    expect(wranglerConfig).not.toContain('"main": ".open-next/worker.js"');
  });

  it("re-exports the OpenNext queue durable object from the custom worker", () => {
    const workerEntry = readFile("worker.ts");

    expect(workerEntry).toContain('export { DOQueueHandler } from "./.open-next/worker.js";');
  });

  it("aliases the app database binding away from the OpenNext internal name", () => {
    const workerEntry = readFile("worker.ts");

    expect(workerEntry).toContain("const database = env.NEXT_TAG_CACHE_D1;");
    expect(workerEntry).toContain("APP_D1: database");
  });
});
