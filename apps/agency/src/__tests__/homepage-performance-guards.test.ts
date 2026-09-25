import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("homepage performance guards", () => {
  it("does not render agency homepage blog cards", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/homepage/sections.tsx"),
      "utf8",
    );

    expect(source).not.toContain("BlogCard");
    expect(source).not.toContain("BlogSection");
  });

  it("does not keep the Product Hunt badge block in the homepage hero", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/homepage/sections.tsx"),
      "utf8",
    );

    expect(source).not.toContain("producthunt.com/products/vidicy");
    expect(source).not.toContain("View Vidicy on Product Hunt");
    expect(source).not.toContain("Product Hunt");
  });

  it("keeps font loading in next/font and avoids CSS font imports", () => {
    const globals = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const layout = readFileSync(resolve(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(globals).not.toContain("@import url('https://fonts.googleapis.com");
    expect(globals).not.toContain("@import url('https://rsms.me/inter/inter.css');");
    expect(layout).toContain("next/font/google");
    expect(layout).toContain("Instrument_Serif");
    expect(layout).toContain("Manrope");
  });
});
