import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/"),
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    usePathname: mockUsePathname,
  };
});

import Header from "@/components/sections/header";

function getTopBarLinkMarkup({
  pageMarkup,
  href,
  label,
}: {
  pageMarkup: string;
  href: string;
  label: string;
}) {
  const anchorMatch = pageMarkup.match(new RegExp(`<a[^>]*href="${href}"[^>]*>${label}</a>`));

  expect(anchorMatch).not.toBeNull();

  return anchorMatch?.[0] ?? "";
}

function expectActiveLinkMarkup({
  markup,
  href,
  label,
}: {
  markup: string;
  href: string;
  label: string;
}) {
  expect(
    getTopBarLinkMarkup({
      pageMarkup: markup,
      href,
      label,
    }),
  ).toContain("font-bold");
  expect(
    getTopBarLinkMarkup({
      pageMarkup: markup,
      href,
      label,
    }),
  ).not.toContain("bg-background/85");
  expect(
    getTopBarLinkMarkup({
      pageMarkup: markup,
      href,
      label,
    }),
  ).not.toContain("shadow-sm");
}

function expectInactiveLinkMarkup({
  markup,
  href,
  label,
}: {
  markup: string;
  href: string;
  label: string;
}) {
  const linkMarkup = getTopBarLinkMarkup({
    pageMarkup: markup,
    href,
    label,
  });

  expect(linkMarkup).toContain("font-medium");
  expect(linkMarkup).not.toContain("font-bold");
}

describe("marketing header active state", () => {
  it("uses bold text for the selected primary destination in the desktop topbar", () => {
    const topBarSelections = [
      { href: "/faq", label: "FAQ" },
      { href: "/enterprise", label: "Enterprise" },
      { href: "/about", label: "About" },
    ];

    for (const item of topBarSelections) {
      mockUsePathname.mockReturnValue(item.href);

      const markup = renderToStaticMarkup(<Header />);

      expectActiveLinkMarkup({
        markup,
        href: item.href,
        label: item.label,
      });
    }
  });

  it("keeps unselected links at the default weight", () => {
    mockUsePathname.mockReturnValue("/enterprise");

    const markup = renderToStaticMarkup(<Header />);

    expectInactiveLinkMarkup({ markup, href: "/faq", label: "FAQ" });
  });
});
