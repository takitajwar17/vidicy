import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AboutPage from "@/app/(marketing)/about/page";
import MarketingFaqPage from "@/app/(marketing)/faq/page";
import HowItWorksPage from "@/app/(marketing)/how-it-works/page";
import MarketingLayout from "@/app/(marketing)/layout";
import VisasPage from "@/app/(marketing)/visas/page";
import { VisaPage } from "@/app/(marketing)/visas/_components/visa-page";
import LegalLayout from "@/app/(legal)/layout";
import PrivacyPage from "@/app/(legal)/privacy/page";
import SubprocessorsPage from "@/app/(legal)/subprocessors/page";
import TermsPage from "@/app/(legal)/terms/page";

describe("shared public site shell", () => {
  it("renders the marketing and legal layouts through the same public site wrapper", () => {
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
      expect(markup.match(/data-public-site-shell/g)).toHaveLength(1);
      expect(markup.match(/id="main-content"/g)).toHaveLength(1);
    }
  });

  it("renders representative public info pages through the shared page hero and content shell", () => {
    const pages = [
      renderToStaticMarkup(<AboutPage />),
      renderToStaticMarkup(<MarketingFaqPage />),
      renderToStaticMarkup(<HowItWorksPage />),
      renderToStaticMarkup(<VisasPage />),
      renderToStaticMarkup(
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
        />,
      ),
      renderToStaticMarkup(<TermsPage />),
      renderToStaticMarkup(<PrivacyPage />),
      renderToStaticMarkup(<SubprocessorsPage />),
    ];

    for (const markup of pages) {
      expect(markup.match(/data-public-page-hero/g)).toHaveLength(1);
      expect(markup.match(/data-public-page-content/g)).toHaveLength(1);
    }
  });

  it("renders the primary marketing navigation links in the shared header", () => {
    const markup = renderToStaticMarkup(
      <MarketingLayout>
        <div>Marketing body</div>
      </MarketingLayout>,
    );

    expect(markup).not.toContain('href="/guides"');
    expect(markup).not.toContain(">Guides<");
    expect(markup).not.toContain('href="/blog"');
    expect(markup).not.toContain(">Blog<");
    expect(markup).toContain('href="/#pricing"');
    expect(markup).toContain(">Pricing<");
    expect(markup).toContain('href="/faq"');
    expect(markup).toContain(">FAQ<");
  });
});
