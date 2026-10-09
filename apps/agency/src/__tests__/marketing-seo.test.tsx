import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import sitemap from "@/app/sitemap";
import AboutPage from "@/app/(marketing)/about/page";
import EnterprisePage from "@/app/(marketing)/enterprise/page";
import PrivacyPage, { metadata as privacyMetadata } from "@/app/(legal)/privacy/page";
import SubprocessorsPage, {
  metadata as subprocessorsMetadata,
} from "@/app/(legal)/subprocessors/page";
import TermsPage from "@/app/(legal)/terms/page";
import { metadata as homepageMetadata } from "@/app/(agency-home)/page";
import {
  CANONICAL_SITE_URL,
  OPEN_GRAPH_IMAGE_HEIGHT,
  OPEN_GRAPH_IMAGE_PATH,
  OPEN_GRAPH_IMAGE_WIDTH,
} from "@/constants";

function toIsoDate(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

describe("marketing SEO surfaces", () => {
  it("keeps the homepage title plain so the root template adds branding once", () => {
    expect(typeof homepageMetadata.title).toBe("string");
    expect(homepageMetadata.title).toBe("Visa Review Software for High-Volume Agency Teams");
    expect(String(homepageMetadata.title)).not.toContain("Vidicy - Vidicy");
  });

  it("uses agency homepage metadata", () => {
    expect(typeof homepageMetadata.description).toBe("string");
    expect(homepageMetadata.description).toBe(
      "Review client visa files faster with document checks, missing requirement detection, case tracking, and client-ready follow-ups for agency teams.",
    );
  });

  it("uses the static public Open Graph image for social previews", () => {
    const serializedHomepageMetadata = JSON.stringify(homepageMetadata);
    const ogRouteSource = readFileSync(resolve(process.cwd(), "src/app/og/route.tsx"), "utf8");

    expect(serializedHomepageMetadata).toContain(`${CANONICAL_SITE_URL}${OPEN_GRAPH_IMAGE_PATH}`);
    expect(serializedHomepageMetadata).toContain(`"width":${OPEN_GRAPH_IMAGE_WIDTH}`);
    expect(serializedHomepageMetadata).toContain(`"height":${OPEN_GRAPH_IMAGE_HEIGHT}`);
    expect(ogRouteSource).toContain("OPEN_GRAPH_IMAGE_PATH");
    expect(ogRouteSource).not.toContain("/og.png");
  });

  it("keeps static utility and legal page titles descriptive", () => {
    expect(privacyMetadata.title).toBe("Privacy Policy for Agency Visa Data");
    expect(subprocessorsMetadata.title).toBe("Subprocessors and Data Vendors");
  });

  it("includes stable sitemap dates and the public subprocessors page", async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    expect(byUrl.get(`${CANONICAL_SITE_URL}/subprocessors`)).toBeDefined();
    expect(byUrl.get(`${CANONICAL_SITE_URL}/about`)).toBeDefined();
    expect(byUrl.get(`${CANONICAL_SITE_URL}/how-it-works`)).toBeUndefined();
    expect(byUrl.get(`${CANONICAL_SITE_URL}/editorial-standards`)).toBeUndefined();
    for (const entry of entries) {
      expect(toIsoDate(entry.lastModified)).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    }
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
      expect(await sitemap()).toEqual(entries);
      vi.setSystemTime(new Date("2031-01-01T00:00:00.000Z"));
      expect(await sitemap()).toEqual(entries);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps public navigation free of removed feature anchors", () => {
    const footerSource = readFileSync(
      resolve(process.cwd(), "src/components/sections/footer.tsx"),
      "utf8",
    );
    const configSource = readFileSync(resolve(process.cwd(), "src/lib/config.tsx"), "utf8");

    expect(`${footerSource}\n${configSource}`).not.toContain('href: "/#features"');
    expect(`${footerSource}\n${configSource}`).not.toContain("built-for-approval");
    expect(`${footerSource}\n${configSource}`).not.toContain('href: "/how-it-works"');
    expect(`${footerSource}\n${configSource}`).not.toContain('href: "/editorial-standards"');
  });

  it("defers non-critical third-party scripts from the root layout", () => {
    const layoutSource = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(layoutSource).not.toContain("cdn.jsdelivr.net");
    expect(layoutSource).not.toContain("beforeInteractive");
    expect(layoutSource).toContain('strategy="lazyOnload"');
    expect(layoutSource).toContain("analytics.ahrefs.com/analytics.js");
  });

  it("renders service schema on the enterprise page", () => {
    const markup = renderToStaticMarkup(<EnterprisePage />);

    expect(markup).toContain('type="application/ld+json"');
    expect(markup).toContain('"Service"');
    expect(markup).toContain('"Organization"');
  });

  it("renders WebPage schema on static informational and legal pages", () => {
    const pages = [
      {
        name: "About Vidicy",
        markup: renderToStaticMarkup(<AboutPage />),
        schemaType: "AboutPage",
      },
      {
        name: "Privacy Policy",
        markup: renderToStaticMarkup(<PrivacyPage />),
        schemaType: "WebPage",
      },
      {
        name: "Terms of Service",
        markup: renderToStaticMarkup(<TermsPage />),
        schemaType: "WebPage",
      },
      {
        name: "Subprocessors",
        markup: renderToStaticMarkup(<SubprocessorsPage />),
        schemaType: "WebPage",
      },
    ];

    for (const page of pages) {
      expect(page.markup, page.name).toContain('type="application/ld+json"');
      expect(page.markup, page.name).toContain(`"@type":"${page.schemaType}"`);
      expect(page.markup, page.name).toContain(`"name":"${page.name}"`);
    }
  });
});
