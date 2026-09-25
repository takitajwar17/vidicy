import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { mockPush, mockUsePathname } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockUsePathname: vi.fn(() => "/"),
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    useRouter: () => ({
      push: mockPush,
    }),
    usePathname: mockUsePathname,
  };
});

import AboutPage from "@/app/(marketing)/about/page";
import HowItWorksPage from "@/app/(marketing)/how-it-works/page";
import LegalLayout from "@/app/(legal)/layout";
import TermsPage from "@/app/(legal)/terms/page";
import MarketingLayout from "@/app/(marketing)/layout";
import VisasPage from "@/app/(marketing)/visas/page";
import { VisaPage } from "@/app/(marketing)/visas/_components/visa-page";

const SHARED_PRE_FOOTER_HEADING = "Start Your Free Evaluation Before You Submit";

describe("public CTA copy", () => {
  it("adds the shared pre-footer CTA through the public layouts", () => {
    const marketingMarkup = renderToStaticMarkup(
      <MarketingLayout>
        <div>Marketing body</div>
      </MarketingLayout>,
    );
    const legalMarkup = renderToStaticMarkup(
      <LegalLayout>
        <div>Legal body</div>
      </LegalLayout>,
    );

    for (const markup of [marketingMarkup, legalMarkup]) {
      expect(markup).toContain(SHARED_PRE_FOOTER_HEADING);
      expect(markup).toContain("Get My Free Review");
      expect(markup.match(new RegExp(SHARED_PRE_FOOTER_HEADING, "g"))).toHaveLength(1);
    }
  });

  it("keeps representative public pages on one shared pre-footer CTA block", () => {
    const aboutMarkup = renderToStaticMarkup(<MarketingLayout><AboutPage /></MarketingLayout>);
    const howItWorksMarkup = renderToStaticMarkup(
      <MarketingLayout><HowItWorksPage /></MarketingLayout>,
    );
    const visasMarkup = renderToStaticMarkup(<MarketingLayout><VisasPage /></MarketingLayout>);
    const visaDetailMarkup = renderToStaticMarkup(
      <MarketingLayout>
        <VisaPage
          heroTitle="US Visa Document Checklist"
          heroSubtitle="US Visas"
          heroDescription="Prepare your US visa documents before you submit."
          countryCode="US"
          coreDocuments={["Passport"]}
          sections={[{ title: "Supporting documents", documents: ["Bank statements"] }]}
          schemaName="US visa documents"
          schemaDescription="Checklist"
          schemaItems={["Passport", "Bank statements"]}
          lastReviewedAt="2026-10-13"
          officialSources={[
            {
              label: "U.S. visas overview",
              href: "https://travel.state.gov/content/travel/en/us-visas.html",
            },
          ]}
          currentVisa="us"
        />
      </MarketingLayout>,
    );
    const termsMarkup = renderToStaticMarkup(<LegalLayout><TermsPage /></LegalLayout>);

    for (const markup of [aboutMarkup, howItWorksMarkup, visasMarkup, visaDetailMarkup, termsMarkup]) {
      expect(markup).toContain(SHARED_PRE_FOOTER_HEADING);
      expect(markup).toContain("Get My Free Review");
      expect(markup.match(new RegExp(SHARED_PRE_FOOTER_HEADING, "g"))).toHaveLength(1);
    }

    expect(aboutMarkup).not.toContain("Ready to check your documents?");
    expect(howItWorksMarkup).not.toContain("Start your first application");
    expect(visasMarkup).not.toContain("Let AI review your document package");
    expect(visaDetailMarkup).not.toContain("Let AI review your document package");
    expect(termsMarkup).not.toContain("Questions about these terms?");
  });

  it("removes generic page-local CTA components in favor of the shared pre-footer CTA", () => {
    const genericCtaPath = resolve(process.cwd(), "src/components/sections/cta.tsx");

    expect(existsSync(genericCtaPath)).toBe(false);
  });
});
