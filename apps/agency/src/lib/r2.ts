import "server-only"

import { getCloudflareContext } from "@opennextjs/cloudflare"

import { MAX_DOCUMENT_FILE_SIZE } from "@/constants"
import { logger } from "@/infra/logger"

/** Maximum permitted upload size across all document upload endpoints. */
export const MAX_FILE_SIZE_BYTES = MAX_DOCUMENT_FILE_SIZE

/**
 * Returns the R2 bucket binding from Cloudflare context.
 * Throws if R2 is not available.
 */
export async function getR2Bucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true })
  if (!env.R2) {
    throw new Error("R2 binding unavailable")
  }
  return env.R2
}

interface UploadToR2Params {
  r2: R2Bucket
  fileKey: string
  bytes: Uint8Array
  contentType: string
  metadata: Record<string, string>
}

/**
 * Uploads a file to R2 with standard httpMetadata and customMetadata.
 * Returns the fileKey on success, throws on failure.
 */
export async function uploadToR2({ r2, fileKey, bytes, contentType, metadata }: UploadToR2Params): Promise<void> {
  await r2.put(fileKey, bytes, {
    httpMetadata: { contentType },
    customMetadata: metadata,
  })
}

/**
 * Sanitises a filename for safe use as part of an R2 key.
 */
export function sanitizeFileName(name: string): string {
  // Strip path traversal sequences before character filtering
  const stripped = name.replace(/\.\./g, "_")
  return stripped.replace(/[^a-zA-Z0-9._-]/g, "_")
}

/**
 * Builds a timestamped R2 key under the standard visa-documents path.
 */
export function buildR2Key(userId: string, applicationId: string, fileName: string, subPath?: string): string {
  const sanitized = sanitizeFileName(fileName)
  const base = `visa-documents/${userId}/${applicationId}`
  return subPath
    ? `${base}/${subPath}/${Date.now()}-${sanitized}`
    : `${base}/${Date.now()}-${sanitized}`
}

/**
 * Fetches an object from R2 by key.
 * Returns the R2ObjectBody, or null if not found.
 */
export async function getFromR2(r2: R2Bucket, fileKey: string): Promise<R2ObjectBody | null> {
  return r2.get(fileKey)
}

/**
 * Deletes one or more objects from R2 by key.
 * Individual failures are logged but do not reject the overall operation.
 */
export async function deleteFromR2(r2: R2Bucket, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await Promise.all(keys.map(key =>
    r2.delete(key).catch((err) => {
      logger.warn("R2 delete failed for key", { key, error: err })
    })
  ))
}
