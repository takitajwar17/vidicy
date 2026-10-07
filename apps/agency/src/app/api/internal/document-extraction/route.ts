import "server-only";

import { eq } from "drizzle-orm";
import type { PoolClient } from "pg";

import { getDB } from "@/db";
import { uploadedDocumentTable } from "@/db/schema";
import { getDocumentTaskLockPool, isDocumentExtractionTaskPayload } from "@/infra/google/document-tasks";
import { logger } from "@/infra/logger";
import { verifyInternalGoogleRequest } from "@/infra/google/internal-auth";
import { queueDocumentExtraction } from "@/services/document-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

const MAX_BODY_BYTES = 4096;

async function readPayload(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("Missing task body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("Task body is too large");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  const authenticationError = await verifyInternalGoogleRequest({ request });
  if (authenticationError) return authenticationError;

  let payload: unknown;
  try {
    payload = await readPayload(request);
  } catch {
    return Response.json({ error: "Invalid task body" }, { status: 400 });
  }
  if (!isDocumentExtractionTaskPayload(payload)) {
    return Response.json({ error: "Invalid document task payload" }, { status: 400 });
  }

  const documentId = payload.documentId;
  let lockConnection: PoolClient | undefined;
  let hasLock = false;
  let hasLockConnectionError = false;
  function handleLockConnectionError() {
    // A checked-out pg client has no pool-level error listener while inference
    // runs. Handle socket loss and fail this attempt instead of crashing Node.
    hasLockConnectionError = true;
    logger.error("Document task lock connection failed", { documentId });
  }
  try {
    const database = getDB();
    lockConnection = await getDocumentTaskLockPool().connect();
    lockConnection.on("error", handleLockConnectionError);
    // Delivery is at least once. A session advisory lock prevents concurrent
    // attempts for one document from duplicating model calls or index writes.
    // It does not hold a transaction open during model inference.
    const lock = await lockConnection.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      [`vidicy:document-extraction:${documentId}`],
    );
    hasLock = lock.rows[0]?.acquired === true;
    if (!hasLock) return Response.json({ error: "Document extraction is already running" }, { status: 503 });

    const document = await database.query.uploadedDocumentTable.findFirst({
      where: eq(uploadedDocumentTable.id, documentId),
      columns: { id: true },
    });
    // A user can delete a document before its queued work starts. Acknowledge
    // that obsolete task so deletion does not create repeated failures.
    if (!document) return new Response(null, { status: 204 });

    const result = await queueDocumentExtraction({ documentId });
    if (hasLockConnectionError) throw new Error("Document task lock connection was lost");
    if (!result.extraction.success || !result.indexing.success) {
      logger.warn("Document extraction task requires another attempt", {
        documentId,
        extractionStatus: result.extraction.extractionStatus,
        indexingStatus: result.indexing.indexingStatus,
      });
      return Response.json({ error: "Document processing failed; retry required" }, { status: 503 });
    }
    return new Response(null, { status: 204 });
  } catch {
    // Do not log OCR text, source documents, authorization tokens or raw SDK errors.
    logger.error("Document extraction task failed", { documentId });
    return Response.json({ error: "Document processing is unavailable; retry required" }, { status: 503 });
  } finally {
    if (lockConnection && hasLockConnectionError) {
      lockConnection.removeListener("error", handleLockConnectionError);
      lockConnection.release(true);
      lockConnection = undefined;
    }
    if (lockConnection) {
      if (hasLock) {
        try {
          await lockConnection.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [`vidicy:document-extraction:${documentId}`]);
        } catch {
          // A connection that might still hold an advisory lock cannot return
          // to the pool. Destroy it so PostgreSQL releases all session locks.
          lockConnection.removeListener("error", handleLockConnectionError);
          lockConnection.release(true);
          lockConnection = undefined;
        }
      }
      lockConnection?.removeListener("error", handleLockConnectionError);
      lockConnection?.release();
    }
  }
}
