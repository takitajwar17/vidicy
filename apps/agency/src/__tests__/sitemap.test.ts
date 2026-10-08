import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { CANONICAL_SITE_URL } from "@/constants";

const expectedPublicStaticUrls = [
  CANONICAL_SITE_URL,
  `${CANONICAL_SITE_URL}/faq`,
  `${CANONICAL_SITE_URL}/enterprise`,
  `${CANONICAL_SITE_URL}/about`,
  `${CANONICAL_SITE_URL}/privacy`,
  `${CANONICAL_SITE_URL}/terms`,
  `${CANONICAL_SITE_URL}/subprocessors`,
];

describe("sitemap metadata route", () => {
  it("covers the full public marketing and legal route surface", async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));

    expectedPublicStaticUrls.forEach((url) => {
      expect(urls.has(url)).toBe(true);
    });

    expect(urls.has(`${CANONICAL_SITE_URL}/pilot-access`)).toBe(false);
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

  it("does not include agency blog routes", async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));

    expect(urls.has(`${CANONICAL_SITE_URL}/blog`)).toBe(false);
    expect([...urls].some((url) => url.startsWith(`${CANONICAL_SITE_URL}/blog/`))).toBe(false);
  });
});
