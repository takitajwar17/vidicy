import { SITE_DOMAIN } from "@/constants";

export function supportTicketReplyText({
  subject,
  status,
  adminReply,
  userName,
  supportUrl,
}: {
  subject: string;
  status: string;
  adminReply: string;
  userName: string;
  supportUrl: string;
}): string {
  const statusLabel = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return `Hi ${userName},

Your support ticket has been updated.

Subject: ${subject}
Status: ${statusLabel}

Message from our team:
${adminReply}

View your tickets: ${supportUrl}

If you have further questions, please reply from your dashboard.

—
${SITE_DOMAIN}`;
}
