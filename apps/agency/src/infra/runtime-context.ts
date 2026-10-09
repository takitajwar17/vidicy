import "server-only";

import { after } from "next/server";
import { createGoogleStorageBucket } from "@/infra/google/storage";
import { appKV, cacheKV } from "@/infra/google/kv";
import { createGoogleVectorIndex } from "@/infra/google/vector-search";
import { logger } from "@/infra/logger";

// These binding names preserve the existing application interfaces. All backing
// services are Google Cloud services. The compatibility cast is kept here only.
const bindings = {
  R2: createGoogleStorageBucket(),
  APP_KV: appKV,
  NEXT_INC_CACHE_KV: cacheKV,
  VECTORIZE: createGoogleVectorIndex(),
};

const env = new Proxy(bindings, {
  get(target, property) {
    if (property in target) return Reflect.get(target, property);
    return typeof property === "string" ? process.env[property] : undefined;
  },
}) as unknown as CloudflareEnv;

/** Runtime services for the Node.js deployment on Cloud Run. */
export function getRuntimeContext(_options?: { async?: boolean }) {
  return {
    env,
    cf: undefined as { country?: string; city?: string; continent?: string } | undefined,
    ctx: {
      waitUntil(work: Promise<unknown>) {
        // Attach a rejection handler immediately. Next.js after() keeps these
        // short, noncritical tasks inside the request lifecycle on Cloud Run.
        const completion = work.catch(() => logger.error("A background follow-up failed"));
        after(() => completion.then(() => undefined));
      },
    },
  };
}
