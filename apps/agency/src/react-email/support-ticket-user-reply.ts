import { SITE_DOMAIN, SITE_URL } from "@/constants";

export function supportTicketUserReplyText({
  ticketId,
  subject,
  category,
  userName,
  userEmail,
  messageContent,
}: {
  ticketId: string;
  subject: string;
  category: string;
  userName: string;
  userEmail: string;
  messageContent: string;
}): string {
  const ticketUrl = `${SITE_URL}/admin/support?id=${ticketId}`;
  const categoryLabel = category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return `User replied to a support ticket on ${SITE_DOMAIN}

From: ${userName} (${userEmail})
Category: ${categoryLabel}
Subject: ${subject}
Ticket ID: ${ticketId}

Message:
${messageContent}

View ticket: ${ticketUrl}

—
${SITE_DOMAIN}`;
}
