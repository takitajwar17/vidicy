import "server-only";

import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDB } from "@/db";
import { uploadedDocumentTable, visaApplicationTable } from "@/db/schema";

import { googleJsonRequest } from "./auth";
import { createGoogleStorageBucket } from "./storage";

type VectorMetadataValue = string | number | boolean | string[];
export interface GoogleVector {
  id: string;
  values: number[];
  metadata?: Record<string, VectorMetadataValue>;
}

export interface GoogleVectorQueryOptions {
  topK?: number;
  filter?: Record<string, string>;
  returnMetadata?: "all" | "indexed" | "none" | boolean;
  returnValues?: boolean;
}

export interface GoogleVectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, VectorMetadataValue>;
  values?: number[];
}

/** Existing application contract; the provisioned index must use COSINE_DISTANCE. */
export interface GoogleVectorIndex {
  upsert(vectors: GoogleVector[]): Promise<{ count: number; mutationId: string }>;
  deleteByIds(ids: string[]): Promise<{ count: number; mutationId: string }>;
  query(values: number[], options?: GoogleVectorQueryOptions): Promise<{ count: number; matches: GoogleVectorMatch[] }>;
  describe(): Promise<{ dimensions: number; vectorCount: number }>;
}

interface VertexDatapoint {
  datapointId: string;
  featureVector?: number[];
  restricts?: Array<{ namespace: string; allowList: string[] }>;
  embeddingMetadata?: Record<string, unknown>;
}

interface NeighborResponse {
  nearestNeighbors?: Array<{
    neighbors?: Array<{ datapoint: VertexDatapoint; distance: number }>;
  }>;
}

const EMBEDDING_DIMENSIONS = 1536;
const METADATA_LIMIT_BYTES = 2048;
const SIDECAR_KEY = "_vidicyMetadataObject";
const metadataBucket = createGoogleStorageBucket();

function getConfiguration() {
  const index = process.env.VERTEX_VECTOR_INDEX;
  const endpoint = process.env.VERTEX_VECTOR_INDEX_ENDPOINT;
  const deployedIndexId = process.env.VERTEX_VECTOR_DEPLOYED_INDEX_ID;
  const publicDomain = process.env.VERTEX_VECTOR_PUBLIC_ENDPOINT_DOMAIN;
  const indexMatch = index?.match(/^projects\/([a-z0-9-]+)\/locations\/([a-z0-9-]+)\/indexes\/(\d+)$/);
  const endpointMatch = endpoint?.match(/^projects\/([a-z0-9-]+)\/locations\/([a-z0-9-]+)\/indexEndpoints\/(\d+)$/);
  if (!indexMatch || !endpointMatch || indexMatch[1] !== endpointMatch[1] || indexMatch[2] !== endpointMatch[2]) {
    throw new Error("Matching VERTEX_VECTOR_INDEX and VERTEX_VECTOR_INDEX_ENDPOINT resources are required");
  }
  if (!deployedIndexId || !/^[a-zA-Z0-9_]+$/.test(deployedIndexId)) throw new Error("VERTEX_VECTOR_DEPLOYED_INDEX_ID is required");
  if (!publicDomain || !/^[a-z0-9.-]+\.vdb\.vertexai\.goog$/.test(publicDomain)) throw new Error("Valid VERTEX_VECTOR_PUBLIC_ENDPOINT_DOMAIN is required");
  return {
    index,
    endpoint,
    deployedIndexId,
    controlUrl: `https://${indexMatch[2]}-aiplatform.googleapis.com/v1/${index}`,
    dataUrl: `https://${publicDomain}/v1/${endpoint}`,
    sidecarPrefix: `_vector-metadata/${createHash("sha256").update(index!).digest("hex")}/`,
    deletionPrefix: `_vector-deletions/${createHash("sha256").update(index!).digest("hex")}/`,
  };
}

function validateVector(values: number[]): void {
  if (values.length !== EMBEDDING_DIMENSIONS || !values.every(Number.isFinite)) {
    throw new Error(`Vector must contain ${EMBEDDING_DIMENSIONS} finite values`);
  }
}

function metadataObjectPrefix({ prefix, id }: { prefix: string; id: string }): string {
  return `${prefix}${createHash("sha256").update(id).digest("hex")}/`;
}

async function deleteMetadataObjects({ prefix, id }: { prefix: string; id: string }): Promise<void> {
  let cursor: string | undefined;
  do {
    const page = await metadataBucket.list({ prefix: metadataObjectPrefix({ prefix, id }), cursor });
    await metadataBucket.delete(page.objects.map(object => object.key));
    cursor = page.cursor;
  } while (cursor);
}

function buildRestrictions(metadata: Record<string, VectorMetadataValue>): Array<{ namespace: string; allowList: string[] }> {
  return ["applicationId", "documentId"].flatMap(namespace => {
    const value = metadata[namespace];
    return typeof value === "string" ? [{ namespace, allowList: [value] }] : [];
  });
}

/** Stream updates are acknowledged before this adapter reports success. */
export function createGoogleVectorIndex(): GoogleVectorIndex {
  return {
    async upsert(vectors) {
      const configuration = getConfiguration();
      if (vectors.length === 0) return { count: 0, mutationId: "" };
      // Validate all vectors before writes; a malformed batch must not partially
      // upload its metadata before a predictable dimensionality failure.
      for (const vector of vectors) {
        if (!vector.id) throw new Error("Vector id is required");
        validateVector(vector.values);
        if (vector.metadata && SIDECAR_KEY in vector.metadata) throw new Error("Reserved vector metadata field");
      }
      // Keep requests comfortably within the Vertex streaming API payload limit.
      for (let start = 0; start < vectors.length; start += 100) {
        const datapoints: VertexDatapoint[] = [];
        for (const vector of vectors.slice(start, start + 100)) {
          const metadata = vector.metadata ?? {};
          const serializedMetadata = JSON.stringify(metadata);
          let embeddingMetadata: Record<string, unknown> = metadata;
          if (Buffer.byteLength(serializedMetadata, "utf8") > METADATA_LIMIT_BYTES) {
            const objectPrefix = metadataObjectPrefix({ prefix: configuration.sidecarPrefix, id: vector.id });
            // Content-addressed versions prevent a failed/concurrent upsert
            // from changing the text behind a previously indexed vector.
            const objectName = `${objectPrefix}${createHash("sha256").update(serializedMetadata).digest("hex")}.json`;
            // Vertex metadata has a 2 KB limit. Full chunk text lives in a
            // private object only when it cannot fit; no text is truncated.
            await metadataBucket.put(objectName, serializedMetadata, {
              httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
            });
            embeddingMetadata = {
              applicationId: metadata.applicationId,
              documentId: metadata.documentId,
              chunkIndex: metadata.chunkIndex,
              [SIDECAR_KEY]: objectName,
            };
            if (Buffer.byteLength(JSON.stringify(embeddingMetadata), "utf8") > METADATA_LIMIT_BYTES) {
              throw new Error("Vector identity metadata exceeds the Vertex AI metadata limit");
            }
          }
          datapoints.push({
            datapointId: vector.id,
            featureVector: vector.values,
            restricts: buildRestrictions(metadata),
            embeddingMetadata,
          });
        }
        await googleJsonRequest({ url: `${configuration.controlUrl}:upsertDatapoints`, data: { datapoints } });
      }
      return { count: vectors.length, mutationId: "" };
    },
    async deleteByIds(ids) {
      const configuration = getConfiguration();
      for (let start = 0; start < ids.length; start += 1000) {
        const batch = ids.slice(start, start + 1000);
        await googleJsonRequest({ url: `${configuration.controlUrl}:removeDatapoints`, data: { datapointIds: batch } });
        // Serving replicas can still return deleted points after acknowledgement.
        // Keep metadata for 24 hours; the scheduled reconciler removes it only
        // after confirming that its source document no longer exists.
        const deletedAt = Date.now();
        const digest = createHash("sha256").update(JSON.stringify(batch)).digest("hex");
        await metadataBucket.put(`${configuration.deletionPrefix}${deletedAt}-${digest}.json`, JSON.stringify({ deletedAt, ids: batch }), {
          httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
        });
      }
      return { count: ids.length, mutationId: "" };
    },
    async query(values, options = {}) {
      validateVector(values);
      const configuration = getConfiguration();
      const topK = options.topK ?? 5;
      if (!Number.isInteger(topK) || topK < 1 || topK > 1000) throw new Error("Vector query topK must be between 1 and 1000");
      if (!options.filter?.applicationId && !options.filter?.documentId) {
        throw new Error("Vector queries require an applicationId or documentId filter");
      }
      const restricts = Object.entries(options.filter ?? {}).map(([namespace, value]) => {
        if (!["applicationId", "documentId"].includes(namespace) || typeof value !== "string") {
          throw new Error("Vector query supports exact applicationId and documentId filters only");
        }
        return { namespace, allowList: [value] };
      });
      const includeMetadata = options.returnMetadata !== "none" && options.returnMetadata !== false;
      const response = await googleJsonRequest<NeighborResponse>({
        url: `${configuration.dataUrl}:findNeighbors`,
        data: {
          deployedIndexId: configuration.deployedIndexId,
          // Identity metadata is required even when the caller does not need it.
          returnFullDatapoint: true,
          queries: [{ datapoint: { featureVector: values, restricts }, neighborCount: topK }],
        },
      });
      const neighbors = response.nearestNeighbors?.[0]?.neighbors ?? [];
      const documentIds = [...new Set(neighbors.flatMap(neighbor => {
        const id = neighbor.datapoint.embeddingMetadata?.documentId;
        return typeof id === "string" ? [id] : [];
      }))];
      // The serving index is eventually consistent. PostgreSQL is authoritative
      // for document existence and tenant identity, including case deletion.
      const documents = documentIds.length ? await getDB()
        .select({ id: uploadedDocumentTable.id, applicationId: uploadedDocumentTable.applicationId })
        .from(uploadedDocumentTable)
        .innerJoin(visaApplicationTable, eq(uploadedDocumentTable.applicationId, visaApplicationTable.id))
        .where(and(inArray(uploadedDocumentTable.id, documentIds), isNull(visaApplicationTable.trashedAt))) : [];
      const liveDocuments = new Map(documents.map(document => [document.id, document]));
      const candidates = await Promise.all(neighbors.map(async neighbor => {
        const datapoint = neighbor.datapoint;
        let metadata = datapoint.embeddingMetadata;
        const documentId = metadata?.documentId;
        const document = typeof documentId === "string" ? liveDocuments.get(documentId) : undefined;
        if (!document || metadata?.applicationId !== document.applicationId) return null;
        const vectorPrefix = `${document.id}-`;
        if (!datapoint.datapointId.startsWith(vectorPrefix)
          || !/^[0-9]+$/.test(datapoint.datapointId.slice(vectorPrefix.length))) return null;
        for (const [name, expected] of Object.entries(options.filter ?? {})) {
          if (metadata?.[name] !== expected) return null;
        }
        const objectName = metadata?.[SIDECAR_KEY];
        if (includeMetadata && typeof objectName === "string") {
          const expectedPrefix = metadataObjectPrefix({ prefix: configuration.sidecarPrefix, id: datapoint.datapointId });
          if (!objectName.startsWith(expectedPrefix) || !/^[a-f0-9]{64}\.json$/.test(objectName.slice(expectedPrefix.length))) return null;
          const object = await metadataBucket.get(objectName);
          // One stale/missing neighbor must not discard other valid results.
          if (!object) return null;
          metadata = await object.json<Record<string, VectorMetadataValue>>();
          if (metadata.documentId !== document.id || metadata.applicationId !== document.applicationId) return null;
        }
        if (!Number.isFinite(neighbor.distance)) throw new Error("Invalid Vertex vector distance");
        return {
          id: datapoint.datapointId,
          score: Math.max(-1, Math.min(1, 1 - neighbor.distance)),
          ...(includeMetadata ? { metadata: metadata as Record<string, VectorMetadataValue> | undefined } : {}),
          ...(options.returnValues ? { values: datapoint.featureVector } : {}),
        };
      }));
      const matches = candidates.filter((match): match is NonNullable<typeof match> => match !== null);
      return { count: matches.length, matches };
    },
    async describe() {
      const configuration = getConfiguration();
      const result = await googleJsonRequest<{ indexStats?: { vectorsCount?: string }; metadata?: { config?: { dimensions?: number } } }>({
        url: configuration.controlUrl,
        method: "GET",
      });
      return { dimensions: result.metadata?.config?.dimensions ?? EMBEDDING_DIMENSIONS, vectorCount: Number(result.indexStats?.vectorsCount ?? 0) };
    },
  };
}

/** Bounded cleanup called by the authenticated Scheduler reconciliation route. */
export async function cleanDeletedVectorMetadata(): Promise<number> {
  const configuration = getConfiguration();
  const page = await metadataBucket.list({ prefix: configuration.deletionPrefix, limit: 2 });
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const manifest of page.objects) {
    const timestamp = Number(manifest.key.slice(configuration.deletionPrefix.length).split("-")[0]);
    if (!Number.isFinite(timestamp) || timestamp > cutoff) continue;
    const object = await metadataBucket.get(manifest.key);
    if (!object) continue;
    const payload = await object.json<{ deletedAt: number; ids: string[] }>();
    if (!Array.isArray(payload.ids) || payload.ids.length > 1000
      || payload.deletedAt !== timestamp || !payload.ids.every(id => typeof id === "string" && /^.+-[0-9]+$/.test(id))) {
      throw new Error("Invalid vector deletion manifest");
    }
    const documentIds = [...new Set(payload.ids.map(id => id.replace(/-[0-9]+$/, "")))];
    const documents = await getDB().select({ id: uploadedDocumentTable.id }).from(uploadedDocumentTable)
      .where(inArray(uploadedDocumentTable.id, documentIds));
    const liveIds = new Set(documents.map(document => document.id));
    const obsoleteIds = payload.ids.filter(id => !liveIds.has(id.replace(/-[0-9]+$/, "")));
    for (let offset = 0; offset < obsoleteIds.length; offset += 10) {
      await Promise.all(obsoleteIds.slice(offset, offset + 10).map(id => deleteMetadataObjects({ prefix: configuration.sidecarPrefix, id })));
    }
    await metadataBucket.delete(manifest.key);
    removed += obsoleteIds.length;
  }
  return removed;
}
