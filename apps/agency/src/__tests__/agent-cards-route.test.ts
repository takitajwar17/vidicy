import { describe, expect, it } from "vitest";

import { GET as getAgentCard } from "@/app/.well-known/agent-card.json/route";
import { GET as getMcpServerCard } from "@/app/.well-known/mcp/server-card.json/route";

interface McpServerCardBody {
  transport: unknown;
  serverInfo: unknown;
}

interface AgentCardBody {
  name: unknown;
  version: unknown;
  supportedInterfaces: unknown;
  skills: unknown;
}

describe("agent discovery cards", () => {
  it("returns an MCP server card for the public pages endpoint", async () => {
    const response = await getMcpServerCard();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");

    const body = (await response.json()) as McpServerCardBody;
    expect(body.transport).toEqual({
      type: "streamable-http",
      endpoint: "/mcp",
    });
    expect(body.serverInfo).toEqual(
      expect.objectContaining({
        name: "vidicy-public-pages",
      }),
    );
  });

  it("returns an A2A-style agent card describing the public interface", async () => {
    const response = await getAgentCard();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");

    const body = (await response.json()) as AgentCardBody;
    expect(body.name).toBe("Vidicy Agent");
    expect(body.version).toBeDefined();
    expect(body.supportedInterfaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protocolBinding: "HTTP+JSON",
          url: expect.stringContaining("/mcp"),
        }),
      ]),
    );
    expect(body.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "vidicy-public-markdown",
        }),
      ]),
    );
  });
});
