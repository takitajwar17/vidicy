import { z } from "zod";

import { AI_TIMEOUT_PERPLEXITY_MS } from "@/constants";
import { logger } from "@/infra/logger";
import { getPerplexityClient } from "@/lib/openai";

const PHOTO_TOOL_GUIDANCE_TTL_SECONDS = 7 * 24 * 60 * 60;
const PHOTO_TOOL_ATTEMPT_TTL_SECONDS = 60 * 60;
const PHOTO_TOOL_CACHE_VERSION = 1 as const;

export const PHOTO_TOOL_REFRESH_SLUGS = [
  "us-visa-photo-requirements",
  "schengen-visa-photo-requirements",
] as const;

type PhotoToolSlug = (typeof PHOTO_TOOL_REFRESH_SLUGS)[number];

interface PhotoToolsRefreshEnv {
  APP_KV?: KVNamespace;
}

const photoToolGuidanceSchema = z.object({
  slug: z.enum(PHOTO_TOOL_REFRESH_SLUGS),
  title: z.string().min(1),
  summary: z.string().min(1),
  refreshedAt: z.string().min(1),
  source: z.literal("perplexity"),
  officialSources: z.array(
    z.object({
      label: z.string().min(1),
      url: z.string().url(),
      note: z.string().min(1),
    }),
  ).min(1),
  hardRequirements: z.array(
    z.object({
      label: z.string().min(1),
      detail: z.string().min(1),
    }),
  ).min(3),
  commonMistakes: z.array(z.string().min(1)).min(3),
  seoNotes: z.array(z.string().min(1)).default([]),
});

type PhotoToolGuidanceRecord = z.infer<typeof photoToolGuidanceSchema>;

interface PhotoToolCacheMetadata {
  storedAt: number;
  slug: PhotoToolSlug;
  version: number;
}

export interface PhotoToolRefreshSummary {
  refreshed: number;
  skippedFresh: number;
  skippedAttemptGuard: number;
  failed: number;
}

function getCacheKey(slug: PhotoToolSlug) {
  return `marketing:photo-tools:guidance:v1:${slug}`;
}

function getAttemptKey(slug: PhotoToolSlug) {
  return `marketing:photo-tools:guidance-attempt:v1:${slug}`;
}

function getSlugContext(slug: PhotoToolSlug) {
  switch (slug) {
    case "us-visa-photo-requirements":
      return {
        routeName: "US visa photo requirements",
        countryLabel: "United States",
        priorityRules: [
          "2 x 2 inch square photo for digital and printed workflows",
          "Plain white or off-white background with no shadows",
          "Neutral expression, eyes open, head centered, no glasses unless a medical exception applies",
          "Recent photo taken within the last six months",
        ],
        query: [
          "official US Department of State visa photo requirements",
          "US visa photo rules 2026 glasses background size resolution",
          "trusted government sources only",
        ].join(". "),
      };
    case "schengen-visa-photo-requirements":
      return {
        routeName: "Schengen visa photo requirements",
        countryLabel: "Schengen Area",
        priorityRules: [
          "35 x 45 mm passport-style photo is the common baseline",
          "Plain light background and even lighting with no shadows",
          "Recent photo with neutral expression and face fully visible",
          "Confirm country-specific embassy or visa-center variations before submission",
        ],
        query: [
          "official Schengen visa photo requirements 2026",
          "Schengen photo size 35x45 background expression face rules official sources",
          "government, embassy, consulate, VFS, TLScontact, or BLS sources only",
        ].join(". "),
      };
    default: {
      throw new Error(`Unsupported photo tool slug: ${slug}`);
    }
  }
}

function getParsedStoredAt(
  metadata: unknown,
  record: Partial<PhotoToolGuidanceRecord> | null,
) {
  if (metadata && typeof metadata === "object" && "storedAt" in metadata) {
    const storedAt = (metadata as Partial<PhotoToolCacheMetadata>).storedAt;
    if (typeof storedAt === "number") {
      return storedAt;
    }
  }

  if (record?.refreshedAt) {
    const parsed = Date.parse(record.refreshedAt);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseModelJson(content: string): unknown {
  const trimmed = content.trim();

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return JSON.parse(trimmed);
}

async function readFreshnessState(
  kv: KVNamespace,
  slug: PhotoToolSlug,
) {
  const cacheKey = getCacheKey(slug);
  const cached = await kv.getWithMetadata<PhotoToolGuidanceRecord>(cacheKey, "json");
  const storedAt = getParsedStoredAt(cached.metadata, cached.value);

  return {
    cacheKey,
    cached: cached.value ?? null,
    storedAt,
  };
}

async function shouldSkipRecentAttempt(
  kv: KVNamespace,
  slug: PhotoToolSlug,
  now: Date,
) {
  const attemptKey = getAttemptKey(slug);
  const attempt = await kv.get(attemptKey, "json") as { attemptedAt?: number } | null;
  const attemptedAt = attempt?.attemptedAt;

  if (typeof attemptedAt !== "number") {
    return false;
  }

  return now.getTime() - attemptedAt < PHOTO_TOOL_ATTEMPT_TTL_SECONDS * 1000;
}

async function markAttempt(
  kv: KVNamespace,
  slug: PhotoToolSlug,
  now: Date,
) {
  await kv.put(
    getAttemptKey(slug),
    JSON.stringify({ attemptedAt: now.getTime() }),
    {
      expirationTtl: PHOTO_TOOL_ATTEMPT_TTL_SECONDS,
    },
  );
}

function buildPerplexityPrompt(slug: PhotoToolSlug) {
  const context = getSlugContext(slug);

  return [
    `You maintain guidance metadata for the ${context.routeName} free tool.`,
    "Return ONLY valid JSON with the exact schema requested.",
    "Use only current official sources from government, embassy, consulate, visa-center, or equivalent primary sources.",
    "Do not mention that you are an AI.",
    "Do not include markdown, code fences, or commentary outside JSON.",
    "",
    `Route: ${context.routeName}`,
    `Region: ${context.countryLabel}`,
    `Priority rules to verify: ${context.priorityRules.join(" | ")}`,
    `Search focus: ${context.query}`,
    "",
    "JSON schema:",
    "{",
    '  "slug": "exact slug",',
    '  "title": "short page title",',
    '  "summary": "2-4 sentence summary of the current photo rules",',
    '  "refreshedAt": "ISO timestamp",',
    '  "source": "perplexity",',
    '  "officialSources": [{"label":"source title","url":"https://...","note":"why it matters"}],',
    '  "hardRequirements": [{"label":"rule name","detail":"specific rule"}],',
    '  "commonMistakes": ["mistake 1", "mistake 2", "mistake 3"],',
    '  "seoNotes": ["search intent note", "conversion note"]',
    "}",
  ].join("\n");
}

async function refreshPhotoToolGuidanceForSlug({
  kv,
  slug,
  now,
}: {
  kv: KVNamespace;
  slug: PhotoToolSlug;
  now: Date;
}): Promise<"refreshed" | "skippedFresh" | "skippedAttemptGuard" | "failed"> {
  const freshnessState = await readFreshnessState(kv, slug);
  const ageMs = freshnessState.storedAt === null ? null : now.getTime() - freshnessState.storedAt;

  if (ageMs !== null && ageMs < PHOTO_TOOL_GUIDANCE_TTL_SECONDS * 1000) {
    logger.info("Photo tool guidance refresh skipped; cache is fresh", {
      slug,
      ageMs,
    });
    return "skippedFresh";
  }

  if (await shouldSkipRecentAttempt(kv, slug, now)) {
    logger.info("Photo tool guidance refresh skipped; recent attempt guard active", {
      slug,
    });
    return "skippedAttemptGuard";
  }

  await markAttempt(kv, slug, now);

  try {
    const perplexity = getPerplexityClient();
    const response = await perplexity.chat.completions.create(
      {
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content: "You are a source-grounded visa photo requirements researcher.",
          },
          {
            role: "user",
            content: buildPerplexityPrompt(slug),
          },
        ],
        temperature: 0.1,
      },
      { signal: AbortSignal.timeout(AI_TIMEOUT_PERPLEXITY_MS) },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Perplexity response was empty");
    }

    const parsed = parseModelJson(content);
    const validated = photoToolGuidanceSchema.parse(parsed);

    const record: PhotoToolGuidanceRecord = {
      ...validated,
      slug,
      source: "perplexity",
      refreshedAt: now.toISOString(),
    };

    await kv.put(getCacheKey(slug), JSON.stringify(record), {
      expirationTtl: PHOTO_TOOL_GUIDANCE_TTL_SECONDS,
      metadata: {
        storedAt: now.getTime(),
        slug,
        version: PHOTO_TOOL_CACHE_VERSION,
      } satisfies PhotoToolCacheMetadata,
    });

    logger.info("Photo tool guidance refreshed", {
      slug,
      sourceCount: record.officialSources.length,
      hardRequirementCount: record.hardRequirements.length,
    });

    return "refreshed";
  } catch (error) {
    logger.warn("Photo tool guidance refresh failed", {
      slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}

export async function runPhotoToolGuidanceRefreshPass({
  env,
  now = new Date(),
}: {
  env: PhotoToolsRefreshEnv;
  now?: Date;
}): Promise<PhotoToolRefreshSummary> {
  const summary: PhotoToolRefreshSummary = {
    refreshed: 0,
    skippedFresh: 0,
    skippedAttemptGuard: 0,
    failed: 0,
  };

  const kv = env.APP_KV;
  if (!kv) {
    logger.warn("Photo tool guidance refresh skipped; APP_KV binding missing");
    return summary;
  }

  for (const slug of PHOTO_TOOL_REFRESH_SLUGS) {
    const result = await refreshPhotoToolGuidanceForSlug({ kv, slug, now });

    switch (result) {
      case "refreshed":
        summary.refreshed += 1;
        break;
      case "skippedFresh":
        summary.skippedFresh += 1;
        break;
      case "skippedAttemptGuard":
        summary.skippedAttemptGuard += 1;
        break;
      case "failed":
        summary.failed += 1;
        break;
    }
  }

  return summary;
}
