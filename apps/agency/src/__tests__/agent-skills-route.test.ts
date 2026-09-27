import { describe, expect, it } from "vitest";

import { GET as getSkillIndex } from "@/app/.well-known/agent-skills/index.json/route";
import { GET as getSkillDocument } from "@/app/.well-known/agent-skills/[slug]/SKILL.md/route";

interface AgentSkillsIndexBody {
  $schema: unknown;
  skills: unknown;
}

describe("agent skills discovery routes", () => {
  it("returns an agent-skills discovery index with integrity digests", async () => {
    const response = await getSkillIndex();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");

    const body = (await response.json()) as AgentSkillsIndexBody;
    expect(body.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
    expect(body.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "vidicy-public-markdown",
          type: "skill-md",
          url: "/.well-known/agent-skills/vidicy-public-markdown/SKILL.md",
          digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      ]),
    );
  });

  it("returns an individual SKILL.md document", async () => {
    const response = await getSkillDocument(
      new Request("https://vidicy.com/.well-known/agent-skills/vidicy-public-markdown/SKILL.md"),
      {
        params: Promise.resolve({
          slug: "vidicy-public-markdown",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");

    const body = await response.text();
    expect(body).toContain("name: vidicy-public-markdown");
  });
});
