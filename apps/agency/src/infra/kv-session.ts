import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";

import { getUserFromDB } from "@/utils/auth";
import { getIP } from "@/utils/get-IP";
import { MAX_SESSIONS_PER_USER } from "@/constants";
import { getCachedUnreadCount, getCachedAdminUnreadCount } from "@/server/unread-counts";
const SESSION_PREFIX = "session:";

function getSessionKey(userId: string, sessionId: string): string {
  return `${SESSION_PREFIX}${userId}:${sessionId}`;
}

type KVSessionUser = Exclude<Awaited<ReturnType<typeof getUserFromDB>>, undefined>;

export interface KVSession {
  id: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  user: KVSessionUser & {
    initials?: string;
  };
  country?: string;
  city?: string;
  continent?: string;
  ip?: string | null;
  userAgent?: string | null;
  authenticationType?: "password" | "google-oauth";
  /**
   * Unread support tickets count
   */
  unreadSupportTicketsCount?: number;
  /**
   * Unread support tickets count for admins (counts all tickets with new activity since admin last viewed)
   */
  adminUnreadSupportTicketsCount?: number;
  /**
   *  !!!!!!!!!!!!!!!!!!!!!
   *  !!!   IMPORTANT   !!!
   *  !!!!!!!!!!!!!!!!!!!!!
   *
   *  IF YOU MAKE ANY CHANGES TO THIS OBJECT DON'T FORGET TO INCREMENT "CURRENT_SESSION_VERSION" BELOW
   *  IF YOU FORGET, THE SESSION WILL NOT BE UPDATED IN THE DATABASE
   */
  version?: number;
}

/**
 *  !!!!!!!!!!!!!!!!!!!!!
 *  !!!   IMPORTANT   !!!
 *  !!!!!!!!!!!!!!!!!!!!!
 *
 * IF YOU MAKE ANY CHANGES TO THE KVSESSION TYPE ABOVE, YOU NEED TO INCREMENT THIS VERSION.
 * THIS IS HOW WE TRACK WHEN WE NEED TO UPDATE THE SESSIONS IN THE KV STORE.
 */
export const CURRENT_SESSION_VERSION = 11;

async function getKV() {
  const { env } = getCloudflareContext();
  return env.NEXT_INC_CACHE_KV;
}

export interface CreateKVSessionParams extends Omit<KVSession, "id" | "createdAt" | "expiresAt"> {
  sessionId: string;
  expiresAt: Date;
}

export async function createKVSession({
  sessionId,
  userId,
  expiresAt,
  user,
  authenticationType,
  unreadSupportTicketsCount,
  adminUnreadSupportTicketsCount,
}: CreateKVSessionParams): Promise<KVSession> {
  const { cf } = getCloudflareContext();
  const headersList = await headers();
  const kv = await getKV();

  if (!kv) {
    throw new Error("Can't connect to KV store");
  }

  const session: KVSession = {
    id: sessionId,
    userId,
    expiresAt: expiresAt.getTime(),
    createdAt: Date.now(),
    country: cf?.country,
    city: cf?.city,
    continent: cf?.continent,
    ip: await getIP(),
    userAgent: headersList.get('user-agent'),
    user,
    authenticationType,
    unreadSupportTicketsCount,
    adminUnreadSupportTicketsCount,
    version: CURRENT_SESSION_VERSION
  };

  // Check if user has reached the session limit
  const existingSessions = await getAllSessionIdsOfUser(userId);

  // Calculate how many sessions we need to delete to make room for the new one
  if (existingSessions.length >= MAX_SESSIONS_PER_USER) {
    // We need to delete enough sessions to get below the limit after adding the new one
    const sessionsToDelete = existingSessions.length - MAX_SESSIONS_PER_USER + 1;

    // Sort sessions by expiration time (oldest first)
    const sortedSessions = [...existingSessions].sort((a, b) => {
      // If a session has no expiration, treat it as oldest
      if (!a.absoluteExpiration) return -1;
      if (!b.absoluteExpiration) return 1;
      return a.absoluteExpiration.getTime() - b.absoluteExpiration.getTime();
    });

    // Delete the oldest sessions
    for (let i = 0; i < sessionsToDelete; i++) {
      const sessionKey = sortedSessions[i]?.key;
      if (!sessionKey) continue;

      const sessionId = sessionKey.split(':')[2];
      if (!sessionId) continue;

      await deleteKVSession(sessionId, userId);
    }
  }

  await kv.put(
    getSessionKey(userId, sessionId),
    JSON.stringify(session),
    {
      expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    }
  );

  return session;
}

export async function getKVSession(sessionId: string, userId: string): Promise<KVSession | null> {
  const kv = await getKV();

  if (!kv) {
    throw new Error("Can't connect to KV store");
  }

  const sessionStr = await kv.get(getSessionKey(userId, sessionId));
  if (!sessionStr) return null;

  const session = JSON.parse(sessionStr) as KVSession

  if (session?.user?.createdAt) {
    session.user.createdAt = new Date(session.user.createdAt);
  }

  if (session?.user?.updatedAt) {
    session.user.updatedAt = new Date(session.user.updatedAt);
  }

  if (session?.user?.emailVerified) {
    session.user.emailVerified = new Date(session.user.emailVerified);
  }

  return session;
}

export async function updateKVSession(
  sessionId: string,
  userId: string,
  expiresAt: Date,
  userData?: KVSessionUser,
  unreadSupportTicketsCount?: number,
  adminUnreadSupportTicketsCount?: number
): Promise<KVSession | null> {
  const session = await getKVSession(sessionId, userId);
  if (!session) return null;

  const updatedUser = userData ?? await getUserFromDB(userId);

  if (!updatedUser) {
    throw new Error("User not found");
  }

  const updatedSession: KVSession = {
    ...session,
    version: CURRENT_SESSION_VERSION,
    expiresAt: expiresAt.getTime(),
    user: updatedUser,
    unreadSupportTicketsCount: unreadSupportTicketsCount ?? session.unreadSupportTicketsCount,
    adminUnreadSupportTicketsCount: adminUnreadSupportTicketsCount ?? session.adminUnreadSupportTicketsCount,
  };

  const kv = await getKV();

  if (!kv) {
    throw new Error("Can't connect to KV store");
  }

  await kv.put(
    getSessionKey(userId, sessionId),
    JSON.stringify(updatedSession),
    {
      expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    }
  );

  return updatedSession;
}

export async function deleteKVSession(sessionId: string, userId: string): Promise<void> {
  const session = await getKVSession(sessionId, userId);
  if (!session) return;

  const kv = await getKV();

  if (!kv) {
    throw new Error("Can't connect to KV store");
  }

  await kv.delete(getSessionKey(userId, sessionId));
}

export async function getAllSessionIdsOfUser(userId: string) {
  const kv = await getKV();

  if (!kv) {
    throw new Error("Can't connect to KV store");
  }

  const sessions = await kv.list({ prefix: getSessionKey(userId, "") });

  return sessions.keys.map((session) => ({
    key: session.name,
    absoluteExpiration: session.expiration ? new Date(session.expiration * 1000) : undefined
  }))
}

/**
 * Update all sessions of a user. It can only be called in a server actions and api routes.
 * @param userId
 * @param unreadSupportTicketsCount
 */
export async function updateAllSessionsOfUser(userId: string) {
  const sessions = await getAllSessionIdsOfUser(userId);

  const [newUserData, unreadSupportTicketsCount] = await Promise.all([
    getUserFromDB(userId),
    getCachedUnreadCount(userId),
  ]);

  if (!newUserData) return;

  const adminUnreadSupportTicketsCount = newUserData.role === "admin"
    ? await getCachedAdminUnreadCount()
    : undefined;

  await Promise.all(
    sessions.map((sessionObj) => {
      // Extract sessionId from key (format: "session:userId:sessionId")
      const sessionId = sessionObj.key.split(':')[2];
      if (!sessionId) return Promise.resolve();

      // Only update non-expired sessions
      if (sessionObj.absoluteExpiration && sessionObj.absoluteExpiration.getTime() > Date.now()) {
        return updateKVSession(sessionId, userId, sessionObj.absoluteExpiration, newUserData, unreadSupportTicketsCount, adminUnreadSupportTicketsCount);
      }

      return Promise.resolve();
    })
  );
}

/**
 * Delete all sessions of a user.
 * @param userId
 */
export async function deleteAllSessionsOfUser(userId: string) {
  const sessions = await getAllSessionIdsOfUser(userId);

  await Promise.all(
    sessions.map(sessionObj => {
      const sessionId = sessionObj.key.split(':')[2];
      if (!sessionId) return Promise.resolve();
      return deleteKVSession(sessionId, userId);
    })
  );
}
