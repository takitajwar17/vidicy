import "server-only";

import {
  getPhotoToolBySlug,
  toolsIndexItems,
} from "@/app/tools/_content";
import {
  AGENT_DISCOVERY_LINK_HEADER,
  CANONICAL_SITE_URL,
  MARKDOWN_CONTENT_TYPE,
  TOOLS_ROUTE,
} from "@/constants";

export interface MarkdownPayload {
  body: string;
  extraHeaders?: HeadersInit;
}

const homepageHowItWorksSteps = [
  "Review visa applications faster in scale.",
  "Bulk upload client files and organize applications in queues.",
  "Flag missing documents, mistakes, and inconsistencies before submission.",
  "Generate client-ready reports while keeping reviewers in control.",
  "Sign in to the agency workspace.",
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
    `- Tools: ${toAbsoluteUrl(TOOLS_ROUTE)}`,
    `- API catalog: ${toAbsoluteUrl("/.well-known/api-catalog")}`,
  ].join("\n\n");

  return {
    body,
    extraHeaders: {
      Link: AGENT_DISCOVERY_LINK_HEADER,
    },
  };
}

function buildToolsIndexMarkdown(): MarkdownPayload {
  const body = [
    createFrontmatter({
      title: "Free Visa Tools",
      description:
        "Free visa tools for checking photo requirements, document readiness, and common mistakes before you submit.",
      canonicalPath: TOOLS_ROUTE,
    }),
    "# Free visa tools",
    "Run a fast pre-check before you submit.",
    "## Available tools",
    ...toolsIndexItems.map(
      (tool) =>
        `### ${tool.title}\n- Summary: ${tool.routeSummary}\n- Page: ${toAbsoluteUrl(tool.href)}`
    ),
  ].join("\n\n");

  return { body };
}

function buildToolMarkdown(pathname: string): MarkdownPayload | null {
  const slugMatch = pathname.match(/^\/tools\/([^/]+)$/);
  if (!slugMatch) {
    return null;
  }

  const tool = getPhotoToolBySlug(slugMatch[1]);
  if (!tool) {
    return null;
  }

  const body = [
    createFrontmatter({
      title: tool.metaTitle,
      description: tool.metaDescription,
      canonicalPath: pathname,
      updatedAt: tool.updatedAt,
    }),
    `# ${tool.title}`,
    tool.description,
    `## ${tool.heroKicker}`,
    tool.heroDescription,
    "## Quick facts",
    ...tool.quickFacts.map((fact) => `- ${fact.label}: ${fact.value}`),
    "## Supported uploads",
    ...tool.supportedFileTypes.map((fileType) => `- ${fileType}`),
    "## Validation checklist",
    ...tool.validationChecklist.map((item) => `- ${item}`),
    "## File requirements",
    ...tool.fileRequirements.map((item) => `- ${item}`),
    "## Official sources",
    ...tool.officialSources.map((source) => `- [${source.label}](${source.href}) — ${source.note}`),
    "## FAQ",
    ...tool.faqItems.map((item) => `### ${item.question}\n${item.answer}`),
    "## Programmatic endpoint",
    `- Analyze route: ${toAbsoluteUrl("/api/tools/photo-requirements/analyze")}`,
  ].join("\n\n");

  return { body };
}

export function getPublicMarkdownPayload(pathname: string): MarkdownPayload | null {
  if (pathname === "/") {
    return buildHomepageMarkdown();
  }

  if (pathname === TOOLS_ROUTE) {
    return buildToolsIndexMarkdown();
  }

  return buildToolMarkdown(pathname);
}

export function getPublicMarkdownContentType() {
  return MARKDOWN_CONTENT_TYPE;
}
