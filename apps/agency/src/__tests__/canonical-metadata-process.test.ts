import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readLayoutSource(): string {
  const layoutPath = resolve(process.cwd(), "src/app/layout.tsx");
  return readFileSync(layoutPath, "utf8");
}

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("canonical metadata process", () => {
  it("uses route-relative canonical in root metadata to auto-self-canonicalize pages", () => {
    const layoutSource = readLayoutSource();

    expect(layoutSource).toContain('canonical: "./"');
    expect(layoutSource).not.toContain("canonical: SITE_URL");
  });

  it("avoids pinning openGraph.url to the homepage in root metadata", () => {
    const layoutSource = readLayoutSource();

    expect(layoutSource).not.toContain("url: SITE_URL");
  });

  it("uses the fixed canonical origin for public metadata helpers and sitemap output", () => {
    const layoutSource = readLayoutSource();
    const configSource = readSource("src/lib/config.tsx");
    const utilsSource = readSource("src/lib/utils.ts");
    const sitemapSource = readSource("src/app/sitemap.ts");

    expect(layoutSource).toContain("metadataBase: new URL(CANONICAL_SITE_URL)");
    expect(configSource).toContain("url: CANONICAL_SITE_URL");
    expect(utilsSource).not.toContain("NEXT_PUBLIC_APP_URL");
    expect(sitemapSource).toContain("CANONICAL_SITE_URL");
    expect(sitemapSource).not.toMatch(/\bSITE_URL\b/);
  });
});
