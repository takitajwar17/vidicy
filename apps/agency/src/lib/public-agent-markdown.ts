import "server-only";

import {
  AGENT_DISCOVERY_LINK_HEADER,
  CANONICAL_SITE_URL,
  MARKDOWN_CONTENT_TYPE,
} from "@/constants";

export interface MarkdownPayload {
  body: string;
  extraHeaders?: HeadersInit;
}

const homepageHowItWorksSteps = [
  "Faster, more accurate visa reviews. Every file. Every time.",
  "Check client files for missing documents, mistakes, and inconsistencies.",
  "Review summary, severity breakdowns, top issues, and client-ready reports.",
  "Trusted by agencies worldwide with 98% issue detection accuracy.",
  "Start a free trial or book a demo.",
] as const;

export function countEstimatedMarkdownTokens(markdown: string): string {
  return String(Math.max(1, Math.ceil(markdown.length / 4)));
}

function toAbsoluteUrl(path: string): string {
  return new URL(path, CANONICAL_SITE_URL).toString();
}

function createFrontmatter(input: {
  title: string;
  description: string;
  canonicalPath: string;
  updatedAt?: string;
}) {
  const lines = [
    "---",
    `title: ${input.title}`,
    `description: ${input.description}`,
    `canonical: ${toAbsoluteUrl(input.canonicalPath)}`,
  ];

  if (input.updatedAt) {
    lines.push(`updated_at: ${input.updatedAt}`);
  }

  lines.push("---");

  return lines.join("\n");
}

function buildHomepageMarkdown(): MarkdownPayload {
  const body = [
    createFrontmatter({
      title: "Vidicy Agency",
      description: "Bulk visa application review for travel and visa agencies.",
      canonicalPath: "/",
    }),
    "# Vidicy Agency",
    ...homepageHowItWorksSteps.map((step, index) => `${index + 1}. ${step}`),
    "## Key links",
    `- Login: ${toAbsoluteUrl("/sign-in")}`,
    `- Sign up: ${toAbsoluteUrl("/sign-up")}`,
    `- API catalog: ${toAbsoluteUrl("/.well-known/api-catalog")}`,
  ].join("\n\n");

  return {
    body,
    extraHeaders: {
      Link: AGENT_DISCOVERY_LINK_HEADER,
    },
  };
}

export function getPublicMarkdownPayload(pathname: string): MarkdownPayload | null {
  if (pathname === "/") {
    return buildHomepageMarkdown();
  }

  return null;
}

export function getPublicMarkdownContentType() {
  return MARKDOWN_CONTENT_TYPE;
}
