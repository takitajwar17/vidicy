import "server-only";

import { CloudTasksClient } from "@google-cloud/tasks";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { logger } from "@/infra/logger";

export interface DocumentExtractionTaskPayload {
  documentId: string;
  version: string;
}

let client: CloudTasksClient | undefined;
let lockPool: Pool | undefined;

/** Locks must never consume the pool used by the document pipeline itself. */
export function getDocumentTaskLockPool(): Pool {
  if (!lockPool) {
    if (!process.env.DATABASE_URL && !process.env.PGHOST) {
      throw new Error("PostgreSQL configuration is required for document locks");
    }
    lockPool = new Pool({
      ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}),
      max: 3,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 10_000,
    });
    lockPool.on("error", () => logger.error("An idle document lock connection failed"));
  }
  return lockPool;
}

export function getDocumentTaskConfiguration() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const region = process.env.GOOGLE_CLOUD_REGION ?? "asia-southeast1";
  const serviceAccountEmail = process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT;
  const baseUrl = process.env.DOCUMENT_TASK_BASE_URL;
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for document tasks");
  if (!serviceAccountEmail || !/^[a-zA-Z0-9._-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(serviceAccountEmail)) {
    throw new Error("GOOGLE_CLOUD_SERVICE_ACCOUNT is required for document tasks");
  }
  if (!baseUrl) throw new Error("DOCUMENT_TASK_BASE_URL is required");
  const parsedUrl = new URL(baseUrl);
  // Use the canonical service URL both as the OIDC audience and task target.
  // A configured arbitrary URL must never receive our service account token.
  if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith(".run.app")
    || parsedUrl.port || parsedUrl.username || parsedUrl.password
    || parsedUrl.search || parsedUrl.hash || !["", "/"].includes(parsedUrl.pathname)) {
    throw new Error("DOCUMENT_TASK_BASE_URL must be the HTTPS Cloud Run service origin");
  }
  return {
    project,
    region,
    serviceAccountEmail,
    audience: parsedUrl.origin,
    url: `${parsedUrl.origin}/api/internal/document-extraction`,
    queuePath: `projects/${project}/locations/${region}/queues/vidicy-document-extraction`,
  };
}

export function isDocumentExtractionTaskPayload(value: unknown): value is DocumentExtractionTaskPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.documentId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(candidate.documentId)
    && typeof candidate.version === "string" && candidate.version.length >= 1 && candidate.version.length <= 256
    && Object.keys(candidate).every(key => key === "documentId" || key === "version");
}

/** Await this call before acknowledging an upload. Never use fire-and-forget. */
export async function enqueueDocumentExtraction({ documentId, version = "initial" }: {
  documentId: string;
  /** Supply a new version to enqueue again after retry exhaustion. */
  version?: string;
}): Promise<{ taskName: string; deduplicated: boolean }> {
  const payload: DocumentExtractionTaskPayload = { documentId, version };
  if (!isDocumentExtractionTaskPayload(payload)) throw new Error("Invalid document extraction task payload");
  const configuration = getDocumentTaskConfiguration();
  client ??= new CloudTasksClient();
  // Fresh uploads have fresh document IDs. Repeated enqueue attempts for one
  // upload reuse a hashed ID, including retries after an uncertain API response.
  const taskId = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const taskName = `${configuration.queuePath}/tasks/${taskId}`;
  try {
    await client.createTask({
      parent: configuration.queuePath,
      task: {
        name: taskName,
        dispatchDeadline: { seconds: 1800 },
        httpRequest: {
          url: configuration.url,
          httpMethod: "POST",
          headers: { "Content-Type": "application/json" },
          body: Buffer.from(JSON.stringify(payload)),
          oidcToken: {
            serviceAccountEmail: configuration.serviceAccountEmail,
            audience: configuration.audience,
          },
        },
      },
    }, { timeout: 30_000 });
    return { taskName, deduplicated: false };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code === 6 || code === "ALREADY_EXISTS") return { taskName, deduplicated: true };
    // SDK errors can contain credentials and request details. The caller gets
    // a safe error and must fail the upload response if enqueue was not accepted.
    throw new Error("Cloud Tasks could not accept document extraction work");
  }
}
