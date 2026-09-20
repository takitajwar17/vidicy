"use client";

import { LinearBlur } from "progressive-blur";

export function AtlasBlurOverlay() {
  return (
    <LinearBlur
      side="bottom"
      steps={6}
      strength={14}
      falloffPercentage={100}
      tint="rgba(255,255,255,0)"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "70%",
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  );
}
