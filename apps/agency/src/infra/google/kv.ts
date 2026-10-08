import "server-only";

import { createClient } from "redis";
import { logger } from "@/infra/logger";

interface GoogleKVPutOptions {
  expirationTtl?: number;
  expiration?: number;
}

interface GoogleKVListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
}

export interface GoogleKVListResult {
  keys: Array<{ name: string; expiration?: number }>;
  list_complete: boolean;
  cursor: string;
}

/** String and JSON operations used by sessions, tokens, rate limits and caches. */
export interface GoogleKVNamespace {
  increment(options: { key: string; expirationTtl: number }): Promise<number>;
  get(key: string): Promise<string | null>;
  get<T = unknown>(key: string, type: "json" | { type: "json"; cacheTtl?: number }): Promise<T | null>;
  get(key: string, type: "text" | { type: "text"; cacheTtl?: number }): Promise<string | null>;
  put(key: string, value: string, options?: GoogleKVPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: GoogleKVListOptions): Promise<GoogleKVListResult>;
}

type RedisClient = ReturnType<typeof createClient>;
interface RedisState {
  client?: RedisClient;
  connection?: Promise<RedisClient>;
}

const processState = globalThis as typeof globalThis & { __vidicyRedisState?: RedisState };

async function getRedis(): Promise<RedisClient> {
  const state = processState.__vidicyRedisState ??= {};
  if (state.client?.isReady) return state.client;
  if (state.connection) return state.connection;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL is required");
  const client = state.client ??= createClient({
    url: redisUrl,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 10_000,
      reconnectStrategy(retries) {
        return retries < 8 ? Math.min(250 * 2 ** retries, 5000) : false;
      },
    },
  });
  // Redis emits errors separately from command rejections. Never log connection
  // errors verbatim: they can contain the authenticated Redis connection URL.
  if (client.listenerCount("error") === 0) {
    client.on("error", () => logger.warn("Memorystore connection error"));
  }
  state.connection = (async function () {
    try {
      if (!client.isOpen) await client.connect();
      if (!client.isReady) throw new Error("Memorystore is not ready");
      return client;
    } catch {
      if (client.isOpen) client.destroy();
      state.client = undefined;
      throw new Error("Cannot connect to Memorystore");
    } finally {
      state.connection = undefined;
    }
  })();
  return state.connection;
}

function escapeGlob(value: string): string {
  return value.replace(/[\\*?\[\]]/g, "\\$&");
}

interface ScanCursor {
  namespace: string;
  prefix: string;
  next: string;
  pending: string[];
}

function decodeCursor({ value, namespace, prefix }: { value?: string; namespace: string; prefix: string }): ScanCursor {
  if (!value) return { namespace, prefix, next: "0", pending: [] };
  if (value.length > 2_000_000) throw new Error("Invalid KV list cursor");
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ScanCursor;
    if (cursor.namespace !== namespace || cursor.prefix !== prefix || !/^\d+$/.test(cursor.next)
      || !Array.isArray(cursor.pending) || !cursor.pending.every(key => typeof key === "string" && key.startsWith(`${namespace}${prefix}`))) {
      throw new Error("Invalid cursor");
    }
    return cursor;
  } catch {
    throw new Error("Invalid KV list cursor");
  }
}

/** Isolate each former Cloudflare namespace inside one Memorystore instance. */
export function createGoogleKV({ namespace }: { namespace: string }): GoogleKVNamespace {
  if (!/^vidicy:[a-z0-9_-]+:$/.test(namespace)) throw new Error("Invalid Memorystore namespace prefix");

  function getValue(key: string): Promise<string | null>;
  function getValue<T = unknown>(key: string, type: "json" | { type: "json"; cacheTtl?: number }): Promise<T | null>;
  function getValue(key: string, type: "text" | { type: "text"; cacheTtl?: number }): Promise<string | null>;
  async function getValue<T = unknown>(key: string, type?: "json" | "text" | { type: "json" | "text"; cacheTtl?: number }): Promise<T | string | null> {
    const value = await (await getRedis()).get(`${namespace}${key}`);
    if (value === null) return null;
    return (typeof type === "string" ? type : type?.type) === "json" ? JSON.parse(value) as T : value;
  }

  return {
    get: getValue,
    async increment({ key, expirationTtl }) {
      if (!Number.isInteger(expirationTtl) || expirationTtl < 1) throw new Error("Invalid counter expiration");
      const redis = await getRedis();
      // Increment and expiry must be one operation, including concurrent events.
      const result = await redis.sendCommand([
        "EVAL", "local count = redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], ARGV[1]); return count",
        "1", `${namespace}${key}`, String(expirationTtl),
      ]);
      if (typeof result !== "number") throw new Error("Invalid counter result");
      return result;
    },
    async put(key, value, options = {}) {
      const redis = await getRedis();
      const fullKey = `${namespace}${key}`;
      if (options.expiration !== undefined && options.expirationTtl !== undefined) {
        throw new Error("KV expiration and expirationTtl cannot both be set");
      }
      if (options.expirationTtl !== undefined) {
        if (!Number.isFinite(options.expirationTtl)) throw new Error("Invalid KV expirationTtl");
        const seconds = Math.floor(options.expirationTtl);
        if (seconds <= 0) { await redis.del(fullKey); return; }
        await redis.set(fullKey, value, { EX: seconds });
      } else if (options.expiration !== undefined) {
        if (!Number.isFinite(options.expiration)) throw new Error("Invalid KV expiration");
        const expiresAt = Math.floor(options.expiration);
        if (expiresAt <= Math.floor(Date.now() / 1000)) { await redis.del(fullKey); return; }
        await redis.set(fullKey, value, { EXAT: expiresAt });
      } else {
        await redis.set(fullKey, value);
      }
    },
    async delete(key) { await (await getRedis()).del(`${namespace}${key}`); },
    async list(options = {}) {
      const redis = await getRedis();
      const prefix = options.prefix ?? "";
      const limit = options.limit ?? 1000;
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("KV list limit must be between 1 and 1000");
      const cursor = decodeCursor({ value: options.cursor, namespace, prefix });
      const collected = new Set(cursor.pending.splice(0, limit));
      // Redis COUNT is a hint. Preserve excess matches in the opaque cursor so
      // pagination does not discard keys when SCAN returns more than requested.
      let hasScanned = Boolean(options.cursor);
      while (collected.size < limit && (!hasScanned || cursor.next !== "0")) {
        const result = await redis.sendCommand(["SCAN", cursor.next, "MATCH", `${escapeGlob(`${namespace}${prefix}`)}*`, "COUNT", "250"]);
        if (!Array.isArray(result) || result.length !== 2) throw new Error("Invalid Memorystore SCAN response");
        const [next, keys] = result;
        if (typeof next !== "string" || !Array.isArray(keys) || !keys.every((key): key is string => typeof key === "string")) {
          throw new Error("Invalid Memorystore SCAN response");
        }
        cursor.next = String(next);
        hasScanned = true;
        for (const key of keys) {
          if (!key.startsWith(`${namespace}${prefix}`) || collected.has(key)) continue;
          if (collected.size < limit) collected.add(key);
          else cursor.pending.push(key);
        }
      }
      const names = [...collected];
      const expirations = await Promise.all(names.map(name => redis.ttl(name)));
      const nowSeconds = Math.floor(Date.now() / 1000);
      const listComplete = cursor.next === "0" && cursor.pending.length === 0;
      return {
        keys: names.flatMap((name, index) => {
          const ttl = expirations[index];
          if (ttl === -2) return [];
          return [{ name: name.slice(namespace.length), ...(ttl >= 0 ? { expiration: nowSeconds + ttl } : {}) }];
        }),
        list_complete: listComplete,
        cursor: listComplete ? "" : Buffer.from(JSON.stringify(cursor)).toString("base64url"),
      };
    },
  };
}

export const appKV = createGoogleKV({ namespace: "vidicy:app:" });
