import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  socket: "",
  client: undefined as ReturnType<typeof import("redis").createClient> | undefined,
}));
// Keep the production commands and connection lifecycle. Only route the client
// to the test's private Unix socket, which production URLs cannot select.
vi.mock("redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("redis")>();
  return {
    ...actual,
    createClient: () => {
      state.client = actual.createClient({
        socket: { path: state.socket, reconnectStrategy: false },
      });
      return state.client;
    },
  };
});
vi.mock("@/infra/logger", () => ({ logger: { warn: vi.fn() } }));
import { checkRateLimit } from "@/infra/rate-limit";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: () => ({
    env: {
      NEXT_INC_CACHE_KV: createGoogleKV({ namespace: "vidicy:cache:" }),
      APP_KV: createGoogleKV({ namespace: "vidicy:app:" }),
    },
  }),
}));
import { createGoogleKV } from "@/infra/google/kv";

let directory: string;
beforeAll(async () => {
  directory = mkdtempSync("/tmp/vidicy-redis-");
  state.socket = join(directory, "redis.sock");
  execFileSync(
    "redis-server",
    [
      "--port",
      "0",
      "--unixsocket",
      state.socket,
      "--unixsocketperm",
      "700",
      "--save",
      "",
      "--appendonly",
      "no",
      "--daemonize",
      "yes",
      "--pidfile",
      join(directory, "redis.pid"),
      "--logfile",
      join(directory, "redis.log"),
    ],
    { stdio: "ignore" },
  );
  await vi.waitFor(() => expect(existsSync(state.socket)).toBe(true));
  vi.stubEnv("REDIS_URL", "redis://unused.test");
});
afterAll(() => {
  if (state.client?.isOpen) state.client.destroy();
  try {
    if (existsSync(state.socket))
      execFileSync("redis-cli", ["-s", state.socket, "SHUTDOWN", "NOSAVE"], { stdio: "ignore" });
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});

describe("Google KV against private Redis", () => {
  const kv = createGoogleKV({ namespace: "vidicy:verify:" });

  it("allows only one concurrent request at a limit of one", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        checkRateLimit({
          key: "rate-user",
          options: { identifier: "verify", limit: 1, windowInSeconds: 60 },
        }),
      ),
    );
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.every((result) => result.remaining >= 0)).toBe(true);
  });

  it("allows only one concurrent server action at a limit of one", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => checkActionRateLimit("verify", "rate-user", 1)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(24);
  });

  it("does not reset the action quota at the next clock hour", async () => {
    const now = vi.spyOn(Date, "now");
    try {
      now.mockReturnValue(Date.UTC(2026, 9, 19, 12, 59, 59));
      await checkActionRateLimit("window-verify", "rate-user", 1);
      now.mockReturnValue(Date.UTC(2026, 9, 19, 13, 0, 0));
      await expect(checkActionRateLimit("window-verify", "rate-user", 1)).rejects.toMatchObject({
        code: "TOO_MANY_REQUESTS",
      });
    } finally {
      now.mockRestore();
    }
  });

  it("does not extend an action window when another request arrives", async () => {
    const first = await kv.incrementWindow({ key: "fixed-expiry", expirationTtl: 60 });
    expect(first).toEqual({ count: 1, remainingSeconds: 60 });
    await state.client!.expire("vidicy:verify:fixed-expiry", 1);
    const second = await kv.incrementWindow({ key: "fixed-expiry", expirationTtl: 60 });
    expect(second.count).toBe(2);
    expect(second.remainingSeconds).toBeLessThanOrEqual(1);
    await vi.waitFor(async () => expect(await kv.get("fixed-expiry")).toBeNull(), {
      timeout: 2500,
    });
    expect(await kv.incrementWindow({ key: "fixed-expiry", expirationTtl: 60 })).toEqual({
      count: 1,
      remainingSeconds: 60,
    });
  });

  it("consumes a token exactly once under concurrent requests", async () => {
    await kv.put("reset-token", "payload", { expirationTtl: 60 });
    const results = await Promise.all(Array.from({ length: 25 }, () => kv.take("reset-token")));
    expect(results.filter((value) => value === "payload")).toHaveLength(1);
    expect(results.filter((value) => value === null)).toHaveLength(24);
  });

  it("executes atomic Lua increments and expiry under concurrent calls", async () => {
    const results = await Promise.all(
      Array.from({ length: 200 }, () => kv.increment({ key: "counter", expirationTtl: 60 })),
    );
    expect(results.toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: 200 }, (_, index) => index + 1),
    );
    expect(await kv.get<number>("counter", "json")).toBe(200);
    expect(await state.client!.ttl("vidicy:verify:counter")).toBeGreaterThan(0);
  });

  it("increments existing JSON counters and removes expired keys", async () => {
    await kv.put("legacy-counter", "7");
    expect(await kv.increment({ key: "legacy-counter", expirationTtl: 1 })).toBe(8);
    await vi.waitFor(async () => expect(await kv.get("legacy-counter")).toBeNull(), {
      timeout: 2500,
    });
    expect(await kv.get<number>("counter", "json")).toBe(200);
  });
});
