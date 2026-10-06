import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGenerateCsrfTokenValue } = vi.hoisted(() => ({
  mockGenerateCsrfTokenValue: vi.fn(),
}));

vi.mock("@/infra/csrf-token", () => ({
  generateCsrfTokenValue: mockGenerateCsrfTokenValue,
}));

import { config, middleware } from "@/middleware";
import { CANONICAL_SITE_URL } from "@/constants";

const originalAuthUnderConstruction = process.env.AUTH_UNDER_CONSTRUCTION;
const originalAuthGateBypassToken = process.env.AUTH_GATE_BYPASS_TOKEN;

describe("middleware", () => {
  beforeEach(() => {
    mockGenerateCsrfTokenValue.mockReset();
    delete process.env.AUTH_UNDER_CONSTRUCTION;
    delete process.env.AUTH_GATE_BYPASS_TOKEN;
  });

  afterEach(() => {
    if (originalAuthUnderConstruction === undefined) {
      delete process.env.AUTH_UNDER_CONSTRUCTION;
    } else {
      process.env.AUTH_UNDER_CONSTRUCTION = originalAuthUnderConstruction;
    }

    if (originalAuthGateBypassToken === undefined) {
      delete process.env.AUTH_GATE_BYPASS_TOKEN;
    } else {
      process.env.AUTH_GATE_BYPASS_TOKEN = originalAuthGateBypassToken;
    }
  });

  it.each(["www.vidicy.com", "agency.vidicy.com"])("redirects the agency alias %s and preserves the path and query", async (hostname) => {
    const response = await middleware(new NextRequest(`https://${hostname}/docs?a=1`));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://vidicy.com/docs?a=1");
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

  it("advertises the API catalog from the homepage response", async () => {
    mockGenerateCsrfTokenValue.mockReturnValue("csrf_token_value");

    const response = await middleware(new NextRequest(`${CANONICAL_SITE_URL}/`));
    const linkHeader = response.headers.get("link");

    expect(response.status).toBe(200);
    expect(linkHeader).toContain('</.well-known/api-catalog>; rel="api-catalog"');
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

  it("lets auth pages work normally when the construction gate is off", async () => {
    mockGenerateCsrfTokenValue.mockReturnValue("csrf_token_value");

    const response = await middleware(new NextRequest(`${CANONICAL_SITE_URL}/sign-in`));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("csrf-token")?.value).toBe("csrf_token_value");
  });

  it("redirects public auth traffic to the pilot access page when the gate is on", async () => {
    process.env.AUTH_UNDER_CONSTRUCTION = "true";
    process.env.AUTH_GATE_BYPASS_TOKEN = "founder-token";

    const response = await middleware(new NextRequest(`${CANONICAL_SITE_URL}/sign-up`));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${CANONICAL_SITE_URL}/pilot-access`);
  });

  it("sets a bypass cookie when the private auth access token is valid", async () => {
    process.env.AUTH_UNDER_CONSTRUCTION = "true";
    process.env.AUTH_GATE_BYPASS_TOKEN = "founder-token";

    const response = await middleware(
      new NextRequest(`${CANONICAL_SITE_URL}/sign-in?access=founder-token&redirect=%2Fdashboard`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${CANONICAL_SITE_URL}/sign-in?redirect=%2Fdashboard`);
    expect(response.cookies.get("vidicy-auth-gate")?.value).toBe("founder-token");
  });

  it("allows the Google OAuth start route while the construction gate is on", async () => {
    process.env.AUTH_UNDER_CONSTRUCTION = "true";
    process.env.AUTH_GATE_BYPASS_TOKEN = "founder-token";
    mockGenerateCsrfTokenValue.mockReturnValue("csrf_token_value");

    const response = await middleware(new NextRequest(`${CANONICAL_SITE_URL}/sso/google`));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("csrf-token")?.value).toBe("csrf_token_value");
  });

  it("allows the Google OAuth callback while the construction gate is on", async () => {
    process.env.AUTH_UNDER_CONSTRUCTION = "true";
    process.env.AUTH_GATE_BYPASS_TOKEN = "founder-token";
    mockGenerateCsrfTokenValue.mockReturnValue("csrf_token_value");

    const response = await middleware(
      new NextRequest(`${CANONICAL_SITE_URL}/sso/google/callback?code=abc&state=xyz`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("csrf-token")?.value).toBe("csrf_token_value");
  });
});
