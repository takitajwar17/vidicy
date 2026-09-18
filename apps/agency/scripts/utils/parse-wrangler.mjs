import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Parses the wrangler.jsonc file and returns the configuration object
 * @returns {object} The parsed wrangler configuration
 * @throws {Error} If the file cannot be read or parsed
 */
export function parseWranglerConfig() {
  const wranglerPath = path.join(__dirname, '..', '..', 'wrangler.jsonc');
  const wranglerContent = fs.readFileSync(wranglerPath, 'utf8');

  // Remove JSONC comments safely (avoid stripping // inside strings)
  // 1. Block comments are safe to remove with non-greedy match
  // 2. Line comments: only strip // that aren't inside quoted strings
  let inString = false;
  let escaped = false;
  let result = '';
  for (let i = 0; i < wranglerContent.length; i++) {
    const ch = wranglerContent[i];
    const next = wranglerContent[i + 1];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (!inString) {
      // Block comment
      if (ch === '/' && next === '*') {
        const end = wranglerContent.indexOf('*/', i + 2);
        i = end !== -1 ? end + 1 : wranglerContent.length;
        continue;
      }
      // Line comment
      if (ch === '/' && next === '/') {
        const end = wranglerContent.indexOf('\n', i);
        i = end !== -1 ? end - 1 : wranglerContent.length;
        continue;
      }
    }

    result += ch;
  }

  // Fix trailing commas (valid in JSONC but not JSON)
  const fixedJsonContent = result.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(fixedJsonContent);
  } catch (error) {
    throw new Error(`Failed to parse wrangler.jsonc: ${error.message}`);
  }
}

/**
 * Gets the D1 database configuration from wrangler.jsonc
 * @returns {{ name: string, id: string } | null} The database configuration or null if not found
 */
export function getD1Database() {
  const config = parseWranglerConfig();
  const d1Config = config.d1_databases?.[0];

  if (!d1Config) {
    return null;
  }

  return {
    name: d1Config.database_name,
    id: d1Config.database_id
  };
}
