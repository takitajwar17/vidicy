import "server-only";

import { NextResponse } from "next/server";

import packageJson from "../../../package.json";
import { MCP_PROTOCOL_VERSION } from "@/constants";
import {
  countEstimatedMarkdownTokens,
  getPublicMarkdownContentType,
  getPublicMarkdownPayload,
} from "@/lib/public-agent-markdown";
import {
  isSupportedPublicMarkdownPath,
  PUBLIC_AGENT_TOOL_DEFINITIONS,
} from "@/lib/public-agent-tools";

interface JsonRpcRequestBody {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function getMcpHeaders() {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };
}

function jsonRpcResult(id: JsonRpcRequestBody["id"], result: Record<string, unknown>) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    result,
  }, {
    headers: getMcpHeaders(),
  });
}

function jsonRpcError(
  id: JsonRpcRequestBody["id"],
  code: number,
  message: string,
  status = 400,
) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  }, {
    status,
    headers: getMcpHeaders(),
  });
}

function buildInstructions() {
  return [
    "Use get_public_markdown for public Vidicy pages that are optimized for agent reading.",
  ].join(" ");
}

function buildInitializeResult() {
  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
    serverInfo: {
      name: "vidicy-public-pages",
      title: "Vidicy Public Pages",
      version: packageJson.version,
    },
    instructions: buildInstructions(),
  };
}

function buildToolCallError(message: string) {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: true,
  };
}

export async function POST(request: Request): Promise<Response> {
  let body: JsonRpcRequestBody;

  try {
    body = await request.json() as JsonRpcRequestBody;
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON request body.");
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return jsonRpcError(body.id ?? null, -32600, "Invalid JSON-RPC request.");
  }

  if (body.method === "initialize") {
    return jsonRpcResult(body.id ?? null, buildInitializeResult());
  }

  if (body.method === "notifications/initialized") {
    return new NextResponse(null, {
      status: 202,
      headers: getMcpHeaders(),
    });
  }

  if (body.method === "tools/list") {
    return jsonRpcResult(body.id ?? null, {
      tools: PUBLIC_AGENT_TOOL_DEFINITIONS,
    });
  }

  if (body.method === "tools/call") {
    const name = typeof body.params?.name === "string" ? body.params.name : "";
    const args = typeof body.params?.arguments === "object" && body.params.arguments !== null
      ? body.params.arguments as Record<string, unknown>
      : {};

    if (name === "get_public_markdown") {
      const path = typeof args.path === "string" ? args.path : "";
      if (!isSupportedPublicMarkdownPath(path)) {
        return jsonRpcResult(body.id ?? null, buildToolCallError("Unsupported public markdown path."));
      }

      const payload = getPublicMarkdownPayload(path);
      if (!payload) {
        return jsonRpcResult(body.id ?? null, buildToolCallError("No markdown payload is available for that path."));
      }

      return jsonRpcResult(body.id ?? null, {
        content: [
          {
            type: "text",
            text: payload.body,
          },
        ],
        structuredContent: {
          path,
          contentType: getPublicMarkdownContentType(),
          tokenEstimate: countEstimatedMarkdownTokens(payload.body),
        },
        isError: false,
      });
    }

    return jsonRpcResult(body.id ?? null, buildToolCallError("Unsupported tool."));
  }

  return jsonRpcError(body.id ?? null, -32601, `Method not found: ${body.method}`, 404);
}

export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: getMcpHeaders(),
  });
}
