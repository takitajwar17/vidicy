import "server-only";

import { NextResponse } from "next/server";

import packageJson from "../../../../../package.json";
import {
  CANONICAL_SITE_URL,
  MCP_ENDPOINT_PATH,
  MCP_PROTOCOL_VERSION,
} from "@/constants";
import { PUBLIC_AGENT_TOOL_DEFINITIONS } from "@/lib/public-agent-tools";

function getHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function getServerCard() {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    version: "1.0",
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: {
      name: "vidicy-public-tools",
      title: "Vidicy Public Tools",
      version: packageJson.version,
    },
    description:
      "Public structured tools for Vidicy's markdown pages and visa photo requirement checkers.",
    documentationUrl: `${CANONICAL_SITE_URL}/tools`,
    transport: {
      type: "streamable-http",
      endpoint: MCP_ENDPOINT_PATH,
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    tools: PUBLIC_AGENT_TOOL_DEFINITIONS,
  };
}

export async function GET(): Promise<Response> {
  return NextResponse.json(getServerCard(), {
    headers: getHeaders(),
  });
}

export async function HEAD(): Promise<Response> {
  return new NextResponse(null, {
    status: 200,
    headers: getHeaders(),
  });
}

export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: getHeaders(),
  });
}
