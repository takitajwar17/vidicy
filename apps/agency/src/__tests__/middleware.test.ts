import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGenerateCsrfTokenValue } = vi.hoisted(() => ({
  mockGenerateCsrfTokenValue: vi.fn(),
}));

vi.mock("@/infra/csrf-token", () => ({
  generateCsrfTokenValue: mockGenerateCsrfTokenValue,
}));

import { config, middleware } from "@/middleware";
import { CANONICAL_SITE_URL } from "@/constants";

describe("middleware", () => {
  beforeEach(() => {
    mockGenerateCsrfTokenValue.mockReset();
  });

  it("leaves canonical SEO metadata routes without a csrf cookie", async () => {
    const response = await middleware(new NextRequest(`${CANONICAL_SITE_URL}/sitemap.xml`));

    expect(response.status).toBe(200);
    expect(response.cookies.get("csrf-token")).toBeUndefined();
    expect(mockGenerateCsrfTokenValue).not.toHaveBeenCalled();
  });

  it("still sets a csrf cookie on the primary hostname", async () => {
    mockGenerateCsrfTokenValue.mockReturnValue("csrf_token_value");

    const response = await middleware(new NextRequest(`${CANONICAL_SITE_URL}/dashboard`));

    expect(response.status).toBe(200);
    expect(response.cookies.get("csrf-token")?.value).toBe("csrf_token_value");
  });

  it("advertises the API catalog and service docs from the homepage response", async () => {
    mockGenerateCsrfTokenValue.mockReturnValue("csrf_token_value");

    const response = await middleware(new NextRequest(`${CANONICAL_SITE_URL}/`));
    const linkHeader = response.headers.get("link");

    expect(response.status).toBe(200);
    expect(linkHeader).toContain('</.well-known/api-catalog>; rel="api-catalog"');
    expect(linkHeader).toContain("</tools>; rel=\"service-doc\"");
    expect(response.headers.get("vary")).toContain("Accept");
  });

  it("rewrites homepage requests to markdown when agents explicitly ask for it", async () => {
    mockGenerateCsrfTokenValue.mockReturnValue("csrf_token_value");

    const response = await middleware(
      new NextRequest(`${CANONICAL_SITE_URL}/`, {
        headers: {
          accept: "text/markdown, text/html;q=0.9",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/agent-markdown?path=%2F");
    expect(response.headers.get("vary")).toContain("Accept");
  });
});
