import { describe, expect, it } from "vitest";

import {
  ENABLED_PHOTO_TOOL_SLUGS,
  PHOTO_TOOL_PROFILES,
  getPhotoToolProfile,
  isEnabledPhotoToolSlug,
} from "@/services/photo-tools";

describe("photo tool profile service", () => {
  it("keeps the enabled slug list stable", () => {
    expect(ENABLED_PHOTO_TOOL_SLUGS).toEqual([
      "us-visa-photo-requirements",
      "schengen-visa-photo-requirements",
    ]);
  });

  it("recognizes enabled and disabled photo tool slugs", () => {
    expect(isEnabledPhotoToolSlug("us-visa-photo-requirements")).toBe(true);
    expect(isEnabledPhotoToolSlug("schengen-visa-photo-requirements")).toBe(true);
    expect(isEnabledPhotoToolSlug("not-a-real-slug")).toBe(false);
  });

  it("returns the US profile with the expected deterministic rules", () => {
    const profile = getPhotoToolProfile("us-visa-photo-requirements");

    expect(profile).not.toBeNull();
    expect(profile).toMatchObject({
      slug: "us-visa-photo-requirements",
      enabled: true,
      countryCode: "US",
      title: "US Visa Photo Requirements Checker",
      expectedAspectRatio: 1,
      aspectRatioTolerance: 0.06,
      minWidthPx: 600,
      minHeightPx: 600,
      maxFileSizeBytes: 5 * 1024 * 1024,
      previewCTAPath: "/sign-up",
    });
    expect(profile?.allowedMimeTypes).toEqual([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);
    expect(profile?.visualFocus).toContain("plain white or off-white background");
  });

  it("returns the Schengen profile with the expected deterministic rules", () => {
    const profile = getPhotoToolProfile("schengen-visa-photo-requirements");

    expect(profile).not.toBeNull();
    expect(profile).toMatchObject({
      slug: "schengen-visa-photo-requirements",
      enabled: true,
      countryCode: "EU",
      title: "Schengen Visa Photo Requirements Checker",
      expectedAspectRatio: 35 / 45,
      aspectRatioTolerance: 0.05,
      minWidthPx: 413,
      minHeightPx: 531,
      maxFileSizeBytes: 5 * 1024 * 1024,
      previewCTAPath: "/sign-up",
    });
    expect(profile?.allowedMimeTypes).toEqual([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);
    expect(profile?.visualFocus).toContain("light, plain background without patterns or shadows");
  });

  it("returns null for unknown slugs", () => {
    expect(getPhotoToolProfile("invalid-slug")).toBeNull();
  });

  it("keeps the profiles map aligned with the enabled slugs", () => {
    expect(Object.keys(PHOTO_TOOL_PROFILES)).toEqual(ENABLED_PHOTO_TOOL_SLUGS);
  });
});
