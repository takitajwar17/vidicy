import "server-only";

import {
  getPhotoToolBySlug,
  toolsIndexItems,
} from "@/app/tools/_content";
import { homepageConfig } from "@/components/homepage/config";
import { homepageFaqItems } from "@/components/homepage/faq";
import { pricingPlans } from "@/config/pricing";
import { marketingTopBarLinks } from "@/lib/config";
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
  "Build your custom checklist for the visa type, passport, filing country, and embassy or consulate.",
  "Upload documents and catch missing pages, weak evidence, and cross-document inconsistencies.",
  "Iterate until the remaining risks are clear, manageable, and ready for submission.",
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
      title: homepageConfig.seoTitle,
      description: homepageConfig.seoDescription,
      canonicalPath: "/",
    }),
    "# Vidicy",
    homepageConfig.seoDescription,
    "## What Vidicy helps with",
    "- Embassy-specific document checklist generation",
    "- AI document evaluation and risk scoring",
    "- Cross-document inconsistency detection",
    "- Atlas AI assistant grounded in your uploaded documents",
    "## How it works",
    ...homepageHowItWorksSteps.map((step, index) => `${index + 1}. ${step}`),
    "## Pricing",
    ...pricingPlans.map((plan) =>
      `### ${plan.name}\n- Price: ${plan.price} ${plan.period}\n- Description: ${plan.description}\n- Next step: ${toAbsoluteUrl(plan.href)}`
    ),
    "## Key links",
    `- Sign up: ${toAbsoluteUrl("/sign-up")}`,
    `- Tools: ${toAbsoluteUrl(TOOLS_ROUTE)}`,
    ...marketingTopBarLinks.map((link) => `- ${link.label}: ${toAbsoluteUrl(link.href)}`),
    `- API catalog: ${toAbsoluteUrl("/.well-known/api-catalog")}`,
    "## FAQ",
    ...homepageFaqItems.map((item) => `### ${item.question}\n${item.answer}`),
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
