import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AboutPage from "@/app/(marketing)/about/page";
import MarketingFaqPage from "@/app/(marketing)/faq/page";
import HowItWorksPage from "@/app/(marketing)/how-it-works/page";
import MarketingLayout from "@/app/(marketing)/layout";
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

    expect(markup).not.toContain('href="/blog"');
    expect(markup).not.toContain(">Blog<");
    expect(markup).toContain('href="/#pricing"');
    expect(markup).toContain(">Pricing<");
    expect(markup).toContain('href="/faq"');
    expect(markup).toContain(">FAQ<");
  });
});
