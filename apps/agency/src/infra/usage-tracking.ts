import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { logger } from "@/infra/logger";

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
  // Fire and forget — never await this in the caller
  void trackUsageAsync({ userId, event, metadata });
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
  let kv: KVNamespace | undefined;
  try {
    const { env } = getCloudflareContext();
    kv = env.APP_KV as KVNamespace | undefined;
  } catch {
    return; // local dev — no KV
  }

  if (!kv) return;

  const now = new Date();
  const dayKey = `usage:${event}:${userId}:${now.toISOString().slice(0, 10)}`;
  const monthKey = `usage:${event}:${userId}:${now.toISOString().slice(0, 7)}`;

  try {
    const [dayVal, monthVal] = await Promise.all([
      kv.get(dayKey, "json") as Promise<number | null>,
      kv.get(monthKey, "json") as Promise<number | null>,
    ]);

    await Promise.all([
      kv.put(dayKey, JSON.stringify((dayVal ?? 0) + 1), { expirationTtl: USAGE_TTL_SECONDS }),
      kv.put(monthKey, JSON.stringify((monthVal ?? 0) + 1), { expirationTtl: USAGE_TTL_SECONDS }),
    ]);

    // Structured usage log for Cloudflare observability pipeline
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
  let kv: KVNamespace | undefined;
  try {
    const { env } = await getCloudflareContext({ async: true });
    kv = env.APP_KV as KVNamespace | undefined;
  } catch {
    return 0;
  }

  if (!kv) return 0;

  const key = `usage:${event}:${userId}:${period}`;
  const val = await kv.get(key, "json") as number | null;
  return val ?? 0;
}
