import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const TTL = 60; // seconds

function userKey(userId: string) {
  return `unread:user:${userId}`;
}
const ADMIN_KEY = "unread:admin";

async function getKV() {
  const { env } = getCloudflareContext();
  return env.NEXT_INC_CACHE_KV ?? null;
}

export async function getCachedUnreadCount(userId: string): Promise<number> {
  try {
    const kv = await getKV();
    if (kv) {
      const cached = await kv.get(userKey(userId));
      if (cached !== null) return parseInt(cached, 10);
    }
    const { getUnreadSupportTicketsCount } = await import("@/server/support");
    const fresh = await getUnreadSupportTicketsCount(userId);
    if (kv) await kv.put(userKey(userId), String(fresh), { expirationTtl: TTL });
    return fresh;
  } catch {
    const { getUnreadSupportTicketsCount } = await import("@/server/support");
    return getUnreadSupportTicketsCount(userId);
  }
}

export async function getCachedAdminUnreadCount(): Promise<number> {
  try {
    const kv = await getKV();
    if (kv) {
      const cached = await kv.get(ADMIN_KEY);
      if (cached !== null) return parseInt(cached, 10);
    }
    const { getAdminUnreadSupportTicketsCount } = await import("@/server/support");
    const fresh = await getAdminUnreadSupportTicketsCount();
    if (kv) await kv.put(ADMIN_KEY, String(fresh), { expirationTtl: TTL });
    return fresh;
  } catch {
    const { getAdminUnreadSupportTicketsCount } = await import("@/server/support");
    return getAdminUnreadSupportTicketsCount();
  }
}

export async function invalidateUnreadCount(userId: string): Promise<void> {
  try {
    const kv = await getKV();
    await kv?.delete(userKey(userId));
  } catch {
    // Non-fatal
  }
}

export async function invalidateAdminUnreadCount(): Promise<void> {
  try {
    const kv = await getKV();
    await kv?.delete(ADMIN_KEY);
  } catch {
    // Non-fatal
  }
}
