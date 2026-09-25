import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { siteConfig } from "@/lib/config";

describe("site config trust links", () => {
  it("does not expose placeholder or unowned social links", () => {
    const configSource = readFileSync(resolve(process.cwd(), "src/lib/config.tsx"), "utf8");
    const footerSource = readFileSync(
      resolve(process.cwd(), "src/components/sections/footer.tsx"),
      "utf8",
    );

    expect(configSource).not.toContain('href: "#"');
    expect(configSource).not.toContain("https://discord.com/");
    expect(configSource).not.toContain("https://instagram.com/");
    expect(footerSource).not.toContain("FaDiscord");
    expect(footerSource).not.toContain("RiInstagram");
    expect(siteConfig.links).toEqual({
      email: "support@vidicy.com",
      twitter: "https://twitter.com/takitajwar17",
    });
  });
});
