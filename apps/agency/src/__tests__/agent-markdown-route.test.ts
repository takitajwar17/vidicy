import { describe, expect, it } from "vitest";

import { CANONICAL_SITE_URL } from "@/constants";
import { GET, HEAD } from "@/app/agent-markdown/route";

describe("agent markdown route", () => {
  it("returns homepage markdown with markdown negotiation headers", async () => {
    const response = await GET(new Request("http://localhost/agent-markdown?path=/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("vary")).toContain("Accept");
    expect(response.headers.get("x-markdown-tokens")).toMatch(/^\d+$/);

    const body = await response.text();
    expect(body).toContain("title: Vidicy Agency");
    expect(body).toContain("# Vidicy Agency");
    expect(body).toContain("Check passports, forms, bank statements");
    expect(body).toContain(`${CANONICAL_SITE_URL}/sign-in`);
  });

  it("returns headers without a body for HEAD requests", async () => {
    const response = await HEAD(new Request("http://localhost/agent-markdown?path=/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("x-markdown-tokens")).toMatch(/^\d+$/);
    expect(await response.text()).toBe("");
  });
});
