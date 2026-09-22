import "server-only";

import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
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

    // Non-admins can only view screenshots they own or that belong to their own tickets
    if (!isAdmin) {
      const ownPrefix = `support-screenshots/${session.user.id}/`;
      const adminPrefix = "support-screenshots/admin/";

      if (fileKey.startsWith(ownPrefix)) {
        // always allowed: caller's own support-screenshots/{userId}/...
      } else if (fileKey.startsWith(adminPrefix)) {
        // only allow admin-prefixed screenshots that are attached to this user's ticket thread
        const db = getDB();
        const userTickets = await db.query.supportTicketTable.findMany({
          where: eq(supportTicketTable.userId, session.user.id),
          columns: { id: true, screenshotUrls: true },
        });

        let hasAccess = userTickets.some((ticket) => ticket.screenshotUrls?.includes(fileKey));

        if (!hasAccess) {
          const ticketIds = userTickets.map((ticket) => ticket.id);
          if (ticketIds.length > 0) {
            const messages = await db.query.supportMessageTable.findMany({
              where: inArray(supportMessageTable.ticketId, ticketIds),
              columns: { screenshotUrls: true },
            });
            hasAccess = messages.some((message) => message.screenshotUrls?.includes(fileKey));
          }
        }

        if (!hasAccess) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { env } = await getCloudflareContext({ async: true });

    if (!env.R2) {
      return NextResponse.json({ error: "Storage unavailable" }, { status: 503 });
    }

    const object = await env.R2.get(fileKey);
    if (!object) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
