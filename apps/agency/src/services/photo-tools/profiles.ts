import "server-only";

import { REDIRECT_AFTER_SIGN_IN } from "@/constants";
import { getAuthRouteHref } from "@/utils/auth-redirect";
import type { PhotoToolProfile, PhotoToolSlug } from "./types";

export const ENABLED_PHOTO_TOOL_SLUGS: PhotoToolSlug[] = [
  "us-visa-photo-requirements",
  "schengen-visa-photo-requirements",
];

const baseAllowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const defaultPhotoToolUnlockPath = getAuthRouteHref("/sign-up", REDIRECT_AFTER_SIGN_IN);

export const PHOTO_TOOL_PROFILES: Record<PhotoToolSlug, PhotoToolProfile> = {
  "us-visa-photo-requirements": {
    slug: "us-visa-photo-requirements",
    enabled: true,
    countryCode: "US",
    title: "US Visa Photo Requirements Checker",
    summary:
      "Check a US visa photo for square crop, size, and visual compliance before you upload it.",
    expectedAspectRatio: 1,
    aspectRatioTolerance: 0.06,
    minWidthPx: 600,
    minHeightPx: 600,
    maxFileSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: baseAllowedMimeTypes,
    technicalRules: [
      "The image should be square or close to square.",
      "The shortest side should be at least 600 pixels.",
      "The file should be a supported photo format and under the size cap.",
    ],
    visualFocus: [
      "plain white or off-white background",
      "centered face with neutral expression",
      "no glasses glare or obstructed eyes",
      "even lighting without strong shadows",
    ],
    officialSources: [
      {
        label: "U.S. Department of State photo guidance",
        href: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html",
      },
      {
        label: "U.S. Department of State digital image requirements",
        href: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos/digital-image-requirements.html",
      },
    ],
    previewCTAPath: defaultPhotoToolUnlockPath,
  },
  "schengen-visa-photo-requirements": {
    slug: "schengen-visa-photo-requirements",
    enabled: true,
    countryCode: "EU",
    title: "Schengen Visa Photo Requirements Checker",
    summary:
      "Check a Schengen visa photo for the 35x45 ratio, dimensions, and common visual issues.",
    expectedAspectRatio: 35 / 45,
    aspectRatioTolerance: 0.05,
    minWidthPx: 413,
    minHeightPx: 531,
    maxFileSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: baseAllowedMimeTypes,
    technicalRules: [
      "The image should match the 35x45 mm ratio closely.",
      "The shortest side should be at least 413 pixels.",
      "The file should be a supported photo format and under the size cap.",
    ],
    visualFocus: [
      "light, plain background without patterns or shadows",
      "face centered and fully visible",
      "neutral expression and clear eyes",
      "consistent lighting across the face",
    ],
    officialSources: [
      {
        label: "European Commission Schengen visa policy",
        href: "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy_en",
      },
      {
        label: "EU Schengen application guidance",
        href: "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy/applying-schengen-visa_en",
      },
    ],
    previewCTAPath: defaultPhotoToolUnlockPath,
  },
};

export function isEnabledPhotoToolSlug(slug: string): slug is PhotoToolSlug {
  return ENABLED_PHOTO_TOOL_SLUGS.includes(slug as PhotoToolSlug);
}

export function getPhotoToolProfile(slug: string): PhotoToolProfile | null {
  if (!isEnabledPhotoToolSlug(slug)) {
    return null;
  }

  return PHOTO_TOOL_PROFILES[slug];
}
