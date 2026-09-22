"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { resetPasswordSchema } from "@/schemas/reset-password.schema";
import { hashPassword } from "@/infra/password-hasher";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getResetTokenKey } from "@/utils/auth-utils";
import { withRateLimit, RATE_LIMITS } from "@/infra/with-rate-limit";
import { logger } from "@/infra/logger";
import { validateCsrfToken } from "@/infra/csrf";
import { deleteAllSessionsOfUser } from "@/infra/kv-session";

export const resetPasswordAction = createServerAction()
  .input(resetPasswordSchema)
  .handler(async ({ input }) => {
    return withRateLimit(
      async () => {
        // Validate CSRF token
        if (!(await validateCsrfToken(input.csrfToken))) {
          throw new ZSAError("FORBIDDEN", "Invalid request");
        }

        const db = getDB();
        const { env } = getCloudflareContext();

        if (!env?.NEXT_INC_CACHE_KV) {
          throw new Error("Can't connect to KV store");
        }

        try {
          // Find valid reset token
          const resetTokenStr = await env.NEXT_INC_CACHE_KV.get(getResetTokenKey(input.token));
          if (!resetTokenStr) {
            throw new ZSAError(
              "NOT_FOUND",
              "Invalid or expired reset token"
            );
          }

          const resetToken = JSON.parse(resetTokenStr) as {
            userId: string;
            expiresAt: string;
            used?: boolean;
          };

          // Check if token was already used (single-use enforcement)
          if (resetToken.used) {
            throw new ZSAError(
              "NOT_FOUND",
              "Reset token has already been used"
            );
          }

          // Check if token is expired (although KV should have auto-deleted it)
          if (new Date() > new Date(resetToken.expiresAt)) {
            await env.NEXT_INC_CACHE_KV.delete(getResetTokenKey(input.token));
            
            throw new ZSAError(
              "PRECONDITION_FAILED",
              "Reset token has expired"
            );
          }

          // Mark token as used BEFORE changing password to prevent race conditions
          await env.NEXT_INC_CACHE_KV.put(
            getResetTokenKey(input.token),
            JSON.stringify({ ...resetToken, used: true }),
            { expirationTtl: 3600 } // Keep for 1 hour for audit purposes
          );

          // Find user
          const user = await db.query.userTable.findFirst({
            where: eq(userTable.id, resetToken.userId),
          });

          if (!user) {
            throw new ZSAError(
              "NOT_FOUND",
              "User not found"
            );
          }

          // Update password
          const passwordHash = await hashPassword({ password: input.password });
          await db.update(userTable)
            .set({ passwordHash })
            .where(eq(userTable.id, resetToken.userId));

          // SECURITY: Invalidate all existing sessions for security
          await deleteAllSessionsOfUser(resetToken.userId);

          // TODO: Send confirmation email to user

          return { success: true };
        } catch (error) {
          logger.error("Reset password error:", { error })

          if (error instanceof ZSAError) {
            throw error;
          }

          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "An unexpected error occurred"
          );
        }
      },
      RATE_LIMITS.RESET_PASSWORD
    );
  });
