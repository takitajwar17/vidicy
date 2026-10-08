import { afterEach, describe, expect, it, vi } from "vitest";

const { values, work, redis } = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    work: [] as Promise<unknown>[],
    redis: {
      isReady: true,
      isOpen: true,
      listenerCount: () => 1,
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      sendCommand: vi.fn(async (args: string[]) => {
        const key = args[3];
        const next = Number(values.get(key) ?? 0) + 1;
        values.set(key, String(next));
        return next;
      }),
    },
  };
});
vi.mock("redis", () => ({ createClient: () => redis }));
vi.mock("@/infra/runtime-context", async () => {
  const { createGoogleKV } = await import("@/infra/google/kv");
  return {
    getRuntimeContext: () => ({
      env: { APP_KV: createGoogleKV({ namespace: "vidicy:app:" }) },
      ctx: { waitUntil: (promise: Promise<unknown>) => work.push(promise) },
    }),
  };
});
vi.mock("@/infra/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { trackUsage, getUserUsage, USAGE_EVENTS } from "@/infra/usage-tracking";

afterEach(() => vi.unstubAllEnvs());

describe("usage counters", () => {
  it("keeps every concurrent event and holds the work in the request lifecycle", async () => {
    vi.stubEnv("REDIS_URL", "redis://unused.test");
    for (let index = 0; index < 50; index++) {
      trackUsage({ userId: "user_1", event: USAGE_EVENTS.CHAT_MESSAGE_SENT });
    }
    await vi.waitFor(() => expect(values.size).toBe(2));
    await Promise.all(work);
    const now = new Date().toISOString();
    expect(
      await getUserUsage({
        userId: "user_1",
        event: USAGE_EVENTS.CHAT_MESSAGE_SENT,
        period: now.slice(0, 10),
      }),
    ).toBe(50);
    expect(
      await getUserUsage({
        userId: "user_1",
        event: USAGE_EVENTS.CHAT_MESSAGE_SENT,
        period: now.slice(0, 7),
      }),
    ).toBe(50);
    expect(work).toHaveLength(50);
    expect(redis.sendCommand).toHaveBeenCalledWith([
      "EVAL",
      expect.stringContaining("EXPIRE"),
      "1",
      expect.stringMatching(/^vidicy:app:usage:/),
      String(90 * 24 * 60 * 60),
    ]);
  });
});
