import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { logger } from "@/infra/logger";
import { RATE_LIMIT_WINDOW_SECONDS } from "@/constants";
import { ZSAError } from "zsa";

/**
 * Per-user rate limiter for server actions, backed by Cloudflare KV.
 * Uses a sliding 1-hour window counter. Non-fatal in local dev (KV unavailable).
 *
 * NOTE (R04): The read-check-write below is not atomic — under concurrent burst traffic,
 * multiple requests can read the same count and all pass the check. At <10k concurrent
 * users this is acceptable. For true atomicity, migrate to Cloudflare Durable Objects.
 *
 * @param action  Short identifier for the action (used in KV key)
 * @param userId  User to track
 * @param limit   Max calls allowed within the 1-hour window
 */
export async function checkActionRateLimit(action: string, userId: string, limit: number): Promise<void> {
  let kv: KVNamespace | undefined;
  try {
    const { env } = getCloudflareContext();
    kv = env.APP_KV as KVNamespace | undefined;
  } catch { /* not in Workers context — skip rate limiting in local dev */ }

  if (!kv) return; // local dev — no KV, allow everything

  const key = `rl:${action}:${userId}`;
  const WINDOW_SECONDS = RATE_LIMIT_WINDOW_SECONDS;

  try {
    const existing = await kv.get(key, "json") as { count: number; windowStart: number } | null;
    const now = Date.now();

    if (!existing || (now - existing.windowStart) > WINDOW_SECONDS * 1000) {
      await kv.put(key, JSON.stringify({ count: 1, windowStart: now }), { expirationTtl: WINDOW_SECONDS });
      return;
    }

    if (existing.count >= limit) {
      const windowEndsIn = Math.ceil((WINDOW_SECONDS * 1000 - (now - existing.windowStart)) / 60000);
      throw new ZSAError(
        "TOO_MANY_REQUESTS",
        `You've reached the limit for this action. Please try again in ${windowEndsIn} minute${windowEndsIn !== 1 ? "s" : ""}.`
      );
    }

    await kv.put(key, JSON.stringify({ count: existing.count + 1, windowStart: existing.windowStart }), { expirationTtl: WINDOW_SECONDS });
  } catch (err) {
    if (err instanceof ZSAError) throw err;
    logger.warn("Rate limit KV error (non-fatal)", { error: err });
  }
}
