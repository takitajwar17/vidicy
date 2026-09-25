import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ProgressiveBackgroundVideo,
  ensureBackgroundVideoPlayback,
  getOptimizedBackgroundVideoSource,
  shouldUpgradeBackgroundVideo,
} from "@/components/homepage/background-video";

describe("hero background video playback helper", () => {
  it("always attempts playback and swallows autoplay rejections", async () => {
    const play = vi.fn().mockRejectedValue(new Error("autoplay blocked"));

    expect(() => ensureBackgroundVideoPlayback({ play })).not.toThrow();
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("skips the full-resolution upgrade on constrained connections", () => {
    expect(shouldUpgradeBackgroundVideo({ saveData: true })).toBe(false);
    expect(shouldUpgradeBackgroundVideo({ effectiveType: "slow-2g" })).toBe(false);
    expect(shouldUpgradeBackgroundVideo({ effectiveType: "2g" })).toBe(false);
    expect(shouldUpgradeBackgroundVideo({ effectiveType: "3g" })).toBe(true);
    expect(shouldUpgradeBackgroundVideo(undefined)).toBe(true);
  });

  it("keeps mobile on the optimized trimmed video", () => {
    expect(shouldUpgradeBackgroundVideo({ effectiveType: "4g" }, 390)).toBe(false);
    expect(shouldUpgradeBackgroundVideo(undefined, 767)).toBe(false);
    expect(shouldUpgradeBackgroundVideo({ effectiveType: "4g" }, 1024)).toBe(true);
  });

  it("uses a smaller optimized source on mobile", () => {
    expect(getOptimizedBackgroundVideoSource(390)).toBe("/vidicy-hero-background-mobile.mp4");
    expect(getOptimizedBackgroundVideoSource(767)).toBe("/vidicy-hero-background-mobile.mp4");
    expect(getOptimizedBackgroundVideoSource(768)).toBe(
      "/vidicy-hero-background-optimized-trimmed.mp4",
    );
    expect(getOptimizedBackgroundVideoSource()).toBe("/vidicy-hero-background-optimized-trimmed.mp4");
  });

  it("renders only the poster in the initial markup", () => {
    const markup = renderToStaticMarkup(createElement(ProgressiveBackgroundVideo));

    expect(markup).toContain('poster="/vidicy-hero-background-poster.avif"');
    expect(markup).not.toContain("/vidicy-hero-background-mobile.mp4");
    expect(markup).not.toContain("/vidicy-hero-background-optimized-trimmed.mp4");
    expect(markup).not.toContain("/vidicy-hero-background-trimmed.mp4");
  });
});
