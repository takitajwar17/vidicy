import { describe, expect, it, vi } from "vitest";

import { POST } from "@/app/mcp/route";

interface McpToolListBody {
  result: {
    tools: unknown;
  };
}

interface McpToolCallBody {
  result: {
    isError: unknown;
    content: unknown;
    structuredContent: unknown;
  };
}

describe("public MCP route", () => {
  it("rejects an oversized streamed request with JSON-RPC and CORS headers", async () => {
    const cancel = vi.fn();
    let chunks = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (chunks++ < 4) controller.enqueue(new Uint8Array(128 * 1024));
        else controller.close();
      }, cancel,
    });
    const response = await POST(new Request("https://example.com/mcp", {
      method: "POST", body: stream, duplex: "half",
    } as RequestInit));
    expect(response.status).toBe(413);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    await expect(response.json()).resolves.toMatchObject({ jsonrpc: "2.0", error: { code: -32600 } });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([null, [], 1, "x", { jsonrpc: "2.0", method: "tools/call", params: [] }])("rejects invalid JSON-RPC shapes: %j", async body => {
    const response = await POST(new Request("https://example.com/mcp", {
      method: "POST", body: JSON.stringify(body),
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: -32600 } });
  });

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
          name: "vidicy-public-pages",
        }),
      }),
    });
  });

  it("lists the public markdown tool", async () => {
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

    const body = (await response.json()) as McpToolListBody;
    expect(body.result.tools).toEqual([
      expect.objectContaining({
        name: "get_public_markdown",
      }),
    ]);
  });

  it("returns homepage markdown content through the public markdown tool", async () => {
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
              path: "/",
            },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);

    const body = (await response.json()) as McpToolCallBody;
    expect(body.result.isError).toBe(false);
    expect(body.result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("# Vidicy Agency"),
        }),
      ]),
    );
    expect(body.result.structuredContent).toEqual(
      expect.objectContaining({
        contentType: "text/markdown; charset=utf-8",
        path: "/",
      }),
    );
  });
});
