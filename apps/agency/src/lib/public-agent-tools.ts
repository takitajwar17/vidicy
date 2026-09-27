export interface PublicAgentToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const PUBLIC_MARKDOWN_PATHS = ["/"] as const;

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
];

export function isSupportedPublicMarkdownPath(
  path: string,
): path is (typeof PUBLIC_MARKDOWN_PATHS)[number] {
  return PUBLIC_MARKDOWN_PATHS.includes(path as (typeof PUBLIC_MARKDOWN_PATHS)[number]);
}
