import { PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS, SITE_DOMAIN } from "@/constants";

export function resetPasswordText({
  resetLink,
  username,
}: {
  resetLink: string;
  username: string;
}): string {
  const expirationHours = PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS / 60 / 60;

  return `Hi ${username},

We received a request to reset your password for your ${SITE_DOMAIN} account. Visit the link below to choose a new password:

${resetLink}

For security reasons, this link will expire in ${expirationHours} hours.

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.

—
${SITE_DOMAIN}`;
}
