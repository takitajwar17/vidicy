import { SITE_DOMAIN, SITE_URL } from "@/constants";

export function applicantInvitationText({
  inviterName,
  applicationName,
}: {
  inviterName: string;
  applicationName: string;
}): string {
  const signUpUrl = `${SITE_URL}/sign-up`;
  const safeName = inviterName.replace(/[\r\n]/g, " ").trim();
  const safeApp = applicationName.replace(/[\r\n]/g, " ").trim();

  return `Hi,

${safeName} has added you to a visa application on ${SITE_DOMAIN}: "${safeApp}".

To view the application, create a free account using the link below:

${signUpUrl}

If you already have an account, simply sign in — the application will appear in your dashboard automatically.

If you weren't expecting this, you can safely ignore this email.

—
${SITE_DOMAIN}`;
}

export function applicantAddedNotificationText({
  inviterName,
  applicationName,
  applicationId,
}: {
  inviterName: string;
  applicationName: string;
  applicationId: string;
}): string {
  const dashboardUrl = `${SITE_URL}/dashboard/${applicationId}`;
  const safeName = inviterName.replace(/[\r\n]/g, " ").trim();
  const safeApp = applicationName.replace(/[\r\n]/g, " ").trim();

  return `Hi,

${safeName} has added you to a visa application on ${SITE_DOMAIN}: "${safeApp}".

You can view the application in your dashboard:

${dashboardUrl}

—
${SITE_DOMAIN}`;
}
