import "server-only";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { authorizeApplicationRouteAccess } from "@/app/api/_utils/application-route-auth";
import { requireRouteSession } from "@/app/api/_utils/request-auth";
import { logger } from "@/infra/logger";
import { CACHE_MAX_AGE_1_HOUR } from "@/constants";
import { getDB } from "@/db";
import { APPLICATION_PERMISSIONS, uploadedDocumentTable } from "@/db/schema";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    // 1. Authenticate
    const routeAccess = await requireRouteSession();
    if ("response" in routeAccess) {
      return routeAccess.response;
    }

    // 2. Extract route and query params
    const { documentId } = await params;
    const download = new URL(request.url).searchParams.get("download") === "1";

    // 3. Look up document record from DB
    const db = getDB();
    const doc = await db.query.uploadedDocumentTable.findFirst({
      where: eq(uploadedDocumentTable.id, documentId),
      columns: {
        id: true,
        applicationId: true,
        fileKey: true,
        fileName: true,
        mimeType: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // 4. Authorisation check
    const applicationAccess = await authorizeApplicationRouteAccess(
      doc.applicationId,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    if ("response" in applicationAccess) {
      return applicationAccess.response;
    }

    // 5. Fetch from R2
    const { env } = await getCloudflareContext({ async: true });
    const object = await env.R2.get(doc.fileKey);

    if (!object) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // 6. Stream the response with appropriate headers
    const headers = new Headers();
    headers.set("Content-Type", doc.mimeType);
    headers.set("Cache-Control", `private, max-age=${CACHE_MAX_AGE_1_HOUR}`);

    if (download) {
      headers.set("Content-Disposition", `attachment; filename="${doc.fileName}"`);
    } else {
      headers.set("Content-Disposition", `inline; filename="${doc.fileName}"`);
    }

    return new Response(object.body as ReadableStream, { headers });
  } catch (error) {
    logger.error("Unexpected error (document-preview)", { error });

    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving the document." },
      { status: 500 },
    );
  }
}
