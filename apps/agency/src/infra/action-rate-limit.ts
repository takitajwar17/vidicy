import "server-only";
import { appKV } from "@/infra/google/kv";
import { logger } from "@/infra/logger";
import { RATE_LIMIT_WINDOW_SECONDS } from "@/constants";
import { ZSAError } from "zsa";

/** Per-user action limits for one hour after the first request. */
export async function checkActionRateLimit(
  action: string,
  userId: string,
  limit: number,
): Promise<void> {
  try {
    // Version the key because the earlier implementation stored a JSON object.
    const { count, remainingSeconds } = await appKV.incrementWindow({
      key: `rl:v2:${action}:${userId}`,
      expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (count > limit) {
      const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
      throw new ZSAError(
        "TOO_MANY_REQUESTS",
        `You've reached the limit for this action. Please try again in ${minutes} minute${minutes !== 1 ? "s" : ""}.`,
      );
    }
  } catch (error) {
    if (error instanceof ZSAError) throw error;
    logger.warn("Rate limit Redis error (non-fatal)", { error });
  }
}
