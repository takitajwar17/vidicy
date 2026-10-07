import { createRequire } from 'node:module';
const { createClient } = createRequire(import.meta.url)(process.env.REDIS_MODULE_PATH ?? 'redis');

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token || !process.env.REDIS_URL) throw new Error('Migration credentials are required');
const namespaces = [
  { id: 'bae149071db84f37a556dd742393e845', prefix: 'vidicy:cache:', prefixes: ['session:', 'password-reset:', 'email-verification:'] },
  { id: 'fad0c395cfc041369fc36322eb55dead', prefix: 'vidicy:app:', prefixes: [''] },
];
const redis = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 10_000 } });
redis.on('error', () => console.error('Memorystore connection failed'));
async function request(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Source KV request failed HTTP ${response.status}`);
  return response;
}
try {
  await redis.connect();
  let copied = 0;
  let identical = 0;
  for (const namespace of namespaces) for (const prefix of namespace.prefixes) {
    let cursor;
    do {
      const parameters = new URLSearchParams({ limit: '1000', prefix });
      if (cursor) parameters.set('cursor', cursor);
      const base = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace.id}`;
      const page = await (await request(`${base}/keys?${parameters}`)).json();
      if (!page.success || !Array.isArray(page.result)) throw new Error('Invalid source KV listing');
      for (const key of page.result) {
        const now = Math.floor(Date.now() / 1000);
        if (key.expiration && key.expiration <= now) continue;
        const value = await (await request(`${base}/values/${encodeURIComponent(key.name)}`)).text();
        const destination = `${namespace.prefix}${key.name}`;
        const current = await redis.get(destination);
        if (current !== null && current !== value) throw new Error('Target KV value differs; source not overwritten');
        if (current === value) { identical += 1; continue; }
        if (key.expiration && key.expiration <= Math.floor(Date.now() / 1000)) continue;
        await redis.set(destination, value, key.expiration ? { EXAT: key.expiration, NX: true } : { NX: true });
        if (await redis.get(destination) !== value) throw new Error('KV copy read-back mismatch');
        copied += 1;
      }
      cursor = page.result_info?.cursor;
    } while (cursor);
  }
  console.info(JSON.stringify({ status: 'kv-copied-and-compared', copied, identical }));
} catch {
  console.error('KV migration failed; no secret values were logged');
  process.exitCode = 1;
} finally {
  if (redis.isOpen) await redis.quit();
}
