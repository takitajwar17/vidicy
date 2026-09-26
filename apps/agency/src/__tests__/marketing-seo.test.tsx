import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import AboutPage, { metadata as aboutMetadata } from "@/app/(marketing)/about/page";
import EditorialStandardsPage from "@/app/(marketing)/editorial-standards/page";
import EnterprisePage from "@/app/(marketing)/enterprise/page";
import PrivacyPage, { metadata as privacyMetadata } from "@/app/(legal)/privacy/page";
import SubprocessorsPage, {
  metadata as subprocessorsMetadata,
} from "@/app/(legal)/subprocessors/page";
import TermsPage from "@/app/(legal)/terms/page";
import { metadata as toolsMetadata } from "@/app/tools/page";
import { metadata as homepageMetadata } from "@/app/(agency-home)/page";
import { CANONICAL_SITE_URL } from "@/constants";

function toIsoDate(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

describe("marketing SEO surfaces", () => {
  it("keeps the homepage title plain so the root template adds branding once", () => {
    expect(typeof homepageMetadata.title).toBe("string");
    expect(homepageMetadata.title).toBe("Logopipsum");
    expect(String(homepageMetadata.title)).not.toContain("Vidicy - Vidicy");
  });

  it("uses Vitara homepage metadata", () => {
    expect(typeof homepageMetadata.description).toBe("string");
    expect(homepageMetadata.description).toBe("Turn medical insights into personalized wellness plans.");
  });

  it("uses a descriptive About page metadata title", () => {
    expect(aboutMetadata.title).toBe("About Vidicy: AI Visa Document Review");
  });

  it("keeps static utility and legal page titles descriptive", () => {
    expect(privacyMetadata.title).toBe("Privacy Policy for Visa Data");
    expect(subprocessorsMetadata.title).toBe("Subprocessors and Data Vendors");
    expect(toolsMetadata.title).toBe("Free Visa Photo and Document Tools");
  });

  it("includes the new photo tool urls in the sitemap", async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    expect(byUrl.get(`${CANONICAL_SITE_URL}/tools`)).toBeDefined();
    expect(byUrl.get(`${CANONICAL_SITE_URL}/tools/us-visa-photo-requirements`)).toBeDefined();
    expect(byUrl.get(`${CANONICAL_SITE_URL}/tools/schengen-visa-photo-requirements`)).toBeDefined();
  });

  it("includes stable sitemap dates and the public subprocessors page", async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    expect(byUrl.get(`${CANONICAL_SITE_URL}/subprocessors`)).toBeDefined();
    expect(toIsoDate(byUrl.get(CANONICAL_SITE_URL)?.lastModified)).toBe(
      "2026-10-08T00:00:00.000Z",
    );
    expect(toIsoDate(byUrl.get(`${CANONICAL_SITE_URL}/about`)?.lastModified)).toBe(
      "2026-10-08T00:00:00.000Z",
    );
    expect(toIsoDate(byUrl.get(`${CANONICAL_SITE_URL}/privacy`)?.lastModified)).toBe(
      "2026-10-02T00:00:00.000Z",
    );
    expect(toIsoDate(byUrl.get(`${CANONICAL_SITE_URL}/terms`)?.lastModified)).toBe(
      "2026-10-02T00:00:00.000Z",
    );
  });

  it("keeps public navigation free of removed feature anchors", () => {
    const footerSource = readFileSync(
      resolve(process.cwd(), "src/components/sections/footer.tsx"),
      "utf8",
    );
    const configSource = readFileSync(resolve(process.cwd(), "src/lib/config.tsx"), "utf8");

    expect(`${footerSource}\n${configSource}`).not.toContain('href: "/#features"');
    expect(`${footerSource}\n${configSource}`).not.toContain("built-for-approval");
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
      { name: "Vidicy", markup: renderToStaticMarkup(<AboutPage />), schemaType: "Organization" },
      { name: "Editorial Standards", markup: renderToStaticMarkup(<EditorialStandardsPage />), schemaType: "WebPage" },
      { name: "Privacy Policy", markup: renderToStaticMarkup(<PrivacyPage />), schemaType: "WebPage" },
      { name: "Terms of Service", markup: renderToStaticMarkup(<TermsPage />), schemaType: "WebPage" },
      { name: "Subprocessors", markup: renderToStaticMarkup(<SubprocessorsPage />), schemaType: "WebPage" },
    ];

    for (const page of pages) {
      expect(page.markup, page.name).toContain('type="application/ld+json"');
      expect(page.markup, page.name).toContain(`"@type":"${page.schemaType}"`);
      expect(page.markup, page.name).toContain(`"name":"${page.name}"`);
    }
  });
});
