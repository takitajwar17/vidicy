import "server-only";

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/db";
import { sql } from "drizzle-orm";
import { requireAdminRouteSession } from "@/app/api/_utils/request-auth";

interface ComponentStatus {
  status: "ok" | "degraded" | "down";
  latencyMs: number;
  error?: string;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  components: {
    d1: ComponentStatus;
    kv: ComponentStatus;
    r2: ComponentStatus;
  };
  version: string;
}

const HEALTH_CHECK_CANARY_KEY = "_health_check_canary";

export async function GET(): Promise<Response> {
  const access = await requireAdminRouteSession();

  if ("response" in access && access.response) {
    return access.response;
  }

  const timestamp = new Date().toISOString();
  const components: HealthResponse["components"] = {
    d1: { status: "down", latencyMs: 0 },
    kv: { status: "down", latencyMs: 0 },
    r2: { status: "down", latencyMs: 0 },
  };

  // --- D1 check: execute a trivial query ---
  const d1Start = Date.now();
  try {
    const db = getDB();
    await db.run(sql`SELECT 1`);
    components.d1 = { status: "ok", latencyMs: Date.now() - d1Start };
  } catch (err) {
    components.d1 = {
      status: "down",
      latencyMs: Date.now() - d1Start,
      error: err instanceof Error ? err.message : "D1 unreachable",
    };
  }

  // --- KV check: write, read, delete a canary key ---
  const kvStart = Date.now();
  try {
    const { env } = await getCloudflareContext({ async: true });
    const kv = env.APP_KV as KVNamespace | undefined;

    if (!kv) throw new Error("APP_KV binding not available");

    const canaryValue = Date.now().toString();
    await kv.put(HEALTH_CHECK_CANARY_KEY, canaryValue, { expirationTtl: 60 });
    const readBack = await kv.get(HEALTH_CHECK_CANARY_KEY);
    await kv.delete(HEALTH_CHECK_CANARY_KEY);

    if (readBack !== canaryValue) throw new Error("KV read-back mismatch");

    components.kv = { status: "ok", latencyMs: Date.now() - kvStart };
  } catch (err) {
    components.kv = {
      status: "down",
      latencyMs: Date.now() - kvStart,
      error: err instanceof Error ? err.message : "KV unreachable",
    };
  }

  // --- R2 check: list with an empty prefix (minimal operation) ---
  const r2Start = Date.now();
  try {
    const { env } = await getCloudflareContext({ async: true });
    const r2 = env.R2 as R2Bucket | undefined;

    if (!r2) throw new Error("R2 binding not available");

    await r2.list({ limit: 1 });
    components.r2 = { status: "ok", latencyMs: Date.now() - r2Start };
  } catch (err) {
    components.r2 = {
      status: "down",
      latencyMs: Date.now() - r2Start,
      error: err instanceof Error ? err.message : "R2 unreachable",
    };
  }

  // --- Overall status ---
  const statuses = Object.values(components).map((c) => c.status);
  let overallStatus: HealthResponse["status"] = "healthy";
  if (statuses.includes("down")) {
    overallStatus = statuses.every((s) => s === "down") ? "unhealthy" : "degraded";
  }

  const response: HealthResponse = {
    status: overallStatus,
    timestamp,
    components,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  };

  return NextResponse.json(response, {
    status: overallStatus === "unhealthy" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
