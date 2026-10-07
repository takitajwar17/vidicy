import "server-only";

import { Storage, type File, type FileMetadata } from "@google-cloud/storage";
import { Readable } from "node:stream";

export interface GoogleObjectHttpMetadata {
  contentType?: string;
  contentLanguage?: string;
  contentDisposition?: string;
  contentEncoding?: string;
  cacheControl?: string;
}

/** The subset of the R2 object contract used by the agency application. */
export interface GoogleStorageObject {
  key: string;
  size: number;
  etag: string;
  httpEtag: string;
  version: string;
  uploaded: Date;
  httpMetadata: GoogleObjectHttpMetadata;
  customMetadata: Record<string, string>;
  writeHttpMetadata(headers: Headers): void;
}

export interface GoogleStorageObjectBody extends GoogleStorageObject {
  readonly body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export interface GoogleStoragePutOptions {
  httpMetadata?: GoogleObjectHttpMetadata;
  customMetadata?: Record<string, string>;
}

export interface GoogleStorageListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
  delimiter?: string;
}

/** Deliberately excludes R2 multipart uploads and conditional/ranged requests. */
export interface GoogleStorageBucket {
  get(key: string): Promise<GoogleStorageObjectBody | null>;
  head(key: string): Promise<GoogleStorageObject | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | Blob | ReadableStream<Uint8Array>, options?: GoogleStoragePutOptions): Promise<GoogleStorageObject>;
  delete(keys: string | string[]): Promise<void>;
  list(options?: GoogleStorageListOptions): Promise<{
    objects: GoogleStorageObject[];
    truncated: boolean;
    cursor?: string;
    delimitedPrefixes: string[];
  }>;
}

let storage: Storage | undefined;

function getStorage(): Storage {
  storage ??= new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
  return storage;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && Number(error.code) === 404;
}

function describeObject({ key, metadata }: { key: string; metadata: FileMetadata }): GoogleStorageObject {
  const httpMetadata: GoogleObjectHttpMetadata = {
    contentType: metadata.contentType,
    contentLanguage: metadata.contentLanguage,
    contentDisposition: metadata.contentDisposition,
    contentEncoding: metadata.contentEncoding,
    cacheControl: metadata.cacheControl,
  };
  const customMetadata = Object.fromEntries(
    Object.entries(metadata.metadata ?? {}).map(([name, value]) => [name, String(value)]),
  );
  const etag = String(metadata.etag ?? metadata.generation ?? "");
  return {
    key,
    size: Number(metadata.size ?? 0),
    etag,
    httpEtag: `"${etag.replaceAll('"', "")}"`,
    version: String(metadata.generation ?? ""),
    uploaded: new Date(metadata.timeCreated ?? metadata.updated ?? Date.now()),
    httpMetadata,
    customMetadata,
    writeHttpMetadata(headers) {
      const fields = {
        "content-type": httpMetadata.contentType,
        "content-language": httpMetadata.contentLanguage,
        "content-disposition": httpMetadata.contentDisposition,
        "content-encoding": httpMetadata.contentEncoding,
        "cache-control": httpMetadata.cacheControl,
      };
      for (const [name, value] of Object.entries(fields)) {
        if (value !== undefined) headers.set(name, value);
      }
    },
  };
}

async function readMetadata(file: File): Promise<FileMetadata | null> {
  try {
    const [metadata] = await file.getMetadata();
    return metadata;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Uses application default credentials, including the Cloud Run service account. */
export function createGoogleStorageBucket(): GoogleStorageBucket {
  // Resolve configuration lazily so Next.js can collect routes during image builds.
  function getBucket() {
    const bucketName = process.env.GCS_DOCUMENT_BUCKET;
    if (!bucketName) throw new Error("GCS_DOCUMENT_BUCKET is required");
    return getStorage().bucket(bucketName);
  }

  return {
    async get(key) {
      const bucket = getBucket();
      const metadata = await readMetadata(bucket.file(key));
      if (!metadata) return null;
      // Pin reads to the generation whose metadata was returned. An overwrite
      // must never combine new file bytes with old object metadata.
      const file = bucket.file(key, { generation: metadata.generation });
      let body: ReadableStream<Uint8Array> | undefined;
      const readBody = function (): ReadableStream<Uint8Array> {
        body ??= Readable.toWeb(file.createReadStream({ decompress: false })) as ReadableStream<Uint8Array>;
        return body;
      };
      const arrayBuffer = function (): Promise<ArrayBuffer> {
        return new Response(readBody()).arrayBuffer();
      };
      return {
        ...describeObject({ key, metadata }),
        get body() { return readBody(); },
        arrayBuffer,
        async text() { return new TextDecoder().decode(await arrayBuffer()); },
        async json<T = unknown>() { return JSON.parse(new TextDecoder().decode(await arrayBuffer())) as T; },
      };
    },
    async head(key) {
      const metadata = await readMetadata(getBucket().file(key));
      return metadata ? describeObject({ key, metadata }) : null;
    },
    async put(key, value, options = {}) {
      const file = getBucket().file(key);
      const bytes = typeof value === "string" ? Buffer.from(value)
        : value instanceof ArrayBuffer ? Buffer.from(value)
          : ArrayBuffer.isView(value) ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
            : Buffer.from(await new Response(value).arrayBuffer());
      await file.save(bytes, {
        resumable: false,
        validation: "crc32c",
        metadata: {
          ...options.httpMetadata,
          metadata: options.customMetadata,
        },
      });
      const metadata = await readMetadata(file);
      if (!metadata) throw new Error("Cloud Storage upload completed but object metadata is unavailable");
      return describeObject({ key, metadata });
    },
    async delete(keys) {
      await Promise.all((Array.isArray(keys) ? keys : [keys]).map(key => getBucket().file(key).delete({ ignoreNotFound: true })));
    },
    async list(options = {}) {
      const limit = options.limit ?? 1000;
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("Storage list limit must be between 1 and 1000");
      const [files, nextQuery, response] = await getBucket().getFiles({
        autoPaginate: false,
        prefix: options.prefix,
        maxResults: limit,
        pageToken: options.cursor,
        delimiter: options.delimiter,
      });
      return {
        objects: files.map(file => describeObject({ key: file.name, metadata: file.metadata })),
        truncated: Boolean(nextQuery?.pageToken),
        cursor: nextQuery?.pageToken,
        delimitedPrefixes: (response as { prefixes?: string[] } | undefined)?.prefixes ?? [],
      };
    },
  };
}
