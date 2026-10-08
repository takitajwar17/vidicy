import fs from 'node:fs/promises';
import path from 'node:path';
import { appRoot, cloudflareJson, writePrivateSnapshot, reportError, has } from './google-migration-common.mjs';

const service = 'vidicy-agency-redirect';
const hosts = new Set(['vidicy.com', 'www.vidicy.com', 'agency.vidicy.com']);
try {
  if (has('deploy')) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({
      main_module: 'redirect.mjs', compatibility_date: '2026-10-18',
      observability: { enabled: true },
    })], { type: 'application/json' }));
    form.append('redirect.mjs', new Blob([await fs.readFile(path.join(appRoot, 'redirect/worker.mjs'))], { type: 'application/javascript+module' }), 'redirect.mjs');
    const result = await cloudflareJson(`/workers/scripts/${service}`, { method: 'PUT', body: form });
    console.info(JSON.stringify({ status: 'redirect-worker-deployed', service, version: result.result?.version_id }));
  }
  if (has('attach-domains')) {
    // Deploying the redirect alone does not change any live domain. Domain
    // attachment is a separate, explicit step after the target app is ready.
    const listing = await cloudflareJson('/workers/domains');
    const domains = listing.result.filter(domain => hosts.has(domain.hostname));
    if (domains.length !== hosts.size || domains.some(domain => !['vidicy-agency', service].includes(domain.service))) {
      throw new Error('Unexpected agency domain ownership; no domains changed');
    }
    await writePrivateSnapshot('before-redirect-domain-attachment', { domains });
    for (const domain of domains) {
      if (domain.service === service) continue;
      const result = await cloudflareJson('/workers/domains', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        // Ownership was checked above. Cloudflare requires this flag when
        // moving an existing custom domain from the app to the redirect.
        body: JSON.stringify({ hostname: domain.hostname, zone_id: domain.zone_id, service, environment: 'production', enabled: true, override_existing_origin: true }),
      });
      if (result.result?.service !== service) throw new Error('Unexpected redirect domain response');
      console.info(JSON.stringify({ status: 'redirect-domain-attached', hostname: domain.hostname, service }));
    }
  }
  if (!has('deploy') && !has('attach-domains')) throw new Error('Missing --deploy or --attach-domains');
} catch (error) { reportError(error); }
