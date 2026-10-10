import { defineConfig } from "vitest/config";
import path from "node:path";

// Only the parent recovery test starts this fixture in a separate process.
export default defineConfig({
  test: {
    include: ["tests/fixtures/review-worker.fixture.ts"],
    environment: "node",
    pool: "threads",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../src"),
      "server-only": path.resolve(import.meta.dirname, "../src/__tests__/mocks/server-only.ts"),
    },
  },
});
