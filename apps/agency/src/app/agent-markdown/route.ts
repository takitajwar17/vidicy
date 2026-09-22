import "server-only";

import { NextResponse } from "next/server";

import {
  countEstimatedMarkdownTokens,
  getPublicMarkdownContentType,
  getPublicMarkdownPayload,
} from "@/lib/public-agent-markdown";

function buildMarkdownResponse(payload: { body: string; extraHeaders?: HeadersInit }, includeBody: boolean): Response {
  const headers = new Headers({
    "Content-Type": getPublicMarkdownContentType(),
    Vary: "Accept",
    "X-Markdown-Tokens": countEstimatedMarkdownTokens(payload.body),
  });

  for (const [key, value] of Object.entries(payload.extraHeaders ?? {})) {
    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return new NextResponse(includeBody ? payload.body : null, {
    status: 200,
    headers,
  });
}

function getRequestedPath(request: Request): string {
  const url = new URL(request.url);
  const path = url.searchParams.get("path");

  if (!path) {
    return "/";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function buildNotFoundResponse(): Response {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      Vary: "Accept",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const payload = getPublicMarkdownPayload(getRequestedPath(request));

  if (!payload) {
    return buildNotFoundResponse();
  }

  return buildMarkdownResponse(payload, true);
}

export async function HEAD(request: Request): Promise<Response> {
  const payload = getPublicMarkdownPayload(getRequestedPath(request));

  if (!payload) {
    return buildNotFoundResponse();
  }

  return buildMarkdownResponse(payload, false);
}
