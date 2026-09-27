import "server-only";

import { NextResponse } from "next/server";

import packageJson from "../../../../package.json";
import {
  A2A_PROTOCOL_VERSION,
  CANONICAL_SITE_URL,
  MCP_ENDPOINT_PATH,
} from "@/constants";
import { getPublishedAgentSkills } from "@/lib/agent-skills";

function getAgentCard() {
  return {
    name: "Vidicy Agent",
    description:
      "Public discovery card for Vidicy's structured markdown pages and application-readiness guidance.",
    version: packageJson.version,
    documentationUrl: CANONICAL_SITE_URL,
    provider: {
      organization: "Vidicy",
      url: CANONICAL_SITE_URL,
    },
    supportedInterfaces: [
      {
        url: `${CANONICAL_SITE_URL}${MCP_ENDPOINT_PATH}`,
        protocolBinding: "HTTP+JSON",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "text/markdown", "application/json"],
    skills: getPublishedAgentSkills().map((skill) => ({
      id: skill.slug,
      name: skill.slug,
      description: skill.description,
    })),
  };
}

export async function GET(): Promise<Response> {
  return NextResponse.json(getAgentCard(), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
