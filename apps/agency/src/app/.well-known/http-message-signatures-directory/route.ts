import "server-only";

import { NextResponse } from "next/server";
import {
  buildDirectoryBody,
  buildDirectorySignatureHeaders,
  getConfiguredPrivateDirectoryJwk,
  getConfiguredPublicDirectoryJwk,
  getDirectoryCacheControl,
  HTTP_MESSAGE_SIGNATURES_DIRECTORY_CONTENT_TYPE,
} from "@/lib/web-bot-auth";

export const dynamic = "force-dynamic";

async function buildDirectoryResponse(request: Request, includeBody: boolean) {
  const publicJwk = await getConfiguredPublicDirectoryJwk();

  if (!publicJwk) {
    return NextResponse.json({
      error: "WEB_BOT_AUTH_PUBLIC_JWK is not configured.",
    }, {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }

  const headers = new Headers({
    "Content-Type": HTTP_MESSAGE_SIGNATURES_DIRECTORY_CONTENT_TYPE,
    "Cache-Control": getDirectoryCacheControl(),
  });

  const privateJwk = getConfiguredPrivateDirectoryJwk();
  if (privateJwk) {
    const authority = new URL(request.url).host;
    const signatureHeaders = await buildDirectorySignatureHeaders({
      authority,
      publicJwk,
      privateJwk,
    });

    for (const [key, value] of Object.entries(signatureHeaders)) {
      headers.set(key, value);
    }
  }

  return new NextResponse(includeBody ? JSON.stringify(buildDirectoryBody(publicJwk)) : null, {
    status: 200,
    headers,
  });
}

export async function GET(request: Request): Promise<Response> {
  return buildDirectoryResponse(request, true);
}

export async function HEAD(request: Request): Promise<Response> {
  return buildDirectoryResponse(request, false);
}
