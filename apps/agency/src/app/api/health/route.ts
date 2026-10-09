import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getRuntimeContext } from "@/infra/runtime-context";
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
    postgres: ComponentStatus;
    memorystore: ComponentStatus;
    cloudStorage: ComponentStatus;
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
    postgres: { status: "down", latencyMs: 0 },
    memorystore: { status: "down", latencyMs: 0 },
    cloudStorage: { status: "down", latencyMs: 0 },
  };

  // --- PostgreSQL check: execute a trivial query ---
  const d1Start = Date.now();
  try {
    const db = getDB();
    await db.execute(sql`SELECT 1`);
    components.postgres = { status: "ok", latencyMs: Date.now() - d1Start };
  } catch (err) {
    components.postgres = {
      status: "down",
      latencyMs: Date.now() - d1Start,
      error: err instanceof Error ? err.message : "PostgreSQL unreachable",
    };
  }

  // --- KV check: write, read, delete a canary key ---
  const kvStart = Date.now();
  try {
    const { env } = await getRuntimeContext({ async: true });
    const kv = env.APP_KV as KVNamespace | undefined;

    if (!kv) throw new Error("APP_KV binding not available");

    const canaryKey = `${HEALTH_CHECK_CANARY_KEY}:${randomUUID()}`;
    const canaryValue = randomUUID();
    try {
      await kv.put(canaryKey, canaryValue, { expirationTtl: 60 });
      const readBack = await kv.get(canaryKey);
      if (readBack !== canaryValue) throw new Error("KV read-back mismatch");
    } finally {
      await kv.delete(canaryKey);
    }

    components.memorystore = { status: "ok", latencyMs: Date.now() - kvStart };
  } catch (err) {
    components.memorystore = {
      status: "down",
      latencyMs: Date.now() - kvStart,
      error: err instanceof Error ? err.message : "Memorystore unreachable",
    };
  }

  // --- R2 check: list with an empty prefix (minimal operation) ---
  const r2Start = Date.now();
  try {
    const { env } = await getRuntimeContext({ async: true });
    const r2 = env.R2 as R2Bucket | undefined;

    if (!r2) throw new Error("R2 binding not available");

    await r2.list({ limit: 1 });
    components.cloudStorage = { status: "ok", latencyMs: Date.now() - r2Start };
  } catch (err) {
    components.cloudStorage = {
      status: "down",
      latencyMs: Date.now() - r2Start,
      error: err instanceof Error ? err.message : "Cloud Storage unreachable",
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
