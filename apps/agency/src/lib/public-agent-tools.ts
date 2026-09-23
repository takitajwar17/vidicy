import {
  getPhotoToolBySlug,
  toolsIndexItems,
  type ToolDefinition,
} from "@/app/tools/_content";
import { CANONICAL_SITE_URL } from "@/constants";

export interface PublicAgentToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const PUBLIC_MARKDOWN_PATHS = [
  "/",
  "/tools",
  "/tools/us-visa-photo-requirements",
  "/tools/schengen-visa-photo-requirements",
] as const;

export const PUBLIC_PHOTO_TOOL_SLUGS = toolsIndexItems.map((tool) => tool.slug) as [
  ToolDefinition["slug"],
  ...ToolDefinition["slug"][],
];

export const PUBLIC_AGENT_TOOL_DEFINITIONS: PublicAgentToolDefinition[] = [
  {
    name: "get_public_markdown",
    title: "Get public markdown",
    description:
      "Return the markdown-optimized version of a public Vidicy page for agent reading.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          enum: [...PUBLIC_MARKDOWN_PATHS],
          description: "Public route to fetch as markdown.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "get_photo_tool_profile",
    title: "Get photo tool profile",
    description:
      "Return the structured profile for one of Vidicy's public visa photo requirement tools.",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          enum: [...PUBLIC_PHOTO_TOOL_SLUGS],
          description: "Photo tool slug.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
];

export interface PublicPhotoToolProfileResult {
  slug: ToolDefinition["slug"];
  title: string;
  description: string;
  updatedAt: string;
  supportedFileTypes: string[];
  fileRequirements: string[];
  validationChecklist: string[];
  analyzeEndpoint: string;
  pageUrl: string;
}

export function isSupportedPublicMarkdownPath(path: string): path is (typeof PUBLIC_MARKDOWN_PATHS)[number] {
  return PUBLIC_MARKDOWN_PATHS.includes(path as (typeof PUBLIC_MARKDOWN_PATHS)[number]);
}

export function isSupportedPublicPhotoToolSlug(
  slug: string,
): slug is (typeof PUBLIC_PHOTO_TOOL_SLUGS)[number] {
  return PUBLIC_PHOTO_TOOL_SLUGS.includes(slug as (typeof PUBLIC_PHOTO_TOOL_SLUGS)[number]);
}

export function getPublicPhotoToolProfile(slug: string): PublicPhotoToolProfileResult | null {
  if (!isSupportedPublicPhotoToolSlug(slug)) {
    return null;
  }

  const tool = getPhotoToolBySlug(slug);
  if (!tool) {
    return null;
  }

  return {
    slug: tool.slug,
    title: tool.title,
    description: tool.description,
    updatedAt: tool.updatedAt,
    supportedFileTypes: tool.supportedFileTypes,
    fileRequirements: tool.fileRequirements,
    validationChecklist: tool.validationChecklist,
    analyzeEndpoint: new URL(
      "/api/tools/photo-requirements/analyze",
      CANONICAL_SITE_URL,
    ).toString(),
    pageUrl: new URL(`/tools/${tool.slug}`, CANONICAL_SITE_URL).toString(),
  };
}
