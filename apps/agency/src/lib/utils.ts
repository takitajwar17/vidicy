import { siteConfig } from "@/lib/config";
import { siteFaviconIcons } from "@/lib/site-icons";
import {
  OPEN_GRAPH_IMAGE_HEIGHT,
  OPEN_GRAPH_IMAGE_PATH,
  OPEN_GRAPH_IMAGE_WIDTH,
} from "@/constants";
import { clsx, type ClassValue } from "clsx"
import { Metadata } from "next";
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function absoluteUrl(path: string) {
  return new URL(path, siteConfig.url).toString();
}

export function constructMetadata({
  title = siteConfig.name,
  description = siteConfig.description,
  image = absoluteUrl(OPEN_GRAPH_IMAGE_PATH),
  ...props
}: {
  title?: string;
  description?: string;
  image?: string;
} & Metadata): Metadata {
  const { openGraph: userOpenGraph, alternates, ...restProps } = props;

  const canonicalHref =
    alternates && typeof alternates === "object" && alternates !== null && "canonical" in alternates
      ? (alternates as { canonical?: string | URL }).canonical
      : undefined;

  /** Ahrefs/Open Graph validators expect `og:url`; derive it from `alternates.canonical` when set. */
  const canonicalUrl =
    canonicalHref === undefined
      ? undefined
      : typeof canonicalHref === "string"
        ? canonicalHref.startsWith("http")
          ? canonicalHref
          : absoluteUrl(canonicalHref.startsWith("/") ? canonicalHref : `/${canonicalHref}`)
        : canonicalHref instanceof URL
          ? canonicalHref.toString()
          : String(canonicalHref);

  const ogTitle = typeof title === "string" ? title : siteConfig.name;

  return {
    // Return title as a plain string so Next.js applies the root layout's
    // "%s - Vidicy" template correctly. Previously this returned
    // an object with `default: siteConfig.name`, which caused every page using
    // constructMetadata to render as "Vidicy - Vidicy".
    title,
    description: description || siteConfig.description,
    openGraph: {
      title,
      description,
      siteName: siteConfig.name,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      images: [
        {
          url: image,
          width: OPEN_GRAPH_IMAGE_WIDTH,
          height: OPEN_GRAPH_IMAGE_HEIGHT,
          alt: ogTitle,
        },
      ],
      type: "website",
      locale: "en_US",
      ...userOpenGraph,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    icons: siteFaviconIcons,
    metadataBase: new URL(siteConfig.url),
    authors: [
      {
        name: "Anian",
        url: "https://twitter.com/takitajwar17",
      },
    ],
    ...(alternates ? { alternates } : {}),
    ...restProps,
  };
}

export function formatRelativeDate(date: string) {
  let currentDate = new Date().getTime();
  if (!date.includes("T")) {
    date = `${date}T00:00:00`;
  }
  let targetDate = new Date(date).getTime();
  let timeDifference = Math.abs(currentDate - targetDate);
  let daysAgo = Math.floor(timeDifference / (1000 * 60 * 60 * 24));

  let fullDate = new Date(date).toLocaleString("en-us", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (daysAgo < 1) {
    return "Today";
  } else if (daysAgo < 7) {
    return `${fullDate} (${daysAgo}d ago)`;
  } else if (daysAgo < 30) {
    const weeksAgo = Math.floor(daysAgo / 7);
    return `${fullDate} (${weeksAgo}w ago)`;
  } else if (daysAgo < 365) {
    const monthsAgo = Math.floor(daysAgo / 30);
    return `${fullDate} (${monthsAgo}mo ago)`;
  } else {
    const yearsAgo = Math.floor(daysAgo / 365);
    return `${fullDate} (${yearsAgo}y ago)`;
  }
}
