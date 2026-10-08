import type { MetadataRoute } from "next";
import {
  CANONICAL_SITE_DOMAIN,
  CANONICAL_SITE_URL,
  PUBLIC_ROBOTS_DISALLOW_PATHS,
} from "@/constants";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...PUBLIC_ROBOTS_DISALLOW_PATHS] },
    host: CANONICAL_SITE_DOMAIN,
    sitemap: `${CANONICAL_SITE_URL}/sitemap.xml`,
  };
}
