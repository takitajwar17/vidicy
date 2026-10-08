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

import EnterprisePage from "@/app/(marketing)/enterprise/page";
import LegalLayout from "@/app/(legal)/layout";
import TermsPage from "@/app/(legal)/terms/page";
import MarketingLayout from "@/app/(marketing)/layout";

const SHARED_PRE_FOOTER_HEADING = "Start Your Free Evaluation Before You Submit";

describe("public CTA copy", () => {
  it("does not add the old shared pre-footer CTA through public layouts", () => {
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
      expect(markup).not.toContain(SHARED_PRE_FOOTER_HEADING);
      expect(markup).not.toContain("Get My Free Review");
      expect(markup).not.toContain("Compare Plans");
    }
  });

  it("keeps representative public pages free of the removed evaluation CTA block", () => {
    const enterpriseMarkup = renderToStaticMarkup(
      <MarketingLayout><EnterprisePage /></MarketingLayout>,
    );
    const termsMarkup = renderToStaticMarkup(<LegalLayout><TermsPage /></LegalLayout>);

    for (const markup of [enterpriseMarkup, termsMarkup]) {
      expect(markup).not.toContain(SHARED_PRE_FOOTER_HEADING);
      expect(markup).not.toContain("Get My Free Review");
      expect(markup).not.toContain("Compare Plans");
    }

    expect(enterpriseMarkup).not.toContain("Ready to check your documents?");
    expect(termsMarkup).not.toContain("Questions about these terms?");
  });

  it("redirects the retired pilot page to sign-in", async () => {
    const { default: PilotAccessPage } = await import("@/app/(marketing)/pilot-access/page");
    expect(() => PilotAccessPage()).toThrow("NEXT_REDIRECT");
  });

  it("removes generic page-local and shared pre-footer CTA components", () => {
    const genericCtaPath = resolve(process.cwd(), "src/components/sections/cta.tsx");
    const preFooterCtaPath = resolve(
      process.cwd(),
      "src/components/sections/public-pre-footer-cta.tsx",
    );

    expect(existsSync(genericCtaPath)).toBe(false);
    expect(existsSync(preFooterCtaPath)).toBe(false);
  });
});
