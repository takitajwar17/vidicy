import { describe, expect, it } from "vitest";

import { GET, HEAD } from "@/app/.well-known/api-catalog/route";
import { CANONICAL_SITE_URL } from "@/constants";

describe("api catalog well-known route", () => {
  it("returns an RFC 9727 linkset document for public APIs", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/linkset+json");
    expect(response.headers.get("content-type")).toContain(
      'profile="https://www.rfc-editor.org/info/rfc9727"',
    );
    expect(response.headers.get("link")).toContain('</.well-known/api-catalog>; rel="api-catalog"');
    expect(response.headers.get("link")).toContain("</tools>; rel=\"service-doc\"");

    await expect(response.json()).resolves.toEqual({
      linkset: [
        {
          anchor: `${CANONICAL_SITE_URL}/.well-known/api-catalog`,
          item: [
            {
              href: `${CANONICAL_SITE_URL}/api/tools/photo-requirements/analyze`,
            },
          ],
          "service-doc": [
            {
              href: `${CANONICAL_SITE_URL}/tools`,
              type: "text/html",
            },
          ],
        },
      ],
    });
  });

  it("returns discovery headers on HEAD requests", async () => {
    const response = await HEAD();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/linkset+json");
    expect(response.headers.get("content-type")).toContain(
      'profile="https://www.rfc-editor.org/info/rfc9727"',
    );
    expect(response.headers.get("link")).toContain('</.well-known/api-catalog>; rel="api-catalog"');
    expect(response.headers.get("link")).toContain("</tools>; rel=\"service-doc\"");
    expect(await response.text()).toBe("");
  });
});
