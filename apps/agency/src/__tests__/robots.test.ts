import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_SITE_DOMAIN,
  CANONICAL_SITE_URL,
  PUBLIC_ROBOTS_DISALLOW_PATHS,
} from "@/constants";

describe("public robots.txt", () => {
  it("declares a validator-safe crawl policy", () => {
    const body = readFileSync(join(process.cwd(), "public/robots.txt"), "utf-8");

    expect(body).toContain("User-agent: *");
    expect(body).not.toContain("Content-Signal:");
    expect(body).toContain("Allow: /");

    for (const path of PUBLIC_ROBOTS_DISALLOW_PATHS) {
      expect(body).toContain(`Disallow: ${path}`);
    }

    expect(body).toContain(`Host: ${CANONICAL_SITE_DOMAIN}`);
    expect(body).toContain(`Sitemap: ${CANONICAL_SITE_URL}/sitemap.xml`);
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
