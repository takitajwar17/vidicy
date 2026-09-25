import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { hasBackgroundVideoViewportTierChanged } from "@/components/homepage/background-video";

describe("homepage responsive guards", () => {
  it("keeps the hero CTA text-labeled across breakpoints", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/homepage/sections.tsx"),
      "utf8",
    );

    expect(source).toContain("hero-cta-metal-shine");
    expect(source).toContain("Get My Free Review");
    expect(source).toContain("text-sm font-semibold");
    expect(source).not.toMatch(/xl:h-11 xl:w-11 xl:px-0/);
  });

  it("keeps the destination flags flowing on mobile with a dedicated compact marquee", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/homepage/server-sections.tsx"),
      "utf8",
    );

    expect(source).toContain('className="space-y-1.5 sm:hidden"');
    expect(source).toMatch(
      /<CountryRailRow items=\{mobileDestinationRailRows\[0\]\} duration=\{22\} compact \/>/,
    );
    expect(source).toContain('className="hidden sm:block"');
    expect(source).toContain('className="min-w-0 w-full overflow-hidden');
    expect(source).toContain('className="w-full min-w-0 p-0 [--gap:0rem]"');
  });

  it("detects when the hero background video crosses the mobile breakpoint", () => {
    expect(hasBackgroundVideoViewportTierChanged(390, 700)).toBe(false);
    expect(hasBackgroundVideoViewportTierChanged(390, 768)).toBe(true);
    expect(hasBackgroundVideoViewportTierChanged(1280, 900)).toBe(false);
    expect(hasBackgroundVideoViewportTierChanged(1024, 500)).toBe(true);
    expect(hasBackgroundVideoViewportTierChanged(undefined, 500)).toBe(false);
  });
});
