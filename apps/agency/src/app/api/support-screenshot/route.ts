import "server-only";

import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getRuntimeContext } from "@/infra/runtime-context";
import { isSupportScreenshotOwnedBy } from "@/server/support-attachments";
import { logger } from "@/infra/logger";
import { CACHE_MAX_AGE_1_HOUR } from "@/constants";
import { getDB } from "@/db";
import { supportMessageTable, supportTicketTable } from "@/db/schema";
import { requireRouteSession } from "@/app/api/_utils/request-auth";

export async function GET(request: Request) {
  try {
    const access = await requireRouteSession();
    if ("response" in access) {
      return access.response;
    }
    const { session } = access;

    const { searchParams } = new URL(request.url);
    const fileKey = searchParams.get("key");

    if (!fileKey || !fileKey.startsWith("support-screenshots/")) {
      return NextResponse.json({ error: "Invalid file key" }, { status: 400 });
    }

    const isAdmin = session.user.role === "admin";
    const ownPrefix = `support-screenshots/${session.user.id}/`;
    if (
      !isAdmin &&
      !fileKey.startsWith(ownPrefix) &&
      !fileKey.startsWith("support-screenshots/admin/")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { env } = await getRuntimeContext({ async: true });
    if (!env.R2) return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
    const object = await env.R2.get(fileKey);
    if (!object) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!isAdmin) {
      let hasAccess =
        fileKey.startsWith(ownPrefix) &&
        isSupportScreenshotOwnedBy({ fileKey, object, userId: session.user.id });
      if (!hasAccess && fileKey.startsWith("support-screenshots/admin/")) {
        const db = getDB();
        const tickets = await db.query.supportTicketTable.findMany({
          where: eq(supportTicketTable.userId, session.user.id),
          columns: { id: true, userId: true, screenshotUrls: true },
        });
        hasAccess = tickets.some(
          (ticket) =>
            ticket.screenshotUrls?.includes(fileKey) &&
            isSupportScreenshotOwnedBy({ fileKey, object, userId: ticket.userId }),
        );
        if (!hasAccess && tickets.length > 0) {
          const messages = await db.query.supportMessageTable.findMany({
            where: inArray(
              supportMessageTable.ticketId,
              tickets.map((ticket) => ticket.id),
            ),
            columns: { screenshotUrls: true, userId: true },
          });
          hasAccess = messages.some(
            (message) =>
              message.screenshotUrls?.includes(fileKey) &&
              isSupportScreenshotOwnedBy({ fileKey, object, userId: message.userId }),
          );
        }
      }
      if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const bytes = await object.arrayBuffer();
    const contentType = object.httpMetadata?.contentType ?? "image/jpeg";

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `private, max-age=${CACHE_MAX_AGE_1_HOUR}`,
      },
    });
  } catch (error) {
    logger.error("Unexpected error (support-screenshot)", { error });
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
