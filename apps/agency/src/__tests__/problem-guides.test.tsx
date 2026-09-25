import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import MarketingHomepage from "@/app/(marketing)/page";
import MarketingLayout from "@/app/(marketing)/layout";
import {
  GUIDE_DEFAULT_IMAGE,
  getProblemGuideCards,
} from "@/app/(marketing)/_content/problem-guides";
import { CANONICAL_SITE_URL } from "@/constants";

type ProblemGuideSpec = {
  route: string;
  file: string;
  title: string;
  routeExample: string;
  selfCheckHeading: string;
};

const problemGuides: ProblemGuideSpec[] = [
  {
    route: "/guides/avoid-visa-rejection-document-mistakes",
    file: "src/app/(marketing)/guides/avoid-visa-rejection-document-mistakes/page.tsx",
    title: "How to avoid visa rejection due to document mistakes",
    routeExample: "US B1/B2 visitor visa",
    selfCheckHeading: "Quick self-check before you submit",
  },
  {
    route: "/guides/proof-of-funds-for-visa-application",
    file: "src/app/(marketing)/guides/proof-of-funds-for-visa-application/page.tsx",
    title: "Proof of funds for a visa application",
    routeExample: "Canada study permit",
    selfCheckHeading: "Proof-of-funds self-check",
  },
  {
    route: "/guides/employment-letter-for-visa-application",
    file: "src/app/(marketing)/guides/employment-letter-for-visa-application/page.tsx",
    title: "Employment letter for a visa application",
    routeExample: "Australia Visitor visa subclass 600",
    selfCheckHeading: "Employment letter self-check",
  },
];

const guidesIndexFile = "src/app/(marketing)/guides/page.tsx";

async function importPageModule(file: string) {
  const absolutePath = resolve(process.cwd(), file);
  return import(/* @vite-ignore */ pathToFileURL(absolutePath).href);
}

describe("problem-solving marketing guides", () => {
  it("ships a guides index with card links to each guide", async () => {
    const absolutePath = resolve(process.cwd(), guidesIndexFile);
    expect(existsSync(absolutePath)).toBe(true);

    if (!existsSync(absolutePath)) {
      return;
    }

    const pageModule = (await importPageModule(guidesIndexFile)) as {
      default: () => Promise<ReactNode> | ReactNode;
    };

    const markup = renderToStaticMarkup(
      <MarketingLayout>{await pageModule.default()}</MarketingLayout>,
    );

    expect(markup).toContain("Visa document guides");
    expect(markup).not.toContain("/blog/rejected");
    expect(markup).not.toContain("/blog/document_checklist");
    expect(markup).not.toContain("/guides/variants/");
    expect(markup).toContain("/guides/avoid-visa-rejection-document-mistakes");
    expect(markup).toContain("/guides/proof-of-funds-for-visa-application");
    expect(markup).toContain("/guides/employment-letter-for-visa-application");
  });

  it("uses route-relevant card images instead of the logo fallback", () => {
    const cards = getProblemGuideCards();

    for (const card of cards) {
      expect(card.image).not.toBe(GUIDE_DEFAULT_IMAGE);
      expect(existsSync(resolve(process.cwd(), `public${card.image}`))).toBe(true);
    }
  });

  it("ships dedicated guide pages with article-style metadata and route-page links", async () => {
    for (const guide of problemGuides) {
      const absolutePath = resolve(process.cwd(), guide.file);
      expect(existsSync(absolutePath)).toBe(true);

      if (!existsSync(absolutePath)) {
        continue;
      }

      const pageModule = (await importPageModule(guide.file)) as {
        default: () => Promise<ReactNode> | ReactNode;
      };

      const markup = renderToStaticMarkup(
        <MarketingLayout>{await pageModule.default()}</MarketingLayout>,
      );

      expect(markup).toContain(guide.title);
      expect(markup).toContain("Anian");
      expect(markup).toContain('dateTime="2026-10-08"');
      expect(markup).toContain(guide.routeExample);
      expect(markup).toContain(guide.selfCheckHeading);
      expect(markup).not.toContain("/blog/rejected");
      expect(markup).not.toContain("/blog/document_checklist");
      expect(markup).not.toContain("/guides/variants/");
      expect(markup).toContain("/visas/us");
      expect(markup).toContain("/visas/schengen");
      expect(markup).toContain("/visas/uk");
      expect(markup).toContain("/visas/canada");
      expect(markup).toContain("/visas/australia");
    }
  });

  it("retires the old root-level guide routes", () => {
    expect(
      existsSync(
        resolve(
          process.cwd(),
          "src/app/(marketing)/avoid-visa-rejection-document-mistakes/page.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          process.cwd(),
          "src/app/(marketing)/proof-of-funds-for-visa-application/page.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        resolve(
          process.cwd(),
          "src/app/(marketing)/employment-letter-for-visa-application/page.tsx",
        ),
      ),
    ).toBe(false);
  });

  it("links the homepage to the guides hub and avoids legacy root guide routes", async () => {
    const markup = renderToStaticMarkup(
      <MarketingLayout>{await MarketingHomepage()}</MarketingLayout>,
    );

    expect(markup).toContain('href="/guides"');
    expect(markup).not.toContain("/avoid-visa-rejection-document-mistakes");
    expect(markup).not.toContain("/proof-of-funds-for-visa-application");
    expect(markup).not.toContain("/employment-letter-for-visa-application");
  });

  it("includes the problem-solving guides in the sitemap", async () => {
    const entries = await sitemap();
    const byUrl = new Map(entries.map((entry) => [entry.url, entry]));

    expect(byUrl.get(`${CANONICAL_SITE_URL}/guides`)).toBeDefined();
    expect(
      byUrl.get(`${CANONICAL_SITE_URL}/guides/avoid-visa-rejection-document-mistakes`),
    ).toBeDefined();
    expect(
      byUrl.get(`${CANONICAL_SITE_URL}/guides/proof-of-funds-for-visa-application`),
    ).toBeDefined();
    expect(
      byUrl.get(`${CANONICAL_SITE_URL}/guides/employment-letter-for-visa-application`),
    ).toBeDefined();
    expect(
      byUrl.get(`${CANONICAL_SITE_URL}/avoid-visa-rejection-document-mistakes`),
    ).toBeUndefined();
    expect(
      byUrl.get(`${CANONICAL_SITE_URL}/proof-of-funds-for-visa-application`),
    ).toBeUndefined();
    expect(
      byUrl.get(`${CANONICAL_SITE_URL}/employment-letter-for-visa-application`),
    ).toBeUndefined();
  });
});
