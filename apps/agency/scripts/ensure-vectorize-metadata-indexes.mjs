import { execFileSync } from "node:child_process";

import { parseWranglerConfig } from "./utils/parse-wrangler.mjs";

const INDEX_NAME = parseWranglerConfig().vectorize?.[0]?.index_name;
const REQUIRED_INDEXES = [
  { propertyName: "applicationId", type: "string" },
  { propertyName: "documentId", type: "string" },
];
const CREATE_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

function runWrangler(args) {
  return execFileSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseJsonFromOutput(output) {
  const start = output.search(/[\[{]/);
  if (start === -1) {
    if (
      output.includes("haven't created any metadata indexes") ||
      output.trim() === "📋 Fetching metadata indexes..."
    ) {
      return [];
    }

    throw new Error(`Could not find JSON in Wrangler output:\n${output}`);
  }

  return JSON.parse(output.slice(start));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listMetadataIndexes() {
  if (!INDEX_NAME) {
    throw new Error("Vectorize index name not found in wrangler.jsonc");
  }

  const raw = runWrangler([
    "vectorize",
    "list-metadata-index",
    INDEX_NAME,
    "--json",
  ]);
  return parseJsonFromOutput(raw);
}

async function createMetadataIndexViaApi({ propertyName, type }) {
  if (!INDEX_NAME) {
    throw new Error("Vectorize index name not found in wrangler.jsonc");
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !token) {
    return false;
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/v2/indexes/${INDEX_NAME}/metadata_index/create`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        propertyName,
        indexType: type,
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(
      `Cloudflare API metadata index create failed for ${propertyName}: ${JSON.stringify(payload)}`,
    );
  }

  return true;
}

async function ensureMetadataIndex({ propertyName, type }) {
  for (let attempt = 1; attempt <= CREATE_RETRIES; attempt += 1) {
    const existing = listMetadataIndexes();
    const existingNames = new Set(existing.map((entry) => entry.propertyName));

    if (existingNames.has(propertyName)) {
      console.log(`Vectorize metadata index already present: ${propertyName}`);
      return;
    }

    console.log(`Creating Vectorize metadata index: ${propertyName} (attempt ${attempt}/${CREATE_RETRIES})`);

    try {
      const createdViaApi = await createMetadataIndexViaApi({ propertyName, type });
      if (!createdViaApi) {
        runWrangler([
          "vectorize",
          "create-metadata-index",
          INDEX_NAME,
          "--propertyName",
          propertyName,
          "--type",
          type,
        ]);
      }
    } catch (error) {
      if (attempt === CREATE_RETRIES) {
        throw error;
      }

      console.warn(
        `Vectorize metadata index create failed for ${propertyName}; retrying after a recheck.`,
      );
    }

    await sleep(RETRY_DELAY_MS);
  }

  const finalIndexes = listMetadataIndexes();
  const finalNames = new Set(finalIndexes.map((entry) => entry.propertyName));
  if (!finalNames.has(propertyName)) {
    console.warn(
      `Vectorize metadata index creation was enqueued but is not visible yet: ${propertyName}`,
    );
  }
}

async function main() {
  for (const indexSpec of REQUIRED_INDEXES) {
    await ensureMetadataIndex(indexSpec);
  }
}

await main();
