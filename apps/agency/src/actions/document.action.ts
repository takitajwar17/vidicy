"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/db";
import { requireApplicationPermission } from "@/utils/application-auth";
import { revalidatePath } from "next/cache";
import { logger } from "@/infra/logger";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import {
  uploadedDocumentTable,
  checklistItemTable,
  APPLICATION_PERMISSIONS,
  CHECKLIST_ITEM_STATUS,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// setDocumentActiveAction — bumps uploadedAt to now making this the active doc
// ---------------------------------------------------------------------------

export const setDocumentActiveAction = createServerAction()
  .input(z.object({
    documentId: z.string().min(1),
    applicationId: z.string().min(1),
  }))
  .handler(async ({ input }) => {
    await requireApplicationPermission(input.applicationId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);

    const db = getDB();

    const doc = await db.query.uploadedDocumentTable.findFirst({
      where: and(
        eq(uploadedDocumentTable.id, input.documentId),
        eq(uploadedDocumentTable.applicationId, input.applicationId),
      ),
    });

    if (!doc) throw new ZSAError("NOT_FOUND", "Document not found");

    await db
      .update(uploadedDocumentTable)
      .set({ uploadedAt: new Date() })
      .where(eq(uploadedDocumentTable.id, input.documentId));

    revalidatePath(`/dashboard/${input.applicationId}`);
    return { success: true };
  });

// ---------------------------------------------------------------------------
// deleteDocumentAction
// ---------------------------------------------------------------------------

export const deleteDocumentAction = createServerAction()
  .input(z.object({
    documentId: z.string().min(1),
    applicationId: z.string().min(1),
  }))
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(input.applicationId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);
    await checkActionRateLimit("deleteDocument", session.userId, 30);

    const db = getDB();

    const doc = await db.query.uploadedDocumentTable.findFirst({
      where: and(
        eq(uploadedDocumentTable.id, input.documentId),
        eq(uploadedDocumentTable.applicationId, input.applicationId),
      ),
    });

    if (!doc) throw new ZSAError("NOT_FOUND", "Document not found");

    try {
      const { env } = await getCloudflareContext({ async: true });

      const deletions: Promise<unknown>[] = [];

      if (env.R2) {
        deletions.push(env.R2.delete(doc.fileKey));
      }

      if (env.VECTORIZE && doc.chunkCount > 0) {
        const vectorIds = Array.from(
          { length: doc.chunkCount },
          (_, i) => `${input.documentId}-${i}`
        );
        deletions.push(env.VECTORIZE.deleteByIds(vectorIds));
      }

      await Promise.all(deletions);
    } catch (cleanupError) {
      logger.warn("R2/Vectorize delete failed for document", { documentId: input.documentId, fileKey: doc.fileKey, cleanupError });
    }

    await db.delete(uploadedDocumentTable).where(eq(uploadedDocumentTable.id, input.documentId));

    if (doc.checklistItemId) {
      const remaining = await db.query.uploadedDocumentTable.findFirst({
        where: and(
          eq(uploadedDocumentTable.applicationId, input.applicationId),
          eq(uploadedDocumentTable.checklistItemId, doc.checklistItemId),
        ),
      });
      if (!remaining) {
        await db
          .update(checklistItemTable)
          .set({ status: CHECKLIST_ITEM_STATUS.PENDING })
          .where(eq(checklistItemTable.id, doc.checklistItemId));
      }
    }

    revalidatePath(`/dashboard/${input.applicationId}`);
    return { success: true };
  });
