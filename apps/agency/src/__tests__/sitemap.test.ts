import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { CANONICAL_SITE_URL, PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT } from "@/constants";

function toIsoDate(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

const expectedPublicStaticUrls = [
  CANONICAL_SITE_URL,
  `${CANONICAL_SITE_URL}/about`,
  `${CANONICAL_SITE_URL}/faq`,
  `${CANONICAL_SITE_URL}/how-it-works`,
  `${CANONICAL_SITE_URL}/editorial-standards`,
  `${CANONICAL_SITE_URL}/enterprise`,
  `${CANONICAL_SITE_URL}/tools`,
  `${CANONICAL_SITE_URL}/tools/us-visa-photo-requirements`,
  `${CANONICAL_SITE_URL}/tools/schengen-visa-photo-requirements`,
  `${CANONICAL_SITE_URL}/privacy`,
  `${CANONICAL_SITE_URL}/terms`,
  `${CANONICAL_SITE_URL}/subprocessors`,
  `${CANONICAL_SITE_URL}/visas`,
  `${CANONICAL_SITE_URL}/visas/us`,
  `${CANONICAL_SITE_URL}/visas/schengen`,
  `${CANONICAL_SITE_URL}/visas/uk`,
  `${CANONICAL_SITE_URL}/visas/canada`,
  `${CANONICAL_SITE_URL}/visas/australia`,
];

describe("sitemap metadata route", () => {
  it("covers the full public marketing and legal route surface", async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));

    expectedPublicStaticUrls.forEach((url) => {
      expect(urls.has(url)).toBe(true);
    });

    expect(urls.has(`${CANONICAL_SITE_URL}/sign-in`)).toBe(false);
    expect(urls.has(`${CANONICAL_SITE_URL}/sign-up`)).toBe(false);
    expect(urls.has(`${CANONICAL_SITE_URL}/dashboard`)).toBe(false);
  });

  it("uses the canonical production host for every public URL", async () => {
    const entries = await sitemap();

    for (const entry of entries) {
      const hasCanonicalOrigin =
        entry.url === CANONICAL_SITE_URL || entry.url.startsWith(`${CANONICAL_SITE_URL}/`);

      expect(hasCanonicalOrigin).toBe(true);
    }
  });

  it("keeps visa route sitemap dates aligned with visible freshness metadata", async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));
    const expectedLastModified = `${PUBLIC_VISA_ROUTE_LAST_REVIEWED_AT}T00:00:00.000Z`;
    const visaRoutes = [
      "/visas",
      "/visas/us",
      "/visas/schengen",
      "/visas/uk",
      "/visas/canada",
      "/visas/australia",
    ] as const;

    for (const route of visaRoutes) {
      expect(toIsoDate(byUrl.get(`${CANONICAL_SITE_URL}${route}`)?.lastModified)).toBe(
        expectedLastModified,
      );
    }
  });

  it("does not include agency blog routes", async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));

    expect(urls.has(`${CANONICAL_SITE_URL}/blog`)).toBe(false);
    expect([...urls].some((url) => url.startsWith(`${CANONICAL_SITE_URL}/blog/`))).toBe(false);
  });
});
