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
    useRouter: () => ({ push: mockPush }),
    usePathname: mockUsePathname,
  };
});

import MarketingHomepage from "@/app/(marketing)/page";
import MarketingLayout from "@/app/(marketing)/layout";

describe("marketing homepage rendering", () => {
  it("renders the redesigned hero and surrounding sections", async () => {
    const markup = renderToStaticMarkup(
      <MarketingLayout>{await MarketingHomepage()}</MarketingLayout>,
    );

    expect(markup).toContain("Small Mistake");
    expect(markup).toContain("Visa Rejected");
    expect(markup).toContain("Get My Free Review");
    expect(markup).toContain("Destination-specific coverage");
    expect(markup).toContain("Start Your Free Evaluation Before You Submit");
  });

  it("keeps a single shell header/footer around the homepage content", async () => {
    const markup = renderToStaticMarkup(
      <MarketingLayout>{await MarketingHomepage()}</MarketingLayout>,
    );

    expect(markup.match(/Skip to main content/g)).toHaveLength(1);
    expect(markup.match(/All rights reserved\./g)).toHaveLength(1);
  });
});
