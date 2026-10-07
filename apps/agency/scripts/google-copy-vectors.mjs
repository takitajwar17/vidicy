import { createHash } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';
import { source, option, has, cloudflareJson, writePrivateSnapshot, reportError } from './google-migration-common.mjs';

try {
  const name = source.vectorize[0].index_name;
  const listing = await cloudflareJson(`/vectorize/v2/indexes/${name}/list`);
  const ids = (listing.result?.vectors ?? []).map(item => typeof item === 'string' ? item : item.id);
  if (!ids.length && listing.result?.count !== 0) throw new Error('Vector inventory is not understood');
  if (listing.result?.isTruncated || listing.result?.nextCursor || ids.length > 1000) throw new Error('Vector inventory exceeds reviewed batch limit');
  const result = ids.length ? await cloudflareJson(`/vectorize/v2/indexes/${name}/get_by_ids`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
  }) : { result: [] };
  const vectors = result.result;
  if (!Array.isArray(vectors) || vectors.length !== ids.length) throw new Error('Vector source count mismatch');
  const snapshotPath = await writePrivateSnapshot('vector-export', { name, vectors });
  const index = option('index', process.env.VERTEX_VECTOR_INDEX);
  const bucket = option('target-bucket', process.env.GCS_DOCUMENT_BUCKET);
  if (!index || !/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/indexes\/\d+$/.test(index) || !bucket) throw new Error('Missing Vertex index or target bucket');
  const hash = value => createHash('sha256').update(value).digest('hex');
  const storage = new Storage();
  const datapoints = [];
  for (const vector of vectors) {
    if (!ids.includes(vector.id) || !Array.isArray(vector.values) || vector.values.length !== 1536 || !vector.values.every(Number.isFinite)) throw new Error('Invalid vector dimensions or identity');
    const metadata = vector.metadata ?? {};
    if (!metadata.documentId || !metadata.applicationId) throw new Error('Vector tenant metadata is missing');
    const serialized = JSON.stringify(metadata);
    let embeddingMetadata = metadata;
    if (Buffer.byteLength(serialized) > 2048) {
      const key = `_vector-metadata/${hash(index)}/${hash(vector.id)}/${hash(serialized)}.json`;
      if (has('apply')) await storage.bucket(bucket).file(key).save(serialized, { resumable: false, validation: 'crc32c', metadata: { contentType: 'application/json', cacheControl: 'no-store' } });
      embeddingMetadata = { applicationId: metadata.applicationId, documentId: metadata.documentId, chunkIndex: metadata.chunkIndex, _vidicyMetadataObject: key };
    }
    datapoints.push({ datapointId: vector.id, featureVector: vector.values, embeddingMetadata, restricts: ['applicationId', 'documentId'].map(namespace => ({ namespace, allowList: [metadata[namespace]] })) });
  }
  if (has('apply') && datapoints.length) {
    const region = index.split('/')[3];
    const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient();
    await client.request({ url: `https://${region}-aiplatform.googleapis.com/v1/${index}:upsertDatapoints`, method: 'POST', data: { datapoints } });
  }
  console.info(JSON.stringify({ status: has('apply') ? 'vectors-copied' : 'vectors-ready', count: datapoints.length, snapshotPath }));
} catch (error) { reportError(error); }
