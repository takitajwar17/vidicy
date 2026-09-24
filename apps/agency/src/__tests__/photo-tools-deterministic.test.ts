import { describe, expect, it } from "vitest";

import {
  ENABLED_PHOTO_TOOL_SLUGS,
  PHOTO_TOOL_DEFINITIONS,
  getPhotoToolBySlug,
  getPhotoToolHref,
} from "@/app/tools/_content";

describe("photo tool deterministic registry", () => {
  it("exposes only the two enabled photo tool slugs", () => {
    expect(ENABLED_PHOTO_TOOL_SLUGS).toEqual([
      "us-visa-photo-requirements",
      "schengen-visa-photo-requirements",
    ]);
  });

  it("returns the US photo tool with stable route config", () => {
    const tool = getPhotoToolBySlug("us-visa-photo-requirements");

    expect(tool).not.toBeNull();
    expect(tool).toMatchObject({
      slug: "us-visa-photo-requirements",
      enabled: true,
      title: "US Visa Photo Requirements Checker",
      metaTitle: "US Visa Photo Requirements Tool",
      routeLabel: "US visa photo requirements",
      primaryCta: "Check My Photo",
      secondaryCta: "Get Full Fix Plan",
      maxFileSizeMb: 5,
    });
    expect(tool?.supportedFileTypes).toEqual([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ]);
    expect(getPhotoToolHref(tool!.slug)).toBe("/tools/us-visa-photo-requirements");
  });

  it("returns the Schengen photo tool with stable route config", () => {
    const tool = getPhotoToolBySlug("schengen-visa-photo-requirements");

    expect(tool).not.toBeNull();
    expect(tool).toMatchObject({
      slug: "schengen-visa-photo-requirements",
      enabled: true,
      title: "Schengen Visa Photo Requirements Checker",
      metaTitle: "Schengen Visa Photo Requirements Tool",
      routeLabel: "Schengen visa photo requirements",
      primaryCta: "Check My Photo",
      secondaryCta: "Get Full Fix Plan",
      maxFileSizeMb: 5,
    });
    expect(tool?.officialSources).toHaveLength(2);
    expect(getPhotoToolHref(tool!.slug)).toBe("/tools/schengen-visa-photo-requirements");
  });

  it("rejects unknown photo tool slugs", () => {
    expect(getPhotoToolBySlug("not-a-real-slug")).toBeNull();
  });

  it("keeps the enabled tool map aligned with the definitions", () => {
    expect(Object.keys(PHOTO_TOOL_DEFINITIONS)).toEqual(ENABLED_PHOTO_TOOL_SLUGS);
  });
});
