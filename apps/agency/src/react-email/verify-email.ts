import { EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS, SITE_DOMAIN } from "@/constants";

export function verifyEmailText({
  verificationLink,
  username,
}: {
  verificationLink: string;
  username: string;
}): string {
  const expirationHours = EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS / 60 / 60;

  return `Hi ${username},

Thanks for signing up for ${SITE_DOMAIN}! Please verify your email address by visiting the link below:

${verificationLink}

This link will expire in ${expirationHours} hours. After that, you'll need to request a new verification email.

If you didn't create an account on ${SITE_DOMAIN}, you can safely ignore this email.

—
${SITE_DOMAIN}`;
}
