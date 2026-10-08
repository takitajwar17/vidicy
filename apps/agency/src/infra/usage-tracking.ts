import "server-only";

import { getRuntimeContext } from "@/infra/runtime-context";
import { logger } from "@/infra/logger";
import { appKV } from "@/infra/google/kv";

/**
 * Usage event types tracked across the application.
 * Used as KV key segments — keep short and kebab-case.
 */
export const USAGE_EVENTS = {
  CHECKLIST_GENERATED: "checklist-gen",
  EVALUATION_RUN: "eval-run",
  CHAT_MESSAGE_SENT: "chat-msg",
  DOCUMENT_UPLOADED: "doc-upload",
  CUSTOM_CHECKLIST_ITEM: "custom-item",
} as const;

type UsageEvent = (typeof USAGE_EVENTS)[keyof typeof USAGE_EVENTS];

const USAGE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

/**
 * Track a usage event for a user. Non-blocking — errors are logged but never thrown.
 *
 * Stores two KV counters per event:
 *   - Daily:   `usage:{event}:{userId}:{YYYY-MM-DD}`
 *   - Monthly: `usage:{event}:{userId}:{YYYY-MM}`
 *
 * Both auto-expire after 90 days.
 */
export function trackUsage({
  userId,
  event,
  metadata,
}: {
  userId: string;
  event: UsageEvent;
  metadata?: Record<string, unknown>;
}): void {
  const work = trackUsageAsync({ userId, event, metadata });
  try {
    getRuntimeContext().ctx.waitUntil(work);
  } catch {
    // Outside a request, the task still catches and logs its own failures.
    void work;
  }
}

async function trackUsageAsync({
  userId,
  event,
  metadata,
}: {
  userId: string;
  event: UsageEvent;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date();
  const dayKey = `usage:${event}:${userId}:${now.toISOString().slice(0, 10)}`;
  const monthKey = `usage:${event}:${userId}:${now.toISOString().slice(0, 7)}`;

  try {
    await Promise.all([
      appKV.increment({ key: dayKey, expirationTtl: USAGE_TTL_SECONDS }),
      appKV.increment({ key: monthKey, expirationTtl: USAGE_TTL_SECONDS }),
    ]);

    // Structured usage log for the application monitoring pipeline.
    logger.info("usage_event", { event, userId, metadata });
  } catch (err) {
    logger.warn("Usage tracking KV error (non-fatal)", { event, userId, error: err });
  }
}

/**
 * Read usage count for a user/event/period. Used by admin dashboard.
 * @param period - Either "YYYY-MM-DD" (daily) or "YYYY-MM" (monthly)
 */
export async function getUserUsage({
  userId,
  event,
  period,
}: {
  userId: string;
  event: UsageEvent;
  period: string;
}): Promise<number> {
  const key = `usage:${event}:${userId}:${period}`;
  const val = await appKV.get<number>(key, "json");
  return val ?? 0;
}
