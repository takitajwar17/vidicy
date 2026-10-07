import fs from 'node:fs/promises';
import path from 'node:path';
import { Storage } from '@google-cloud/storage';
import { migrationRoot, source, option, has, digest, cloudflareJson, cloudflareResponse, writePrivateSnapshot, reportError } from './google-migration-common.mjs';

const sourceBucket = option('source-bucket', source.r2_buckets[0].bucket_name);
const base = `/r2/buckets/${encodeURIComponent(sourceBucket)}/objects`;
const metadataFields = ['contentType', 'cacheControl', 'contentDisposition', 'contentEncoding', 'contentLanguage'];
async function listObjects() {
  let cursor; const objects = []; const cursors = new Set();
  do {
    const query = new URLSearchParams({ per_page: '1000' });
    if (cursor) query.set('cursor', cursor);
    const page = await cloudflareJson(`${base}?${query}`);
    if (!Array.isArray(page.result)) throw new Error('Unexpected R2 list response');
    objects.push(...page.result);
    if (!page.result_info?.is_truncated) break;
    cursor = page.result_info.cursor;
    if (!cursor || cursors.has(cursor)) throw new Error('Unexpected R2 pagination cursor');
    cursors.add(cursor);
  } while (cursor);
  if (new Set(objects.map(object => object.key)).size !== objects.length) throw new Error('R2 object listing contains duplicate keys');
  return objects.sort((left, right) => left.key.localeCompare(right.key));
}
function expectedMetadata(object) {
  const custom = Object.fromEntries(Object.entries(object.custom_metadata ?? {}).map(([key, value]) => [key, String(value)]));
  if ('vidicyMigrationSha256' in custom || 'vidicyMigrationSourceETag' in custom) throw new Error('R2 custom metadata uses migration reserved keys');
  return {
    ...Object.fromEntries(metadataFields.filter(field => object.http_metadata?.[field] !== undefined).map(field => [field, object.http_metadata[field]])),
    metadata: custom,
  };
}
function metadataMatches(actual, expected) {
  return metadataFields.every(field => expected[field] === undefined || actual[field] === expected[field])
    && Object.entries(expected.metadata).every(([key, value]) => actual.metadata?.[key] === value);
}
async function main() {
  const objects = await listObjects();
  await writePrivateSnapshot('r2-manifest', { sourceBucket, capturedAt: new Date().toISOString(), objects });
  const totalBytes = objects.reduce((sum, object) => sum + Number(object.size), 0);
  if (has('inventory-only')) { console.log(JSON.stringify({ status: 'source-inventory', objects: objects.length, bytes: totalBytes })); return; }
  const targetBucket = option('target-bucket', process.env.GCS_BUCKET);
  if (!targetBucket) throw new Error('Missing --target-bucket or GCS_BUCKET');
  const bucket = new Storage({ projectId: process.env.GOOGLE_CLOUD_PROJECT }).bucket(targetBucket);
  const cacheDirectory = path.join(migrationRoot, 'r2-object-cache');
  await fs.mkdir(cacheDirectory, { recursive: true, mode: 0o700 }); await fs.chmod(cacheDirectory, 0o700);
  const plan = []; let identical = 0;
  // Preflight every target before the first GCS write. Existing objects are
  // never overwritten. Content hashes are checked even on an idempotent rerun.
  for (const object of objects) {
    if (!Number.isSafeInteger(Number(object.size)) || Number(object.size) > 256 * 1024 * 1024) throw new Error('R2 object exceeds reviewed per-object size limit');
    const response = await cloudflareResponse(`${base}/${encodeURIComponent(object.key)}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length !== Number(object.size) || response.headers.get('etag')?.replaceAll('"', '') !== object.etag) throw new Error('Source object changed between listing and download');
    const sha256 = digest(body); const metadata = expectedMetadata(object);
    const file = bucket.file(object.key); const [exists] = await file.exists();
    if (exists) {
      const [current] = await file.getMetadata();
      const [stored] = await file.download({ decompress: false, validation: 'crc32c' });
      if (digest(stored) !== sha256 || !metadataMatches(current, metadata)) throw new Error('Target object differs from source; no target objects overwritten');
      identical += 1; continue;
    }
    const cacheFile = path.join(cacheDirectory, `${digest(object.key)}-${sha256}`);
    await fs.writeFile(cacheFile, body, { mode: 0o600 });
    plan.push({ object, cacheFile, sha256, metadata });
  }
  if (digest(await listObjects()) !== digest(objects)) throw new Error('Source object inventory changed during preflight');
  if (!has('apply')) { console.log(JSON.stringify({ status: 'dry-run-ready', objects: objects.length, bytes: totalBytes, identical, toCopy: plan.length })); return; }
  let copied = 0;
  for (const item of plan) {
    const file = bucket.file(item.object.key); const data = await fs.readFile(item.cacheFile);
    if (digest(data) !== item.sha256) throw new Error('Snapshot object cache checksum changed');
    await file.save(data, { resumable: false, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 }, metadata: { ...item.metadata, metadata: { ...item.metadata.metadata, vidicyMigrationSha256: item.sha256, vidicyMigrationSourceETag: item.object.etag } } });
    const [savedMetadata] = await file.getMetadata();
    const [saved] = await bucket.file(item.object.key, { generation: savedMetadata.generation }).download({ decompress: false, validation: 'crc32c' });
    if (digest(saved) !== item.sha256 || !metadataMatches(savedMetadata, item.metadata)) throw new Error('GCS post-copy verification failed');
    copied += 1;
  }
  if (digest(await listObjects()) !== digest(objects)) throw new Error('Source object inventory changed during copy; rerun preflight after the source write freeze');
  console.log(JSON.stringify({ status: 'copied-and-compared', objects: objects.length, copied, identical, bytes: totalBytes }));
}
try { await main(); } catch (error) { reportError(error); }
