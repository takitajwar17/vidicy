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
