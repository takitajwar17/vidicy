import type { Metadata } from "next";

/**
 * Favicon metadata for Google Search and browsers.
 *
 * Google often shows a generic globe when the only advertised asset is SVG or
 * when the raster icon is smaller than 48×48. List PNGs first (48px + 512px),
 * then SVG for modern UIs, then the legacy .ico for old clients.
 *
 * Keep `src/app/favicon.ico` in sync with `public/favicon-48.png` (multi-size ICO
 * including 48×48) so crawlers that fetch `/favicon.ico` match SERP PNG hints.
 */
export const siteFaviconIcons: Metadata["icons"] = {
  icon: [
    { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    { url: "/favicon.svg", type: "image/svg+xml" },
  ],
  shortcut: "/favicon.ico",
};
