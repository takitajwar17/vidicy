"use server";

import { createServerAction, ZSAError } from "zsa"
import { z } from "zod";
import { getDB } from "@/db"
import { userTable } from "@/db/schema"
import { signUpSchema } from "@/schemas/signup.schema";
import { hashPassword } from "@/infra/password-hasher";
import { createSession, generateSessionToken, setSessionTokenCookie, canSignUp } from "@/utils/auth";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getVerificationTokenKey } from "@/utils/auth-utils";
import { sendNewUserSignupNotificationEmail, sendVerificationEmail } from "@/utils/email";
import { withRateLimit, RATE_LIMITS } from "@/infra/with-rate-limit";
import { EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS } from "@/constants";
import { getIP } from "@/utils/get-IP";
import { validateTurnstileToken } from "@/infra/validate-captcha";
import { isTurnstileEnabled } from "@/flags";
import { logger } from "@/infra/logger";
import { validateCsrfToken } from "@/infra/csrf";
import { linkApplicantRecordsByEmail } from "@/server/applicant-server";
import { sendEmailBestEffort } from "@/lib/best-effort-email";
import { getPostAuthRedirectPath } from "@/utils/auth-redirect";

const signUpActionSchema = signUpSchema.extend({
  verifiedRedirectPath: z.string().optional(),
});

export const signUpAction = createServerAction()
  .input(signUpActionSchema)
  .handler(async ({ input }) => {
    return withRateLimit(
      async () => {
        // Validate CSRF token
        const isCsrfValid = await validateCsrfToken(input.csrfToken);
        if (!isCsrfValid) {
          throw new ZSAError("FORBIDDEN", "Invalid request. Please try again.");
        }

        const db = getDB();
        const { env } = getCloudflareContext();

        if (await isTurnstileEnabled()) {
          if (!input.captchaToken) {
            throw new ZSAError(
              "INPUT_PARSE_ERROR",
              "Please complete the captcha"
            )
          }

          const success = await validateTurnstileToken(input.captchaToken)

          if (!success) {
            throw new ZSAError(
              "INPUT_PARSE_ERROR",
              "Please complete the captcha"
            )
          }
        }

        // Check if email is disposable
        await canSignUp({ email: input.email });

        // Check if email is already taken
        const existingUser = await db.query.userTable.findFirst({
          where: eq(userTable.email, input.email),
        });

        if (existingUser) {
          throw new ZSAError(
            "CONFLICT",
            "Email already taken"
          );
        }

        // Hash the password
        const hashedPassword = await hashPassword({ password: input.password });

        // Create the user
        const [user] = await db.insert(userTable)
          .values({
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash: hashedPassword,
            signUpIpAddress: await getIP(),
          })
          .returning();

        if (!user || !user.email) {
          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "Failed to create user"
          );
        }
        const userEmail = user.email;

        let verificationToken: string;

        try {
          // Create a session
          const sessionToken = generateSessionToken();
          const session = await createSession({
            token: sessionToken,
            userId: user.id,
            authenticationType: "password",
          });

          // Set the session cookie
          await setSessionTokenCookie({
            token: sessionToken,
            userId: user.id,
            expiresAt: new Date(session.expiresAt)
          });

          // Generate verification token
          verificationToken = createId();
          const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS * 1000);

          if (!env?.NEXT_INC_CACHE_KV) {
            throw new Error("Can't connect to KV store");
          }

          // Save verification token in KV with expiration
          await env.NEXT_INC_CACHE_KV.put(
            getVerificationTokenKey(verificationToken),
            JSON.stringify({
              userId: user.id,
              expiresAt: expiresAt.toISOString(),
            }),
            {
              expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
            }
          );
        } catch (error) {
          logger.error("Failed to create session after signup:", { error })

          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "Failed to create session after signup"
          );
        }

        await sendEmailBestEffort({
          send: () => sendVerificationEmail({
            email: userEmail,
            verificationToken,
            username: user.firstName || userEmail,
          }),
          logger,
          message: "Failed to send verification email after signup",
          context: {
            userId: user.id,
            email: userEmail,
          },
        });

        const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || userEmail;

        await sendEmailBestEffort({
          send: () => sendNewUserSignupNotificationEmail({
            email: userEmail,
            name: fullName,
          }),
          logger,
          message: "Failed to send new user signup notification",
          context: {
            userId: user.id,
            email: userEmail,
          },
        });

        // Link any applicant records that were pre-created with this email (non-fatal, has own error handling)
        await linkApplicantRecordsByEmail({ userId: user.id, email: userEmail });

        return {
          success: true,
          redirectTo: getPostAuthRedirectPath({
            isEmailVerified: false,
            verifiedRedirectPath: input.verifiedRedirectPath,
          }),
        };
      },
      RATE_LIMITS.SIGN_UP
    );
  })
