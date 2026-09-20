"use client";

import { useEffect, useRef, useState } from "react";

const optimizedVideoSource = "/vidicy-hero-background-optimized-trimmed.mp4";
const mobileOptimizedVideoSource = "/vidicy-hero-background-mobile.mp4";
const fullResVideoSource = "/vidicy-hero-background-trimmed.mp4";
const videoPoster = "/vidicy-hero-background-poster.avif";
const fullVideoUpgradeDelayMs = 1200;
// Mobile stays on the smaller trimmed video to protect bandwidth and avoid
// turning the homepage hero into the dominant payload on slow devices.
const mobileViewportMaxWidth = 767;

type PlayableVideo = {
  play: () => Promise<unknown>;
};

type SyncableVideoElement = HTMLVideoElement & {
  load: () => void;
};

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string | null;
};

const mobileVideoColorGradeClassName = "brightness-[1.04] saturate-[1.22] contrast-[1.08]";
const tabletVideoColorGradeClassName = "md:brightness-[0.98] md:saturate-[1.42] md:contrast-[1.14]";
const desktopVideoColorGradeClassName = "lg:brightness-[0.92] lg:saturate-[1.68] lg:contrast-[1.22]";

const backgroundVideoFilterClassName = [
  "absolute inset-0 overflow-hidden",
  mobileVideoColorGradeClassName,
  tabletVideoColorGradeClassName,
  desktopVideoColorGradeClassName,
].join(" ");

export function ensureBackgroundVideoPlayback(video: PlayableVideo) {
  void video.play().catch(() => {
    // Autoplay can still be blocked; keep the poster or last painted frame visible.
  });
}

export function shouldUpgradeBackgroundVideo(
  connection?: NetworkInformationLike | null,
  viewportWidth?: number,
) {
  // Desktop keeps the higher-fidelity handoff. Mobile never upgrades past the
  // optimized trimmed asset, even on fast connections.
  if (typeof viewportWidth === "number" && viewportWidth <= mobileViewportMaxWidth) {
    return false;
  }

  if (!connection) {
    return true;
  }

  return (
    !connection.saveData &&
    connection.effectiveType !== "2g" &&
    connection.effectiveType !== "slow-2g"
  );
}

export function getOptimizedBackgroundVideoSource(viewportWidth?: number) {
  if (typeof viewportWidth === "number" && viewportWidth <= mobileViewportMaxWidth) {
    return mobileOptimizedVideoSource;
  }

  return optimizedVideoSource;
}

export function hasBackgroundVideoViewportTierChanged(
  previousWidth?: number,
  nextWidth?: number,
) {
  if (typeof previousWidth !== "number" || typeof nextWidth !== "number") {
    return false;
  }

  const wasMobile = previousWidth <= mobileViewportMaxWidth;
  const isMobile = nextWidth <= mobileViewportMaxWidth;

  return wasMobile !== isMobile;
}

function getNavigatorConnection() {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

function getViewportWidth() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.innerWidth;
}

function syncVideoTime(source: HTMLVideoElement, target: HTMLVideoElement) {
  if (!Number.isNaN(source.currentTime) && source.currentTime > 0) {
    target.currentTime = source.currentTime;
  }
}

export function ProgressiveBackgroundVideo() {
  const optimizedVideoRef = useRef<HTMLVideoElement>(null);
  const fullVideoRef = useRef<SyncableVideoElement>(null);
  const [isFullVideoVisible, setIsFullVideoVisible] = useState(false);

  useEffect(() => {
    const optimizedVideo = optimizedVideoRef.current;
    const fullVideo = fullVideoRef.current;

    if (!optimizedVideo || !fullVideo) {
      return;
    }

    let upgradeTimer: number | undefined;
    let currentViewportWidth = getViewportWidth();

    const clearUpgradeTimer = () => {
      if (typeof upgradeTimer === "number") {
        window.clearTimeout(upgradeTimer);
        upgradeTimer = undefined;
      }
    };

    const handleFullVideoReady = () => {
      syncVideoTime(optimizedVideo, fullVideo);
      ensureBackgroundVideoPlayback(fullVideo);
      setIsFullVideoVisible(true);
    };

    const handleFullVideoVisible = () => {
      optimizedVideo.pause();
    };

    const detachFullVideoListeners = () => {
      fullVideo.removeEventListener("loadeddata", handleFullVideoReady);
      fullVideo.removeEventListener("canplay", handleFullVideoReady);
      fullVideo.removeEventListener("playing", handleFullVideoVisible);
    };

    const resetFullVideo = () => {
      clearUpgradeTimer();
      detachFullVideoListeners();
      setIsFullVideoVisible(false);
      fullVideo.pause();
      fullVideo.removeAttribute("src");
      fullVideo.load();
      delete fullVideo.dataset.upgraded;
    };

    const upgradeToFullVideo = () => {
      if (fullVideo.dataset.upgraded === "true") {
        return;
      }

      detachFullVideoListeners();
      fullVideo.addEventListener("loadeddata", handleFullVideoReady, { once: true });
      fullVideo.addEventListener("canplay", handleFullVideoReady, { once: true });
      fullVideo.addEventListener("playing", handleFullVideoVisible, { once: true });
      fullVideo.dataset.upgraded = "true";
      fullVideo.src = fullResVideoSource;
      fullVideo.load();
    };

    const handleOptimizedReady = () => {
      ensureBackgroundVideoPlayback(optimizedVideo);

      if (
        !shouldUpgradeBackgroundVideo(getNavigatorConnection(), getViewportWidth()) ||
        typeof upgradeTimer === "number"
      ) {
        return;
      }

      upgradeTimer = window.setTimeout(upgradeToFullVideo, fullVideoUpgradeDelayMs);
    };

    const syncOptimizedVideoSource = (viewportWidth?: number) => {
      const nextSource = getOptimizedBackgroundVideoSource(viewportWidth);

      if (optimizedVideo.getAttribute("src") === nextSource) {
        return;
      }

      optimizedVideo.src = nextSource;
      optimizedVideo.load();
    };

    const handleResize = () => {
      const nextViewportWidth = getViewportWidth();

      if (!hasBackgroundVideoViewportTierChanged(currentViewportWidth, nextViewportWidth)) {
        currentViewportWidth = nextViewportWidth;
        return;
      }

      currentViewportWidth = nextViewportWidth;
      resetFullVideo();
      syncOptimizedVideoSource(nextViewportWidth);
    };

    optimizedVideo.addEventListener("loadeddata", handleOptimizedReady);
    optimizedVideo.addEventListener("canplay", handleOptimizedReady);
    window.addEventListener("resize", handleResize);

    // Keep the initial HTML poster-only. The optimized stream is attached only
    // after hydration so the browser does not start fetching video before first paint.
    syncOptimizedVideoSource(currentViewportWidth);

    return () => {
      window.removeEventListener("resize", handleResize);
      optimizedVideo.removeEventListener("loadeddata", handleOptimizedReady);
      optimizedVideo.removeEventListener("canplay", handleOptimizedReady);
      resetFullVideo();
      optimizedVideo.removeAttribute("src");
      optimizedVideo.load();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={backgroundVideoFilterClassName}
    >
      <video
        ref={optimizedVideoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={videoPoster}
        data-video-stage="optimized"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          isFullVideoVisible ? "opacity-0" : "opacity-100"
        }`}
      />

      <video
        ref={fullVideoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster={videoPoster}
        data-video-stage="full"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
          isFullVideoVisible ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
