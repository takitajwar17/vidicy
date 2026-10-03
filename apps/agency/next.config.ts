import type { NextConfig } from "next";

import withBundleAnalyzer from "@next/bundle-analyzer";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const isDevelopment = process.env.NODE_ENV === "development";

// The OpenNext Cloudflare dev shim is only needed for `next dev`.
// Keeping it out of production builds avoids coupling config evaluation to dev-only bindings.
if (isDevelopment) {
  initOpenNextCloudflareForDev();
}

const skipTypeScriptChecks = process.env.SKIP_TYPESCRIPT_CHECKS === "true";

const nextConfig: NextConfig = {
  distDir: isDevelopment ? ".next-dev" : ".next",
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "randomuser.me" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "assets.publishing.service.gov.uk" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "source.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
      { protocol: "https", hostname: "cdn.pixabay.com" },
      { protocol: "https", hostname: "i.imgur.com" },
      { protocol: "https", hostname: "res.cloudinary.com" },
    ],
  },
  typedRoutes: true,
  serverExternalPackages: ["winston", "winston-daily-rotate-file"],
  typescript: {
    ignoreBuildErrors: skipTypeScriptChecks,
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "motion/react",
      "date-fns",
      "remeda",
      "@react-email/components",
      "@react-email/render",
      "zod",
      "@tanstack/react-table",
    ],
  },
  async redirects() {
    return [
      { source: "/pricing", destination: "/enterprise", permanent: true },
      { source: "/features", destination: "/enterprise", permanent: true },
      { source: "/contact", destination: "/enterprise", permanent: true },
      { source: "/login", destination: "/sign-in", permanent: true },
      { source: "/signup", destination: "/sign-up", permanent: true },
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
    ];
  },
  async rewrites() {
    return [
      // No rewrites.
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default process.env.ANALYZE === "true" ? withBundleAnalyzer()(nextConfig) : nextConfig;
