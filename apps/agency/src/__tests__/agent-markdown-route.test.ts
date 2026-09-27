import { describe, expect, it } from "vitest";

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
    expect(body).toContain("Faster, more accurate visa reviews");
    expect(body).toContain("https://agency.vidicy.com/sign-in");
  });

  it("returns tools index markdown when requested", async () => {
    const response = await GET(new Request("http://localhost/agent-markdown?path=/tools"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");

    const body = await response.text();
    expect(body).toContain("title: Free Visa Tools");
    expect(body).toContain("# Free visa tools");
    expect(body).toContain("/tools/us-visa-photo-requirements");
    expect(body).toContain("/tools/schengen-visa-photo-requirements");
  });

  it("returns headers without a body for HEAD requests", async () => {
    const response = await HEAD(new Request("http://localhost/agent-markdown?path=/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("x-markdown-tokens")).toMatch(/^\d+$/);
    expect(await response.text()).toBe("");
  });
});
