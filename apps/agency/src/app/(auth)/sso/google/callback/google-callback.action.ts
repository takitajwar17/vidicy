"use server";

import { createServerAction, ZSAError } from "zsa";
import { googleSSOCallbackSchema } from "@/schemas/google-sso-callback.schema";
import { withRateLimit, RATE_LIMITS } from "@/infra/with-rate-limit";
import {
  GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME,
  GOOGLE_OAUTH_REDIRECT_COOKIE_NAME,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
} from "@/constants";
import { cookies } from "next/headers";
import { getGoogleSSOClient } from "@/lib/sso/google-sso";
import { decodeIdToken } from "arctic";
import { getDB } from "@/db";
import { eq } from "drizzle-orm";
import { userTable } from "@/db/schema";
import { canSignUp, createAndStoreSession } from "@/utils/auth";
import { isGoogleSSOEnabled } from "@/flags";
import { getIP } from "@/utils/get-IP";
import { logger } from "@/infra/logger";
import { sendNewUserSignupNotificationEmail } from "@/utils/email";
import { linkApplicantRecordsByEmail } from "@/server/applicant-server";
import { getPostAuthRedirectPath, normalizeRedirectPath } from "@/utils/auth-redirect";
import { sendEmailBestEffort } from "@/lib/best-effort-email";

type GoogleSSOResponse = {
  /**
   * Issuer
   * Example: https://accounts.google.com
   */
  iss: string
  /**
   * Authorized party
   * Example: 111111111111-x403h5fq3e4ts2qa022tcgdpm9lqhvj5.apps.googleusercontent.com
   */
  azp: string
  /**
   * Audience
   * Example: 111111111111-x403h5fq3e4ts2qa022tcgdpm9lqhvj5.apps.googleusercontent.com
   */
  aud: string
  /**
   * Subject
   * Example: 111111111111111111111
   */
  sub: string
  email: string
  email_verified: boolean
  /**
   * Access token hash
   * Example: HhYIlZToOmC0QB1-N_SzE
   */
  at_hash: string
  name: string
  picture: string
  given_name: string
  family_name: string
  iat: number
  exp: number
}

export const googleSSOCallbackAction = createServerAction()
  .input(googleSSOCallbackSchema)
  .handler(async ({ input }) => {
    return withRateLimit(async () => {
      if (!(await isGoogleSSOEnabled())) {
        throw new ZSAError(
          "FORBIDDEN",
          "Google SSO is not enabled"
        );
      }

      const cookieStore = await cookies();
      const cookieState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE_NAME)?.value ?? null;
      const cookieCodeVerifier = cookieStore.get(GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME)?.value ?? null;
      const verifiedRedirectPath = normalizeRedirectPath(
        cookieStore.get(GOOGLE_OAUTH_REDIRECT_COOKIE_NAME)?.value,
      );

      if (!cookieState || !cookieCodeVerifier) {
        throw new ZSAError(
          "NOT_AUTHORIZED",
          "Missing required cookies"
        );
      }

      if (input.state !== cookieState) {
        throw new ZSAError(
          "NOT_AUTHORIZED",
          "Invalid state parameter"
        );
      }

      let tokens;
      try {
        const google = getGoogleSSOClient();
        tokens = await google.validateAuthorizationCode(input.code, cookieCodeVerifier);
      } catch (error) {
        logger.error("Google OAuth callback: Error validating authorization code", { error });
        throw new ZSAError(
          "NOT_AUTHORIZED",
          "Invalid authorization code"
        );
      }

      const claims = decodeIdToken(tokens.idToken()) as GoogleSSOResponse;

      // Validate critical ID token claims (defense-in-depth)
      if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
        throw new ZSAError("NOT_AUTHORIZED", "Invalid token issuer");
      }
      const expectedClientId = process.env.GOOGLE_CLIENT_ID;
      if (expectedClientId && claims.aud !== expectedClientId) {
        throw new ZSAError("NOT_AUTHORIZED", "Invalid token audience");
      }
      if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
        throw new ZSAError("NOT_AUTHORIZED", "Token has expired");
      }

      // Delete state/code_verifier cookies after validation to prevent replay
      cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE_NAME);
      cookieStore.delete(GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME);
      cookieStore.delete(GOOGLE_OAUTH_REDIRECT_COOKIE_NAME);

      const googleAccountId = claims.sub;
      const avatarUrl = claims.picture;
      const email = claims.email;

      await canSignUp({ email, skipDisposableEmailCheck: true });

      const db = getDB();

      try {
        // First check if user exists with this Google account ID
        const existingUserWithGoogle = await db.query.userTable.findFirst({
          where: eq(userTable.googleAccountId, googleAccountId)
        });

        if (existingUserWithGoogle?.id) {
          await createAndStoreSession(existingUserWithGoogle.id, "google-oauth");
          return {
            success: true,
            redirectTo: getPostAuthRedirectPath({
              isEmailVerified: Boolean(existingUserWithGoogle.emailVerified),
              verifiedRedirectPath,
            }),
          };
        }

        // Then check if user exists with this email
        const existingUserWithEmail = await db.query.userTable.findFirst({
          where: eq(userTable.email, email)
        });

        if (existingUserWithEmail?.id) {
          // Only auto-link if Google has verified the email address
          if (!claims.email_verified) {
            throw new ZSAError(
              "FORBIDDEN",
              "Cannot link account: Google email is not verified"
            );
          }

          // User exists but hasn't linked Google - let's link their account
          const [updatedUser] = await db
            .update(userTable)
            .set({
              googleAccountId,
              avatar: existingUserWithEmail.avatar || avatarUrl,
              emailVerified: existingUserWithEmail.emailVerified || (claims?.email_verified ? new Date() : null),
            })
            .where(eq(userTable.id, existingUserWithEmail.id))
            .returning();

          await createAndStoreSession(updatedUser.id, "google-oauth");
          return {
            success: true,
            redirectTo: getPostAuthRedirectPath({
              isEmailVerified: Boolean(updatedUser.emailVerified),
              verifiedRedirectPath,
            }),
          };
        }

        const [user] = await db.insert(userTable)
          .values({
            googleAccountId,
            firstName: claims.given_name || claims.name || null,
            lastName: claims.family_name || null,
            avatar: avatarUrl,
            email,
            emailVerified: claims?.email_verified ? new Date() : null,
            signUpIpAddress: await getIP(),
          })
          .returning();

        // TODO: If the user is not verified, send a verification email

        await createAndStoreSession(user.id, "google-oauth");

        const userEmail = user.email;

        if (userEmail) {
          // Link any applicant records that were pre-created with this email (non-fatal)
          await linkApplicantRecordsByEmail({ userId: user.id, email: userEmail });

          const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || userEmail;

          await sendEmailBestEffort({
            send: () => sendNewUserSignupNotificationEmail({
              email: userEmail,
              name: fullName,
            }),
            logger,
            message: "Failed to send new user signup notification (Google OAuth)",
            context: {
              userId: user.id,
              email: userEmail,
            },
          });

        }

        return {
          success: true,
          redirectTo: getPostAuthRedirectPath({
            isEmailVerified: Boolean(user.emailVerified),
            verifiedRedirectPath,
          }),
        };

      } catch (error) {
        logger.error("Google OAuth callback error:", { error });

        if (error instanceof ZSAError) {
          throw error;
        }

        throw new ZSAError(
          "INTERNAL_SERVER_ERROR",
          "An unexpected error occurred"
        );
      }
    }, RATE_LIMITS.GOOGLE_SSO_CALLBACK);
  });
