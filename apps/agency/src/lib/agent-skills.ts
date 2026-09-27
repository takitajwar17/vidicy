import "server-only";

import { Buffer } from "node:buffer";

import { CANONICAL_SITE_URL } from "@/constants";

export interface PublishedAgentSkill {
  slug: string;
  description: string;
  content: string;
}

export interface PublishedAgentSkillIndexEntry {
  name: string;
  type: "skill-md";
  description: string;
  url: string;
  digest: string;
}

function createSkillContent(input: {
  name: string;
  description: string;
  body: string[];
}) {
  return [
    "---",
    `name: ${input.name}`,
    `description: ${input.description}`,
    "---",
    "",
    ...input.body,
    "",
  ].join("\n");
}

const publishedAgentSkills: PublishedAgentSkill[] = [
  {
    slug: "vidicy-public-markdown",
    description:
      "Fetch Vidicy's public marketing pages as markdown with content negotiation for agent-friendly reading.",
    content: createSkillContent({
      name: "vidicy-public-markdown",
      description:
        "Fetch Vidicy's public marketing pages as markdown with content negotiation for agent-friendly reading.",
      body: [
        "# When to use this skill",
        "- You need the markdown version of Vidicy's public pages instead of HTML.",
        "- You want a token-efficient summary source for the homepage.",
        "# Request pattern",
        "- Send Accept: text/markdown",
        "# Supported public markdown routes",
        `- Homepage: ${CANONICAL_SITE_URL}/`,
        "# Expected response",
        "- Content-Type: text/markdown; charset=utf-8",
        "- X-Markdown-Tokens header when markdown is returned",
      ],
    }),
  },
  {
    slug: "vidicy-application-readiness",
    description:
      "Understand Vidicy's authenticated document-readiness workflow: checklist generation, evaluation, and Atlas guidance.",
    content: createSkillContent({
      name: "vidicy-application-readiness",
      description:
        "Understand Vidicy's authenticated document-readiness workflow: checklist generation, evaluation, and Atlas guidance.",
      body: [
        "# When to use this skill",
        "- You need a high-level map of Vidicy's authenticated workflow.",
        "- You want to explain how users move from checklist creation to evaluation and Atlas guidance.",
        "# Workflow",
        "- Checklist: generate an embassy-aware document list for the specific application route.",
        "- Evaluation: upload documents and detect missing, weak, or inconsistent evidence.",
        "- Atlas: chat over the application context and uploaded document set.",
        "# Access requirements",
        "- These routes require a Vidicy account and an application workspace.",
        `- Sign up: ${CANONICAL_SITE_URL}/sign-up`,
        `- Sign in: ${CANONICAL_SITE_URL}/sign-in`,
      ],
    }),
  },
];

export function getPublishedAgentSkills() {
  return publishedAgentSkills;
}

export function getPublishedAgentSkillBySlug(slug: string) {
  return publishedAgentSkills.find((skill) => skill.slug === slug) ?? null;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}

export async function getPublishedAgentSkillIndexEntries(): Promise<PublishedAgentSkillIndexEntry[]> {
  const entries = await Promise.all(
    publishedAgentSkills.map(async (skill) => ({
      name: skill.slug,
      type: "skill-md" as const,
      description: skill.description,
      url: `/.well-known/agent-skills/${skill.slug}/SKILL.md`,
      digest: `sha256:${await sha256Hex(skill.content)}`,
    })),
  );

  return entries;
}
