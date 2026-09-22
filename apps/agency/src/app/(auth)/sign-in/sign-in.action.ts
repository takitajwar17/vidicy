"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { signInSchema } from "@/schemas/signin.schema";
import { verifyPassword } from "@/infra/password-hasher";
import { createAndStoreSession } from "@/utils/auth";
import { eq } from "drizzle-orm";
import { RATE_LIMITS, withRateLimit } from "@/infra/with-rate-limit";
import { logger, logAlert } from "@/infra/logger";
import { validateCsrfToken } from "@/infra/csrf";
import { getPostAuthRedirectPath } from "@/utils/auth-redirect";

const signInActionSchema = signInSchema.extend({
  verifiedRedirectPath: z.string().optional(),
});

export const signInAction = createServerAction()
  .input(signInActionSchema)
  .handler(async ({ input }) => {
    return withRateLimit(
      async () => {
        if (!(await validateCsrfToken(input.csrfToken))) {
          throw new ZSAError("FORBIDDEN", "Invalid request");
        }

        const db = getDB();

        try {
          // Find user by email
          const user = await db.query.userTable.findFirst({
            where: eq(userTable.email, input.email),
          });

          if (!user) {
            throw new ZSAError(
              "NOT_AUTHORIZED",
              "Invalid email or password"
            );
          }

          // Check if user has only Google SSO
          if (!user.passwordHash && user.googleAccountId) {
            throw new ZSAError(
              "FORBIDDEN",
              "Please sign in with your Google account instead."
            );
          }

          if (!user.passwordHash) {
            throw new ZSAError(
              "NOT_AUTHORIZED",
              "Invalid email or password"
            );
          }

          // Verify password
          const isValid = await verifyPassword({
            storedHash: user.passwordHash,
            passwordAttempt: input.password
          });

          if (!isValid) {
            logAlert("auth_brute_force", "Failed login attempt", { email: input.email });
            throw new ZSAError(
              "NOT_AUTHORIZED",
              "Invalid email or password"
            );
          }

          // Create session
          await createAndStoreSession(user.id, "password")

          return {
            success: true,
            redirectTo: getPostAuthRedirectPath({
              isEmailVerified: Boolean(user.emailVerified),
              verifiedRedirectPath: input.verifiedRedirectPath,
            }),
          };
        } catch (error) {
          logger.error("Sign in error:", { error })

          if (error instanceof ZSAError) {
            throw error;
          }

          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "An unexpected error occurred"
          );
        }
      },
      RATE_LIMITS.SIGN_IN
    );
  });
