"use server";

import {
  deleteSessionTokenCookie,
  getSessionFromCookie,
  invalidateSession
} from "@/utils/auth";
import { RATE_LIMITS, withRateLimit } from "@/infra/with-rate-limit";
import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { validateCsrfToken } from "@/infra/csrf";

const signOutSchema = z.object({
  csrfToken: z.string().optional(),
});

export const signOutAction = createServerAction()
  .input(signOutSchema)
  .handler(async ({ input }) => {
    return withRateLimit(
      async () => {
        // Validate CSRF token
        if (!(await validateCsrfToken(input.csrfToken))) {
          throw new ZSAError("FORBIDDEN", "Invalid request");
        }

        const session = await getSessionFromCookie()

        if (!session) return;

        await invalidateSession(
          session.id,
          session.userId
        );

        await deleteSessionTokenCookie();
      },
      RATE_LIMITS.SIGN_OUT
    );
  });

