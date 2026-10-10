import "server-only";
import { randomUUID } from "node:crypto";
import { getRedis } from "./kv";

// The lease outlives the adapter's maximum 120-second attempt. A stopped process
// releases capacity when the lease expires; its token cannot release another call.
const LEASE_MS = 135_000;
const KEY = "vidicy:provider:gemini:active";
const COOLDOWN_KEY = "vidicy:provider:gemini:cooldown";
const ACQUIRE = `local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000);
if redis.call('PTTL',KEYS[2]) > 0 then return 0 end;
redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now);
if redis.call('ZCARD',KEYS[1]) >= tonumber(ARGV[1]) then return 0 end;
redis.call('ZADD',KEYS[1],now+tonumber(ARGV[3]),ARGV[2]); redis.call('PEXPIRE',KEYS[1],ARGV[3]); return 1`;

export async function withGeminiCapacity<T>({
  timeoutMs,
  run,
}: {
  timeoutMs: number;
  run: (remainingMs: number) => Promise<T>;
}): Promise<T> {
  const limit = Number(process.env.GEMINI_GLOBAL_CONCURRENCY ?? 4);
  if (!Number.isInteger(limit) || limit < 1 || limit > 32)
    throw new Error("Invalid Gemini concurrency limit");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000)
    throw new Error("Invalid Gemini capacity deadline");
  const token = randomUUID();
  const deadline = performance.now() + timeoutMs;
  const redis = await getRedis();
  let acquired = false;
  try {
    while (performance.now() < deadline) {
      const result: unknown = await redis.sendCommand([
        "EVAL",
        ACQUIRE,
        "2",
        KEY,
        COOLDOWN_KEY,
        String(limit),
        token,
        String(LEASE_MS),
      ]);
      if (result === 1) {
        acquired = true;
        break;
      }
      if (result !== 0) throw new Error("Invalid Gemini capacity response");
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(150, Math.max(1, deadline - performance.now()))),
      );
    }
    if (!acquired || performance.now() >= deadline)
      throw new Error("Gemini capacity deadline exceeded");
    try {
      return await run(Math.max(1, Math.floor(deadline - performance.now())));
    } catch (error) {
      // All instances pause after a provider rejection. Local retry loops alone
      // would let other cases immediately refill the released capacity.
      if (error && typeof error === "object" && "status" in error && error.status === 429)
        await redis.set(COOLDOWN_KEY, "1", { PX: 30_000 }).catch(() => undefined);
      throw error;
    }
  } finally {
    // Failure to release leaves a bounded lease. Do not hide the model result or
    // bypass capacity on Redis errors; the next acquisition still fails closed.
    if (acquired) await redis.zRem(KEY, token).catch(() => undefined);
  }
}
