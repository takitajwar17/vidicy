import { eq } from "drizzle-orm";

import { getDB } from "@/db";
import { logger } from "@/infra/logger";
import { marketingContactTable } from "@/db/schema";

type Database = ReturnType<typeof getDB>;

interface ResendWebhookEvent {
  type: string;
  data?: Record<string, unknown>;
}

function getContactEmail(data: Record<string, unknown> | undefined) {
  const directEmail = data?.email;
  if (typeof directEmail === "string" && directEmail.length > 0) {
    return directEmail;
  }

  const nestedEmail = data?.object && typeof data.object === "object" && "email" in data.object
    ? (data.object as { email?: unknown }).email
    : null;

  return typeof nestedEmail === "string" && nestedEmail.length > 0 ? nestedEmail : null;
}

function getUnsubscribedState(data: Record<string, unknown> | undefined) {
  if (typeof data?.unsubscribed === "boolean") {
    return data.unsubscribed;
  }

  const nested = data?.object && typeof data.object === "object" && "unsubscribed" in data.object
    ? (data.object as { unsubscribed?: unknown }).unsubscribed
    : null;

  return typeof nested === "boolean" ? nested : null;
}

function getRecipientEmails(data: Record<string, unknown> | undefined) {
  const recipients = data?.to;

  if (!Array.isArray(recipients)) {
    return [];
  }

  return recipients
    .map((recipient) => {
      if (typeof recipient === "string") {
        return recipient;
      }

      if (recipient && typeof recipient === "object" && "email" in recipient) {
        const email = (recipient as { email?: unknown }).email;
        return typeof email === "string" ? email : null;
      }

      return null;
    })
    .filter((email): email is string => Boolean(email));
}

async function suppressMarketingContact(db: Database, email: string) {
  await db
    .update(marketingContactTable)
    .set({
      subscribedOnboarding: false,
      subscribedPostPurchase: false,
      subscribedWinback: false,
      updatedAt: new Date(),
    })
    .where(eq(marketingContactTable.email, email));
}

export async function applyResendWebhookEvent({
  db,
  event,
}: {
  db: Database;
  event: ResendWebhookEvent;
}) {
  switch (event.type) {
    case "contact.updated": {
      const email = getContactEmail(event.data);
      const unsubscribed = getUnsubscribedState(event.data);

      if (email && unsubscribed === true) {
        await suppressMarketingContact(db, email);
      }
      return;
    }
    case "email.bounced":
    case "email.complained": {
      const recipients = getRecipientEmails(event.data);
      await Promise.all(recipients.map((email) => suppressMarketingContact(db, email)));
      return;
    }
    case "email.failed": {
      logger.warn("Resend email failed event received", {
        recipients: getRecipientEmails(event.data),
      });
      return;
    }
    default:
      logger.info("Ignoring unsupported Resend webhook event", {
        type: event.type,
      });
  }
}
