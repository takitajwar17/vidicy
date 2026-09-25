import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToReadableStream } from "react-dom/server";
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

import MarketingHomepage from "@/app/(marketing)/page";
import MarketingLayout from "@/app/(marketing)/layout";

async function renderMarketingHomepageMarkup() {
  const stream = await renderToReadableStream(
    <MarketingLayout>{await MarketingHomepage()}</MarketingLayout>,
  );

  await stream.allReady;

  return new Response(stream).text();
}

describe("main marketing homepage route", () => {
  it("renders the homepage landing experience on /", async () => {
    const markup = await renderMarketingHomepageMarkup();

    expect(markup).toContain("Small Mistake");
    expect(markup).toContain("Visa Rejected");
    expect(markup).toContain("Get My Free Review");
    expect(markup).toContain("Destination-specific coverage");
    expect(markup).toContain("visa document review");
    expect(markup).not.toContain("Embassy-Specific Visa Document Review");
    expect(markup).toContain("Start Your Free Evaluation Before You Submit");
    expect(markup).not.toContain("Success Stories");
    expect(markup).toContain("What do I get for free before paying?");
    expect(markup).toContain("Is this a subscription or a one-time payment?");
    expect(markup).toContain("What happens if I follow the guidance and still get rejected?");
    expect(markup).toContain("Browse the FAQ");
    expect(markup).toContain("Need personalized help?");
  });

  it("stops wiring / through the legacy homepage-only section stack", () => {
    const source = readFileSync(resolve(process.cwd(), "src/app/(marketing)/page.tsx"), "utf8");

    expect(source).not.toContain("@/components/sections/hero");
    expect(source).not.toContain("@/components/sections/logos");
    expect(source).not.toContain("@/components/sections/problem");
    expect(source).not.toContain("@/components/sections/solution");
    expect(source).not.toContain("@/components/sections/how-it-works");
    expect(source).not.toContain("@/components/sections/testimonials-carousel");
    expect(source).not.toContain("@/components/sections/features");
    expect(source).not.toContain("@/components/sections/pricing");
    expect(source).not.toContain("@/components/sections/faq");
    expect(source).not.toContain("@/components/sections/blog");
  });

  it("pins the FAQ decision-card CTA to the bottom of the card", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/homepage/sections.tsx"),
      "utf8",
    );

    expect(source).toContain(
      'className="flex h-full flex-col rounded-[1.15rem] border border-border/80 bg-muted/35 p-5 text-left"',
    );
    expect(source).toContain('className="mt-auto pt-4"');
  });

  it("uses the marketing layout header and footer only once", async () => {
    const markup = await renderMarketingHomepageMarkup();

    expect(markup.match(/Skip to main content/g)).toHaveLength(1);
    expect(markup.match(/All rights reserved\./g)).toHaveLength(1);
    expect(markup.match(/id="main-content"/g)).toHaveLength(1);
    expect(markup.match(/Start Your Free Evaluation Before You Submit/g)).toHaveLength(1);
  });

  it("does not render blog teasers on the agency homepage", async () => {
    const markup = await renderMarketingHomepageMarkup();
    const source = readFileSync(
      resolve(process.cwd(), "src/components/homepage/sections.tsx"),
      "utf8",
    );

    expect(markup).not.toContain("Visa Success Blog");
    expect(source).not.toContain("BlogCard");
    expect(source).not.toContain("BlogSection");
  });

  it("renders destination flags with descriptive alt text", async () => {
    const markup = await renderMarketingHomepageMarkup();

    expect(markup).toMatch(/<img[^>]*alt="United States flag"[^>]*src="[^"]*\/us\.svg"[^>]*>/);
  });

  it("keeps the homepage background video vivid without the white fade stack", async () => {
    const markup = await renderMarketingHomepageMarkup();

    expect(markup).toContain("md:saturate-[1.42]");
    expect(markup).toContain("md:contrast-[1.14]");
    expect(markup).toContain("md:brightness-[0.98]");
    expect(markup).toContain("rgba(116,200,255,0.18)");
    expect(markup).toContain("lg:saturate-[1.68]");
    expect(markup).toContain("lg:contrast-[1.22]");
    expect(markup).toContain("lg:brightness-[0.92]");
    expect(markup).toContain("md:mix-blend-screen");
    expect(markup).toContain("linear-gradient(90deg,rgba(116,200,255,0.3)_0%");
    expect(markup).not.toContain("bg-background/42");
    expect(markup).not.toContain("md:bg-background/24");
    expect(markup).not.toContain("lg:bg-background/12");
    expect(markup).not.toContain("radial-gradient(72%_56%_at_50%_28%");
    expect(markup).not.toContain("bg-gradient-to-b from-background/28 via-background/54 to-background/94");
  });
});
