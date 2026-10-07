import "server-only";

import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDB } from "@/db";
import { DOCUMENT_EXTRACTION_STATUS, DOCUMENT_INDEXING_STATUS, uploadedDocumentTable, visaApplicationTable } from "@/db/schema";
import { enqueueDocumentExtraction } from "@/infra/google/document-tasks";
import { verifyInternalGoogleRequest } from "@/infra/google/internal-auth";
import { cleanDeletedVectorMetadata } from "@/infra/google/vector-search";
import { logger } from "@/infra/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/** Scheduler repairs uploads whose enqueue failed and tasks that exhausted retries. */
export async function POST(request: Request): Promise<Response> {
  const authenticationError = await verifyInternalGoogleRequest({ request });
  if (authenticationError) return authenticationError;
  try {
    const now = Date.now();
    const queuedCutoff = new Date(now - 2 * 60 * 1000);
    const processingCutoff = new Date(now - 10 * 60 * 1000);
    const bucket = Math.floor(now / (15 * 60 * 1000));
    const documents = await getDB().select({ id: uploadedDocumentTable.id })
      .from(uploadedDocumentTable)
      .innerJoin(visaApplicationTable, eq(uploadedDocumentTable.applicationId, visaApplicationTable.id))
      .where(and(
        isNull(visaApplicationTable.trashedAt),
        lt(uploadedDocumentTable.processingRecoveryCount, 3),
        or(isNull(uploadedDocumentTable.processingRecoveryBucket), ne(uploadedDocumentTable.processingRecoveryBucket, String(bucket))),
        or(
          and(eq(uploadedDocumentTable.extractionStatus, DOCUMENT_EXTRACTION_STATUS.QUEUED), lt(uploadedDocumentTable.uploadedAt, queuedCutoff)),
          and(
            inArray(uploadedDocumentTable.extractionStatus, [DOCUMENT_EXTRACTION_STATUS.EXTRACTING, DOCUMENT_EXTRACTION_STATUS.FAILED]),
            sql`coalesce(${uploadedDocumentTable.extractedAt}, ${uploadedDocumentTable.uploadedAt}) < ${processingCutoff}`,
          ),
          and(
            inArray(uploadedDocumentTable.extractionStatus, [DOCUMENT_EXTRACTION_STATUS.COMPLETED, DOCUMENT_EXTRACTION_STATUS.PARTIAL]),
            eq(uploadedDocumentTable.indexingStatus, DOCUMENT_INDEXING_STATUS.QUEUED),
            sql`coalesce(${uploadedDocumentTable.extractedAt}, ${uploadedDocumentTable.uploadedAt}) < ${queuedCutoff}`,
          ),
          and(
            inArray(uploadedDocumentTable.extractionStatus, [DOCUMENT_EXTRACTION_STATUS.COMPLETED, DOCUMENT_EXTRACTION_STATUS.PARTIAL]),
            inArray(uploadedDocumentTable.indexingStatus, [DOCUMENT_INDEXING_STATUS.INDEXING, DOCUMENT_INDEXING_STATUS.FAILED]),
            sql`coalesce(${uploadedDocumentTable.indexingAttemptedAt}, ${uploadedDocumentTable.extractedAt}, ${uploadedDocumentTable.uploadedAt}) < ${processingCutoff}`,
          ),
        ),
      ))
      // Rotate a bounded selection each time bucket so permanently failing old
      // files cannot prevent recovery of newer uploads when the backlog is large.
      .orderBy(sql`md5(${uploadedDocumentTable.id} || ${String(bucket)})`)
      .limit(30);
    let enqueued = 0;
    let failed = 0;
    for (let offset = 0; offset < documents.length; offset += 3) {
      const results = await Promise.allSettled(documents.slice(offset, offset + 3).map(async document => {
        // Reserve one of three recovery attempts atomically. A lost enqueue
        // response must not create an unlimited stream of model calls.
        const claimed = await getDB().update(uploadedDocumentTable).set({
          processingRecoveryCount: sql`${uploadedDocumentTable.processingRecoveryCount} + 1`,
          processingRecoveryBucket: String(bucket),
        }).where(and(
          eq(uploadedDocumentTable.id, document.id),
          lt(uploadedDocumentTable.processingRecoveryCount, 3),
          or(isNull(uploadedDocumentTable.processingRecoveryBucket), ne(uploadedDocumentTable.processingRecoveryBucket, String(bucket))),
        )).returning({ id: uploadedDocumentTable.id });
        if (!claimed.length) return;
        return enqueueDocumentExtraction({ documentId: document.id, version: `recovery:${bucket}` });
      }));
      for (const result of results) {
        if (result.status === "fulfilled") enqueued += 1;
        else failed += 1;
      }
    }
    // Cleanup is also durable: failed manifests remain for the next run.
    let removedMetadata = 0;
    try {
      removedMetadata = await cleanDeletedVectorMetadata();
    } catch {
      failed += 1;
      logger.warn("Vector metadata cleanup requires another attempt");
    }
    if (failed > 0) {
      return Response.json({ enqueued, failed, removedMetadata }, { status: 503 });
    }
    return Response.json({ enqueued, failed, removedMetadata });
  } catch {
    logger.error("Document reconciliation requires another attempt");
    return Response.json({ error: "Document reconciliation is unavailable" }, { status: 503 });
  }
}
