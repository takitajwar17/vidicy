import { SITE_DOMAIN, SITE_URL } from "@/constants";

export function supportTicketAdminText({
  ticketId,
  subject,
  category,
  description,
  userName,
  userEmail,
}: {
  ticketId: string;
  subject: string;
  category: string;
  description: string;
  userName: string;
  userEmail: string;
}): string {
  const ticketUrl = `${SITE_URL}/admin/support?id=${ticketId}`;
  const categoryLabel = category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return `New support ticket on ${SITE_DOMAIN}

From: ${userName} (${userEmail})
Category: ${categoryLabel}
Subject: ${subject}
Ticket ID: ${ticketId}

Description:
${description}

View & respond: ${ticketUrl}

—
${SITE_DOMAIN}`;
}
