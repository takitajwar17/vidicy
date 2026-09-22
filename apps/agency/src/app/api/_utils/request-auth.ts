import "server-only";

import { NextResponse } from "next/server";

import { getSessionFromCookie, requireAdmin } from "@/utils/auth";

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getRequestOrigin(request: Request): string | null {
  return request.headers.get("origin") ?? request.headers.get("referer");
}

export function isRequestFromSite(request: Request): boolean {
  const rawOrigin = getRequestOrigin(request);

  if (!rawOrigin) {
    return true;
  }

  const requestOrigin = normalizeOrigin(request.url);
  const callerOrigin = normalizeOrigin(rawOrigin);

  return requestOrigin !== null && callerOrigin === requestOrigin;
}

export function requireSameOriginRequest(request: Request) {
  if (isRequestFromSite(request)) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized origin" }, { status: 403 });
}

export async function requireRouteSession() {
  const session = await getSessionFromCookie();

  if (!session) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  return { session } as const;
}

export async function requireAdminRouteSession() {
  const session = await requireAdmin({ doNotThrowError: true });

  if (!session) {
    return {
      response: NextResponse.json(
        { error: "Not Found" },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      ),
    } as const;
  }

  return { session } as const;
}
