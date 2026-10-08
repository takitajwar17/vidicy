import "server-only";

import { ZSAError } from "zsa";
import { getR2Bucket } from "@/lib/r2";

export function isSupportScreenshotOwnedBy({
  fileKey,
  object,
  userId,
}: {
  fileKey: string;
  object: Pick<R2Object, "customMetadata"> | null;
  userId: string | null;
}): boolean {
  return Boolean(
    userId &&
    object?.customMetadata?.uploadedBy === userId &&
    (fileKey.startsWith(`support-screenshots/${userId}/`) ||
      fileKey.startsWith("support-screenshots/admin/")),
  );
}

export async function validateSupportScreenshots({
  keys,
  userId,
  isAdmin,
}: {
  keys: string[] | undefined;
  userId: string;
  isAdmin: boolean;
}): Promise<string[] | null> {
  if (!keys?.length) return null;
  const uniqueKeys = [...new Set(keys)];
  const bucket = await getR2Bucket();
  for (const fileKey of uniqueKeys) {
    const hasAllowedPrefix =
      fileKey.startsWith(`support-screenshots/${userId}/`) ||
      (isAdmin && fileKey.startsWith("support-screenshots/admin/"));
    if (
      !hasAllowedPrefix ||
      !isSupportScreenshotOwnedBy({ fileKey, object: await bucket.head(fileKey), userId })
    ) {
      throw new ZSAError("FORBIDDEN", "You can only attach your own screenshot uploads.");
    }
  }
  return uniqueKeys;
}
