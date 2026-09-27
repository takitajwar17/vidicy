import { MetadataRoute } from "next";

import { PHOTO_TOOL_DEFINITIONS } from "@/app/tools/_content";
import { CANONICAL_SITE_URL } from "@/constants";

type DynamicDateSource = "tools";

interface StaticSitemapEntry {
  path: string;
  lastModified: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
  dynamicDateSource?: DynamicDateSource;
}

const STATIC_SITEMAP_ENTRIES: StaticSitemapEntry[] = [
  {
    path: "/",
    lastModified: "2026-10-08",
    changeFrequency: "weekly",
    priority: 1.0,
  },
  {
    path: "/about",
    lastModified: "2026-10-08",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/faq",
    lastModified: "2026-10-08",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/how-it-works",
    lastModified: "2026-10-08",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/editorial-standards",
    lastModified: "2026-10-12",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/enterprise",
    lastModified: "2026-10-08",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/tools",
    lastModified: "2026-10-09",
    changeFrequency: "weekly",
    priority: 0.85,
    dynamicDateSource: "tools",
  },
  {
    path: "/privacy",
    lastModified: "2026-10-02",
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    path: "/terms",
    lastModified: "2026-10-02",
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    path: "/subprocessors",
    lastModified: "2026-10-07",
    changeFrequency: "yearly",
    priority: 0.3,
  },
];

function parseSitemapDate(value: string): Date | null {
  const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const parsedDate = new Date(normalizedValue);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function getLatestSitemapDate(values: string[]): string | null {
  let latest: Date | null = null;

  for (const value of values) {
    const parsedValue = parseSitemapDate(value);

    if (!parsedValue) {
      continue;
    }

    if (!latest || parsedValue > latest) {
      latest = parsedValue;
    }
  }

  return latest ? latest.toISOString().slice(0, 10) : null;
}

function lastModified(date: string) {
  return parseSitemapDate(date) ?? new Date("2026-09-19T00:00:00.000Z");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const enabledTools = Object.values(PHOTO_TOOL_DEFINITIONS).filter((tool) => tool.enabled);
  const toolEntries: MetadataRoute.Sitemap = enabledTools.map((tool) => ({
    url: `${CANONICAL_SITE_URL}/tools/${tool.slug}`,
    lastModified: lastModified(tool.updatedAt),
    changeFrequency: "monthly" as const,
    priority: 0.8,
  }));

  const latestDatesBySource: Record<DynamicDateSource, string | null> = {
    tools: getLatestSitemapDate(enabledTools.map((tool) => tool.updatedAt)),
  };

  return [
    ...STATIC_SITEMAP_ENTRIES.map((entry) => {
      const dynamicLastModified = entry.dynamicDateSource
        ? latestDatesBySource[entry.dynamicDateSource]
        : null;

      return {
        url: entry.path === "/" ? CANONICAL_SITE_URL : `${CANONICAL_SITE_URL}${entry.path}`,
        lastModified: lastModified(dynamicLastModified ?? entry.lastModified),
        changeFrequency: entry.changeFrequency,
        priority: entry.priority,
      };
    }),
    ...toolEntries,
  ];
}
