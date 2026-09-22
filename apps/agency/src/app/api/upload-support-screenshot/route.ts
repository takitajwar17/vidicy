import "server-only";

import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { withRateLimit } from "@/infra/with-rate-limit";
import { logger, logAlert } from "@/infra/logger";
import ms from "ms";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
import { MAX_SUPPORT_FILE_SIZE } from "@/constants";
import { requireRouteSession } from "@/app/api/_utils/request-auth";

export async function POST(request: Request) {
  try {
    const access = await requireRouteSession();
    if ("response" in access) {
      return access.response;
    }
    const { session } = access;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "A file is required" }, { status: 400 });
    }

    if (file.size > MAX_SUPPORT_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 5 MB." }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: JPEG, PNG, WebP, GIF." },
        { status: 400 },
      );
    }

    const { env } = await getCloudflareContext({ async: true });
    if (!env.R2) {
      return NextResponse.json(
        { error: "Storage unavailable. Please try again later." },
        { status: 503 },
      );
    }

    return withRateLimit(
      async () => {
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const isAdmin = session.user.role === "admin";
        const fileKey = isAdmin
          ? `support-screenshots/admin/${Date.now()}-${sanitizedFileName}`
          : `support-screenshots/${session.user.id}/${Date.now()}-${sanitizedFileName}`;

        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          await env.R2.put(fileKey, bytes, {
            httpMetadata: { contentType: file.type },
            customMetadata: { uploadedBy: session.user.id },
          });
        } catch (r2Error) {
          logAlert("r2_failure", "R2 upload failed (support screenshot)", { error: r2Error });
          return NextResponse.json(
            { error: "Screenshot upload failed. Please try again later." },
            { status: 503 },
          );
        }

        return NextResponse.json({ success: true, fileKey });
      },
      {
        identifier: "support-screenshot-upload",
        userIdentifier: session.user.id,
        limit: 20,
        windowInSeconds: Math.floor(ms("1 hour") / 1000),
      },
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Rate limit exceeded")) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    logger.error("Unexpected error (upload-support-screenshot)", { error });
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
