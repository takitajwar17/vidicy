import { SITE_NAME, SITE_URL } from "@/constants";

export interface AgencyInvitationEmailContent {
  email: string;
  agencyName: string;
  inviterName: string;
  code: string;
  expiresAt: Date;
}

export function agencyInvitationText({
  email,
  agencyName,
  inviterName,
  code,
  expiresAt,
}: AgencyInvitationEmailContent): string {
  return [
    "Hello,",
    "",
    `${inviterName} invited you to join ${agencyName} as a member.`,
    "",
    `Sign in with ${email}, then open this link and accept the invitation:`,
    `${SITE_URL}/agency-setup?code=${encodeURIComponent(code)}`,
    "",
    `Invitation code: ${code}`,
    `This code expires after 7 days, at ${expiresAt.toISOString()} (UTC). It can be used once.`,
    "",
    "You will join this agency only after you accept the invitation.",
    "If you did not expect this invitation, you can ignore this email.",
    "",
    SITE_NAME,
  ].join("\n");
}
