import { readFileSync } from "node:fs";
import { join } from "node:path";
import robots from "@/app/robots";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_SITE_DOMAIN,
  CANONICAL_SITE_URL,
  PUBLIC_ROBOTS_DISALLOW_PATHS,
} from "@/constants";

describe("public robots.txt", () => {
  it("declares a validator-safe crawl policy", () => {
    const policy = robots();
    expect(policy.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: [...PUBLIC_ROBOTS_DISALLOW_PATHS],
    });
    expect(policy.host).toBe(CANONICAL_SITE_DOMAIN);
    expect(policy.sitemap).toBe(`${CANONICAL_SITE_URL}/sitemap.xml`);
  });

  it("keeps private route-group layouts noindexed", () => {
    const privateLayoutPaths = [
      "src/app/(auth)/layout.tsx",
      "src/app/(dashboard)/layout.tsx",
      "src/app/(workspace)/dashboard/[appId]/layout.tsx",
      "src/app/(settings)/settings/layout.tsx",
      "src/app/(admin)/admin/layout.tsx",
      "src/app/(support)/dashboard/layout.tsx",
    ];

    for (const layoutPath of privateLayoutPaths) {
      const source = readFileSync(join(process.cwd(), layoutPath), "utf-8");

      expect(source).toContain("robots:");
      expect(source).toContain("index: false");
      expect(source).toContain("follow: false");
    }
  });
});
