import "server-only";

import { NextResponse } from "next/server";
import { ZSAError } from "zsa";

import { requireApplicationPermission } from "@/utils/application-auth";

type RouteAuthSuccess = {
  session: Awaited<ReturnType<typeof requireApplicationPermission>>;
};

type RouteAuthFailure = {
  response: NextResponse;
};

export async function authorizeApplicationRouteAccess(
  applicationId: string,
  permission?: string,
): Promise<RouteAuthSuccess | RouteAuthFailure> {
  try {
    const session = await requireApplicationPermission(applicationId, permission);
    return { session };
  } catch (error) {
    if (error instanceof ZSAError) {
      switch (error.code) {
        case "NOT_AUTHORIZED":
          return {
            response: NextResponse.json({ error: error.message }, { status: 401 }),
          };
        case "FORBIDDEN":
          return {
            response: NextResponse.json({ error: error.message }, { status: 403 }),
          };
        case "NOT_FOUND":
          return {
            response: NextResponse.json({ error: error.message }, { status: 404 }),
          };
        default:
          break;
      }
    }

    throw error;
  }
}
