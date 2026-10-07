import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseWranglerConfig } from './utils/parse-wrangler.mjs';

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const migrationRoot = path.resolve(appRoot, '../..', '.gcp-migration');
try { process.loadEnvFile(path.join(appRoot, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
export const source = parseWranglerConfig();
export function option(name, fallback) { return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback; }
export function has(name) { return process.argv.includes(`--${name}`); }
export function identifier(value) { return `"${value.replaceAll('"', '""')}"`; }
export function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function digest(value) { return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest('hex'); }
export async function writePrivateSnapshot(kind, value) {
  await fs.mkdir(migrationRoot, { recursive: true, mode: 0o700 });
  await fs.chmod(migrationRoot, 0o700);
  const file = path.join(migrationRoot, `${kind}-${new Date().toISOString().replaceAll(':', '-')}-${process.pid}.json`);
  await fs.writeFile(file, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
  return file;
}
export function accountBase() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? source.account_id;
  if (!account || !process.env.CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare account and API token are required');
  return `https://api.cloudflare.com/client/v4/accounts/${account}`;
}
export async function cloudflareResponse(suffix, init = {}) {
  const response = await fetch(`${accountBase()}${suffix}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(60_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Cloudflare request failed HTTP ${response.status}`);
  return response;
}
export async function cloudflareJson(suffix, init) {
  const response = await cloudflareResponse(suffix, init);
  const data = await response.json();
  if (!data.success) throw new Error(`Cloudflare API rejected request; codes ${(data.errors ?? []).map(error => error.code).join(',')}`);
  return data;
}
export async function d1Query(sql, params = []) {
  const databaseId = option('source-database', source.d1_databases[0].database_id);
  const data = await cloudflareJson(`/d1/database/${databaseId}/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql, params }),
  });
  if (data.result?.length !== 1 || data.result[0].success === false) throw new Error('Unexpected D1 result');
  return data.result[0].results;
}
export function reportError(error) {
  // Driver errors can include credentials, SQL parameters or document contents.
  // Print only controlled migration messages and an optional machine error code.
  const isControlled = !error.code && /^(Cloudflare|Unexpected|Source|Target|Migration|Missing|Invalid|Unsupported|Foreign|Schema|Snapshot|Vector|GCS|R2|Set )/.test(error.message ?? '');
  console.error(JSON.stringify({ status: 'failed', message: isControlled ? error.message : 'Migration operation failed; no sensitive driver details printed', code: error.code ?? null }));
  process.exitCode = 1;
}
