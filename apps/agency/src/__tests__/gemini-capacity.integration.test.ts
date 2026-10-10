import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { startTestRedis } from "./helpers/redis";
const state = vi.hoisted(() => ({ redis: vi.fn() }));
vi.mock("@/infra/google/kv", () => ({ getRedis: state.redis }));
import { withGeminiCapacity } from "@/infra/google/gemini-capacity";
let redis: Awaited<ReturnType<typeof startTestRedis>>;
beforeAll(async () => {
  redis = await startTestRedis();
});
afterAll(async () => {
  await redis.stop();
});
beforeEach(async () => {
  await redis.clients[0].flushDb();
  let i = 0;
  state.redis.mockReset().mockImplementation(async () => redis.clients[i++ % 2]);
  vi.stubEnv("GEMINI_GLOBAL_CONCURRENCY", "2");
});
afterEach(() => vi.unstubAllEnvs());

it("bounds calls from independent clients with one shared limit", async () => {
  let active = 0,
    peak = 0;
  await Promise.all(
    Array.from({ length: 10 }, () =>
      withGeminiCapacity({
        timeoutMs: 5000,
        run: async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active--;
        },
      }),
    ),
  );
  expect(peak).toBe(2);
  expect(await redis.clients[0].zCard("vidicy:provider:gemini:active")).toBe(0);
});
it("releases capacity after failure", async () => {
  await expect(
    withGeminiCapacity({
      timeoutMs: 1000,
      run: async () => {
        throw new Error("provider failure");
      },
    }),
  ).rejects.toThrow("provider failure");
  expect(await redis.clients[0].zCard("vidicy:provider:gemini:active")).toBe(0);
});
it("recovers expired leases and never removes an active owner's lease", async () => {
  await redis.clients[0].zAdd("vidicy:provider:gemini:active", [
    { score: Date.now() - 1000, value: "dead" },
    { score: Date.now() + 100000, value: "active" },
  ]);
  await withGeminiCapacity({ timeoutMs: 1000, run: async () => undefined });
  expect(await redis.clients[0].zRange("vidicy:provider:gemini:active", 0, -1)).toEqual(["active"]);
});
it("does not call the provider after the capacity deadline", async () => {
  vi.stubEnv("GEMINI_GLOBAL_CONCURRENCY", "1");
  await redis.clients[0].zAdd("vidicy:provider:gemini:active", {
    score: Date.now() + 100000,
    value: "busy",
  });
  const run = vi.fn();
  await expect(withGeminiCapacity({ timeoutMs: 30, run })).rejects.toThrow("deadline");
  expect(run).not.toHaveBeenCalled();
});
it("fails closed when Redis is unavailable", async () => {
  state.redis.mockRejectedValue(new Error("unavailable"));
  const run = vi.fn();
  await expect(withGeminiCapacity({ timeoutMs: 1000, run })).rejects.toThrow("unavailable");
  expect(run).not.toHaveBeenCalled();
});

it("pauses other callers after a provider rate limit", async () => {
  await expect(
    withGeminiCapacity({
      timeoutMs: 1000,
      run: async () => {
        throw Object.assign(new Error("provider busy"), { status: 429 });
      },
    }),
  ).rejects.toThrow("provider busy");
  expect(await redis.clients[1].pTTL("vidicy:provider:gemini:cooldown")).toBeGreaterThan(0);
  const run = vi.fn();
  await expect(withGeminiCapacity({ timeoutMs: 20, run })).rejects.toThrow("deadline");
  expect(run).not.toHaveBeenCalled();
  await redis.clients[1].del("vidicy:provider:gemini:cooldown");
  await withGeminiCapacity({ timeoutMs: 1000, run: async () => "recovered" });
});
