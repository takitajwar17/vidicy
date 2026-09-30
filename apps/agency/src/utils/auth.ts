import "server-only";

import { ROLES_ENUM, userTable } from "@/db/schema";
import { encodeHexLowerCase } from "@oslojs/encoding"
import ms from "ms"
import { getDB } from "@/db";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import isProd from "@/utils/is-prod";
import {
  createKVSession,
  deleteKVSession,
  type KVSession,
  type CreateKVSessionParams,
  getKVSession,
  updateKVSession,
  CURRENT_SESSION_VERSION
} from "@/infra/kv-session";
import { cache } from "react"
import type { SessionValidationResult } from "@/types";
import { SESSION_COOKIE_NAME, DISPOSABLE_EMAIL_CHECK_URL, MAILCHECK_API_URL } from "@/constants";
import { ZSAError } from "zsa";
import { getInitials } from "./name-initials";
import { logger } from "@/infra/logger";
import { getCachedUnreadCount, getCachedAdminUnreadCount } from "@/server/unread-counts";

const getSessionLength = () => {
  return ms("30d");
}

/**
 * This file is based on https://lucia-auth.com
 */

export const getUserFromDB = cache(async function getUserFromDB(userId: string) {
  const db = getDB();
  return await db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
    columns: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      emailVerified: true,
      avatar: true,
      createdAt: true,
      updatedAt: true,
      googleAccountId: true,
    },
  });
});


/**
 * Generates a cryptographically secure session token
 * Uses Web Crypto API for 256 bits of entropy (far exceeds OWASP recommendations)
 */
export function generateSessionToken(): string {
  // Generate 32 bytes (256 bits) of cryptographically secure random data
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));

  // Convert to base64url encoding (URL-safe, no padding)
  const base64 = btoa(String.fromCharCode(...randomBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return base64;
}

async function generateSessionId(token: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return encodeHexLowerCase(new Uint8Array(hashBuffer));
}

function encodeSessionCookie(userId: string, token: string): string {
  return `${userId}:${token}`;
}

function decodeSessionCookie(cookie: string): { userId: string; token: string } | null {
  const idx = cookie.indexOf(':');
  if (idx === -1) return null;
  return { userId: cookie.slice(0, idx), token: cookie.slice(idx + 1) };
}

interface CreateSessionParams extends Pick<CreateKVSessionParams, "authenticationType" | "userId"> {
  token: string;
}

export async function createSession({
  token,
  userId,
  authenticationType,
}: CreateSessionParams): Promise<KVSession> {
  const sessionId = await generateSessionId(token);
  const expiresAt = new Date(Date.now() + getSessionLength());

  const [user, unreadSupportTicketsCount] = await Promise.all([
    getUserFromDB(userId),
    getCachedUnreadCount(userId),
  ]);

  if (!user) {
    throw new Error("User not found");
  }

  const adminUnreadSupportTicketsCount = user.role === "admin"
    ? await getCachedAdminUnreadCount()
    : undefined;

  return createKVSession({
    sessionId,
    userId,
    expiresAt,
    user,
    authenticationType,
    unreadSupportTicketsCount,
    adminUnreadSupportTicketsCount,
  });
}

export async function createAndStoreSession(
  userId: string,
  authenticationType?: CreateKVSessionParams["authenticationType"],
) {
  const sessionToken = generateSessionToken();
  const session = await createSession({
    token: sessionToken,
    userId,
    authenticationType,
  });
  await setSessionTokenCookie({
    token: sessionToken,
    userId,
    expiresAt: new Date(session.expiresAt)
  });
}

async function validateSessionToken(token: string, userId: string): Promise<SessionValidationResult | null> {
  const sessionId = await generateSessionId(token);

  const session = await getKVSession(sessionId, userId);

  if (!session) return null;

  // If the session has expired, delete it and return null
  if (Date.now() >= session.expiresAt) {
    await deleteKVSession(sessionId, userId);
    return null;
  }

  // Check if session version needs to be updated
  if (!session.version || session.version !== CURRENT_SESSION_VERSION) {
    const updatedSession = await updateKVSession(sessionId, userId, new Date(session.expiresAt));

    if (!updatedSession) {
      return null;
    }

    // Update the user initials
    updatedSession.user.initials = getInitials(`${updatedSession.user.firstName} ${updatedSession.user.lastName}`);

    // Compute unread counts (same as normal path)
    updatedSession.unreadSupportTicketsCount = await getCachedUnreadCount(userId);
    if (updatedSession.user.role === 'admin') {
      updatedSession.adminUnreadSupportTicketsCount = await getCachedAdminUnreadCount();
    }

    return updatedSession;
  }

  // Update the user initials
  session.user.initials = getInitials(`${session.user.firstName} ${session.user.lastName}`);

  // Return cached unread counts — invalidated on ticket mutations, TTL 60s
  session.unreadSupportTicketsCount = await getCachedUnreadCount(userId);

  if (session.user.role === "admin") {
    session.adminUnreadSupportTicketsCount = await getCachedAdminUnreadCount();
  }

  return session;
}

export async function invalidateSession(sessionId: string, userId: string): Promise<void> {
  await deleteKVSession(sessionId, userId);
}

interface SetSessionTokenCookieParams {
  token: string;
  userId: string;
  expiresAt: Date;
}

export async function setSessionTokenCookie({ token, userId, expiresAt }: SetSessionTokenCookieParams): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, encodeSessionCookie(userId, token), {
    httpOnly: true,
    // `lax` is required for top-level cross-site navigations so authenticated
    // users keep their session after external auth redirects.
    sameSite: "lax",
    secure: isProd,
    expires: expiresAt,
    path: "/",
  });
}

/**
 * Re-sets the existing session cookie with `SameSite=Lax`.
 * Useful before cross-site redirects to migrate legacy Strict cookies without
 * forcing users to sign out/in.
 */
export async function refreshSessionCookieForCrossSiteRedirect(): Promise<boolean> {
  const cookieStore = await cookies();
  const existingValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!existingValue) {
    return false;
  }

  cookieStore.set(SESSION_COOKIE_NAME, existingValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    maxAge: Math.floor(getSessionLength() / 1000),
  });

  return true;
}

export async function deleteSessionTokenCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * This function can only be called in a Server Components, Server Action or Route Handler
 */
export const getSessionFromCookie = cache(async (): Promise<SessionValidationResult | null> => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  const decoded = decodeSessionCookie(sessionCookie);

  if (!decoded || !decoded.token || !decoded.userId) {
    return null;
  }

  return validateSessionToken(decoded.token, decoded.userId);
})

export const requireVerifiedEmail = cache(async ({
  doNotThrowError = false,
}: {
  doNotThrowError?: boolean;
} = {}) => {
  const session = await getSessionFromCookie();

  if (!session) {
    if (doNotThrowError) {
      return null;
    }
    throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");
  }

  if (!session?.user?.emailVerified) {
    if (doNotThrowError) {
      return null;
    }

    throw new ZSAError("FORBIDDEN", "Please verify your email first");
  }

  return session;
});

export const requireAdmin = cache(async ({
  doNotThrowError = false,
}: {
  doNotThrowError?: boolean;
} = {}) => {
  const session = await getSessionFromCookie();

  if (!session) {
    if (doNotThrowError) {
      return null;
    }
    throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");
  }

  if (session.user.role !== ROLES_ENUM.ADMIN) {
    if (doNotThrowError) {
      return null;
    }

    throw new ZSAError("FORBIDDEN", "Not authorized");
  }

  return session;
});

interface DisposableEmailResponse {
  disposable: string;
}

interface MailcheckResponse {
  status: number;
  email: string;
  domain: string;
  mx: boolean;
  disposable: boolean;
  public_domain: boolean;
  relay_domain: boolean;
  alias: boolean;
  role_account: boolean;
  did_you_mean: string | null;
}

type ValidatorResult = {
  success: boolean;
  isDisposable: boolean;
};

/**
 * Checks if an email is disposable using debounce.io
 */
async function checkWithDebounce(email: string): Promise<ValidatorResult> {
  try {
    const response = await fetch(`${DISPOSABLE_EMAIL_CHECK_URL}/?email=${encodeURIComponent(email)}`);

    if (!response.ok) {
      logger.error("Debounce.io API error:", { status: response.status });
      return { success: false, isDisposable: false };
    }

    const data = await response.json() as DisposableEmailResponse;

    return { success: true, isDisposable: data.disposable === "true" };
  } catch (error) {
    logger.error("Failed to check disposable email with debounce.io:", { error });
    return { success: false, isDisposable: false };
  }
}

/**
 * Checks if an email is disposable using mailcheck.ai
 */
async function checkWithMailcheck(email: string): Promise<ValidatorResult> {
  try {
    const response = await fetch(`${MAILCHECK_API_URL}/email/${encodeURIComponent(email)}`);

    if (!response.ok) {
      logger.error("Mailcheck.ai API error:", { status: response.status });
      return { success: false, isDisposable: false };
    }

    const data = await response.json() as MailcheckResponse;
    return { success: true, isDisposable: data.disposable };
  } catch (error) {
    logger.error("Failed to check disposable email with mailcheck.ai:", { error });
    return { success: false, isDisposable: false };
  }
}


/**
 * Checks if an email is allowed for sign up by verifying it's not a disposable email
 * Uses multiple services in sequence for redundancy.
 *
 * @throws {ZSAError} If email is disposable or if all services fail
 */
export async function canSignUp(
  {
    email,
    skipDisposableEmailCheck = false
  }:
    {
      email: string,
      skipDisposableEmailCheck?: boolean
    }): Promise<void> {
  // Skip disposable email check in development
  if (!isProd) {
    return;
  }

  // TODO In the future we will add checks for banned emails here

  if (skipDisposableEmailCheck) {
    return;
  }

  const validators = [
    checkWithDebounce,
    checkWithMailcheck,
  ];

  for (const validator of validators) {
    const result = await validator(email);

    // If the validator failed (network error, rate limit, etc), try the next one
    if (!result.success) {
      continue;
    }

    // If we got a successful response and it's disposable, reject the signup
    if (result.isDisposable) {
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Disposable email addresses are not allowed"
      );
    }

    // If we got a successful response and it's not disposable, allow the signup
    return;
  }

  // All validators unreachable — fail open so signups aren't blocked by third-party outages
  logger.error("All disposable email validators failed — failing open", { email });
  return;
}
