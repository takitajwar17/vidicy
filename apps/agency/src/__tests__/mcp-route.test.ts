import { describe, expect, it } from "vitest";

import { POST } from "@/app/mcp/route";

describe("public MCP route", () => {
  it("responds to initialize with server capabilities", async () => {
    const response = await POST(
      new Request("https://vidicy.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);

    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: expect.objectContaining({
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: expect.objectContaining({
          name: "vidicy-public-tools",
        }),
      }),
    });
  });

  it("lists public tools", async () => {
    const response = await POST(
      new Request("https://vidicy.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }),
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "get_public_markdown",
        }),
        expect.objectContaining({
          name: "get_photo_tool_profile",
        }),
      ]),
    );
  });

  it("returns markdown content through the public markdown tool", async () => {
    const response = await POST(
      new Request("https://vidicy.com/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "get_public_markdown",
            arguments: {
              path: "/tools",
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.result.isError).toBe(false);
    expect(body.result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("# Free visa tools"),
        }),
      ]),
    );
    expect(body.result.structuredContent).toEqual(
      expect.objectContaining({
        contentType: "text/markdown; charset=utf-8",
        path: "/tools",
      }),
    );
  });
});
