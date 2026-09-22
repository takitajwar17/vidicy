import "server-only";

import { NextResponse } from "next/server";
import ms from "ms";
import { withRateLimit } from "@/infra/with-rate-limit";
import {
  analyzePhotoRequirements,
  getPhotoToolProfile,
  isEnabledPhotoToolSlug,
} from "@/services/photo-tools";

const PHOTO_ANALYSIS_RATE_LIMIT = {
  identifier: "photo-requirements-analyze",
  limit: 8,
  windowInSeconds: Math.floor(ms("1 hour") / 1000),
} as const;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function readFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isRateLimitError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  return normalizedMessage.includes("rate limit") || normalizedMessage.includes("too many requests");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const slug = readFormValue(formData, "slug");
    const fileValue = formData.get("file");

    if (!slug) {
      return jsonError("slug is required", 400);
    }

    if (!isEnabledPhotoToolSlug(slug)) {
      return jsonError("Unsupported photo tool", 404);
    }

    const profile = getPhotoToolProfile(slug);
    if (!profile) {
      return jsonError("Unsupported photo tool", 404);
    }

    if (!(fileValue instanceof File)) {
      return jsonError("file is required", 400);
    }

    if (fileValue.size <= 0) {
      return jsonError("file cannot be empty", 400);
    }

    if (fileValue.size > profile.maxFileSizeBytes) {
      const maxFileSizeMb = Math.floor(profile.maxFileSizeBytes / (1024 * 1024));
      return jsonError(`File too large. Please upload an image under ${maxFileSizeMb} MB.`, 400);
    }

    if (!profile.allowedMimeTypes.includes(fileValue.type)) {
      return jsonError(
        "Unsupported file type. Allowed types: JPEG, PNG, WebP.",
        400,
      );
    }

    return withRateLimit(
      async () => {
        const analysis = await analyzePhotoRequirements({
          profile,
          file: fileValue,
        });

        return NextResponse.json(analysis, {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
          },
        });
      },
      {
        ...PHOTO_ANALYSIS_RATE_LIMIT,
      },
    );
  } catch (error) {
    if (isRateLimitError(error)) {
      const message = error instanceof Error ? error.message : "Rate limit exceeded.";
      return jsonError(message, 429);
    }

    return jsonError("An unexpected error occurred while analyzing the photo.", 500);
  }
}
