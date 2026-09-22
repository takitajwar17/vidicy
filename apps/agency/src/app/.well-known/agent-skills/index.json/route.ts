import "server-only";

import { NextResponse } from "next/server";

import { AGENT_SKILLS_SCHEMA_URL } from "@/constants";
import { getPublishedAgentSkillIndexEntries } from "@/lib/agent-skills";

export async function GET(): Promise<Response> {
  return NextResponse.json({
    $schema: AGENT_SKILLS_SCHEMA_URL,
    skills: await getPublishedAgentSkillIndexEntries(),
  }, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
