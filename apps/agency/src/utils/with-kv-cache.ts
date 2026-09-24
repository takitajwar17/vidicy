import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import ms from "ms";
import isProd from "./is-prod";

interface CacheOptions {
  key: string;
  ttl: string; // e.g., "1h", "5m", "1d"
  staleWhileRevalidate?: string; // e.g., "5m" — serve stale value while recomputing in background
}

export async function withKVCache<T>(
  fn: () => Promise<T>,
  { key, ttl, staleWhileRevalidate }: CacheOptions
): Promise<T> {
  // In development mode, always bypass the cache
  if (!isProd) {
    return fn();
  }

  const { env } = await getCloudflareContext({ async: true });
  const kv = env.NEXT_INC_CACHE_KV;

  if (!kv) {
    throw new Error("Can't connect to KV store");
  }

  // Try to get the cached value with metadata
  const cached = await kv.getWithMetadata<T>(key, "json");
  if (cached.value !== null) {
    // Check if value is stale (past TTL but within stale window)
    const metadata = cached.metadata as { storedAt?: number } | null;
    const ttlMs = ms(ttl);
    const storedAt = metadata?.storedAt ?? 0;
    const age = Date.now() - storedAt;

    if (age < ttlMs) {
      // Fresh — return immediately
      return cached.value;
    }

    if (staleWhileRevalidate && age < ttlMs + ms(staleWhileRevalidate)) {
      // Stale but within revalidation window — return stale value, recompute in background
      void revalidateCache(fn, key, ttl, staleWhileRevalidate, kv);
      return cached.value;
    }
  }

  // Cache miss or expired beyond stale window — compute fresh
  const result = await fn();

  const totalTtlSeconds = staleWhileRevalidate
    ? Math.floor((ms(ttl) + ms(staleWhileRevalidate)) / 1000)
    : Math.floor(ms(ttl) / 1000);

  await kv.put(key, JSON.stringify(result), {
    expirationTtl: totalTtlSeconds,
    metadata: { storedAt: Date.now() },
  });

  return result;
}

async function revalidateCache<T>(
  fn: () => Promise<T>,
  key: string,
  ttl: string,
  staleWhileRevalidate: string,
  kv: KVNamespace
) {
  try {
    const result = await fn();
    const totalTtlSeconds = Math.floor((ms(ttl) + ms(staleWhileRevalidate)) / 1000);
    await kv.put(key, JSON.stringify(result), {
      expirationTtl: totalTtlSeconds,
      metadata: { storedAt: Date.now() },
    });
  } catch {
    // Silently fail — stale value already served
  }
}

const STATS_PREFIX = "stats";

export const CACHE_KEYS = {
  TOTAL_USERS: `${STATS_PREFIX}:total-users`,
} as const;
