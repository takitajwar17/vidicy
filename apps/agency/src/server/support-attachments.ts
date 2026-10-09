import "server-only";

import { ZSAError } from "zsa";
import { eq, inArray, or, sql } from "drizzle-orm";
import { getDB } from "@/db";
import { supportMessageTable, supportTicketTable } from "@/db/schema";
import { deleteFromR2, getR2Bucket } from "@/lib/r2";
import { logger } from "@/infra/logger";

interface SupportAttachment {
  fileKey: string;
  userId: string | null;
}

export function isSupportScreenshotOwnedBy({
  fileKey,
  object,
  userId,
}: {
  fileKey: string;
  object: Pick<R2Object, "customMetadata"> | null;
  userId: string | null;
}): boolean {
  return Boolean(
    userId &&
    object?.customMetadata?.uploadedBy === userId &&
    (fileKey.startsWith(`support-screenshots/${userId}/`) ||
      fileKey.startsWith("support-screenshots/admin/")),
  );
}

export async function validateSupportScreenshots({
  keys,
  userId,
  isAdmin,
}: {
  keys: string[] | undefined;
  userId: string;
  isAdmin: boolean;
}): Promise<string[] | null> {
  if (!keys?.length) return null;
  const uniqueKeys = [...new Set(keys)];
  const bucket = await getR2Bucket();
  for (const fileKey of uniqueKeys) {
    const hasAllowedPrefix =
      fileKey.startsWith(`support-screenshots/${userId}/`) ||
      (isAdmin && fileKey.startsWith("support-screenshots/admin/"));
    if (
      !hasAllowedPrefix ||
      !isSupportScreenshotOwnedBy({ fileKey, object: await bucket.head(fileKey), userId })
    ) {
      throw new ZSAError("FORBIDDEN", "You can only attach your own screenshot uploads.");
    }
  }
  return uniqueKeys;
}

/** Call after the associated support rows have been removed. */
export async function cleanupSupportAttachments({
  attachments,
}: {
  attachments: SupportAttachment[];
}) {
  if (attachments.length === 0) return;
  try {
    const db = getDB();
    const bucket = await getR2Bucket();
    const keys = new Set<string>();
    for (const { fileKey, userId } of attachments) {
      // Old stored keys are not proof of ownership. Check namespace and uploader.
      if (
        !userId ||
        keys.has(fileKey) ||
        !(
          fileKey.startsWith(`support-screenshots/${userId}/`) ||
          fileKey.startsWith("support-screenshots/admin/")
        )
      )
        continue;
      if (!isSupportScreenshotOwnedBy({ fileKey, userId, object: await bucket.head(fileKey) }))
        continue;
      const [otherTicket, otherMessage] = await Promise.all([
        db.query.supportTicketTable.findFirst({
          where: sql`${supportTicketTable.screenshotUrls} @> ${JSON.stringify([fileKey])}::jsonb`,
          columns: { id: true },
        }),
        db.query.supportMessageTable.findFirst({
          where: sql`${supportMessageTable.screenshotUrls} @> ${JSON.stringify([fileKey])}::jsonb`,
          columns: { id: true },
        }),
      ]);
      // A shared admin upload can belong to messages on several users' tickets.
      if (!otherTicket && !otherMessage) keys.add(fileKey);
    }
    await deleteFromR2(bucket, [...keys]);
  } catch (error) {
    logger.warn("Support screenshot cleanup failed", { error });
  }
}

export async function deleteSupportDataForUser({ userId }: { userId: string }) {
  const db = getDB();
  const attachments = await db.withTransaction(async () => {
    const tickets = await db.query.supportTicketTable.findMany({
      where: eq(supportTicketTable.userId, userId),
      columns: { id: true, userId: true, screenshotUrls: true },
    });
    const ticketIds = tickets.map((ticket) => ticket.id);
    // User deletion also cascades messages authored on other users' tickets.
    const messageFilter = or(
      eq(supportMessageTable.userId, userId),
      ticketIds.length > 0 ? inArray(supportMessageTable.ticketId, ticketIds) : undefined,
    );
    const messages = await db.query.supportMessageTable.findMany({
      where: messageFilter,
      columns: { userId: true, screenshotUrls: true },
    });
    await db.delete(supportMessageTable).where(messageFilter);
    await db.delete(supportTicketTable).where(eq(supportTicketTable.userId, userId));
    return [...tickets, ...messages].flatMap((row) =>
      (row.screenshotUrls ?? []).map((fileKey) => ({ fileKey, userId: row.userId })),
    );
  });
  await cleanupSupportAttachments({ attachments });
}
