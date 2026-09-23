import "server-only";
import { checkRateLimit } from "./rate-limit";
import { getIP } from "@/utils/get-IP";
import ms from "ms";
import isProd from "@/utils/is-prod";
import { ZSAError } from "zsa";

interface RateLimitConfig {
  /**
   * The key to use for the rate limit. Usually an IP address or a user ID.
   * @default IP address of the request
   */
  userIdentifier?: string;
  /**
   * A unique identifier for the rate limit.
   */
  identifier: string;
  /**
   * The maximum number of requests allowed within the window.
   */
  limit: number;
  /**
   * The time window in seconds.
   */
  windowInSeconds: number;
}

export async function withRateLimit<T>(
  action: () => Promise<T>,
  config: RateLimitConfig
): Promise<T> {
  const ip = await getIP();
  
  // In development, use 10x higher limits to allow testing while still catching issues
  // This maintains dev/prod parity while allowing reasonable development velocity
  const adjustedLimit = isProd ? config.limit : config.limit * 10;

  const rateLimitResult = await checkRateLimit({
    key: config?.userIdentifier || ip || "",
    options: {
      identifier: config.identifier,
      limit: adjustedLimit,
      windowInSeconds: config.windowInSeconds,
    },
  });

  if (!rateLimitResult.success) {
    throw new ZSAError(
      "TOO_MANY_REQUESTS",
      `Rate limit exceeded. Try again in ${Math.ceil(
        (rateLimitResult.reset - Date.now() / 1000) / 60
      )} minutes.`
    );
  }

  return action();
}

// Common rate limit configurations
export const RATE_LIMITS = {
  SIGN_IN: {
    identifier: "sign-in",
    limit: 15,
    windowInSeconds: Math.floor(ms("60 minutes") / 1000),
  },
  GOOGLE_SSO_REQUEST: {
    identifier: "google-sso-request",
    limit: 15,
    windowInSeconds: Math.floor(ms("60 minutes") / 1000),
  },
  GOOGLE_SSO_CALLBACK: {
    identifier: "google-sso-callback",
    limit: 15,
    windowInSeconds: Math.floor(ms("60 minutes") / 1000),
  },
  SIGN_UP: {
    identifier: "sign-up",
    limit: 3,
    windowInSeconds: Math.floor(ms("1 hour") / 1000),
  },
  SIGN_OUT: {
    identifier: "sign-out",
    limit: 5,
    windowInSeconds: Math.floor(ms("10 minutes") / 1000),
  },
  RESET_PASSWORD: {
    identifier: "auth",
    limit: 7,
    windowInSeconds: Math.floor(ms("1 hour") / 1000),
  },
  DELETE_SESSION: {
    identifier: "delete-session",
    limit: 10,
    windowInSeconds: Math.floor(ms("10 minutes") / 1000),
  },
  EMAIL: {
    identifier: "email",
    limit: 10,
    windowInSeconds: Math.floor(ms("1 hour") / 1000),
  },
  FORGOT_PASSWORD: {
    identifier: "forgot-password",
    limit: 4,
    windowInSeconds: Math.floor(ms("1 hour") / 1000),
  },
  SETTINGS: {
    identifier: "settings",
    limit: 15,
    windowInSeconds: Math.floor(ms("5 minutes") / 1000),
  },
  PURCHASE: {
    identifier: "purchase",
    limit: 25,
    windowInSeconds: Math.floor(ms("5 minutes") / 1000),
  },
  TEAM_INVITE: {
    identifier: "team-invite",
    limit: 5,
    windowInSeconds: Math.floor(ms("1 hour") / 1000),
  },
} as const;
