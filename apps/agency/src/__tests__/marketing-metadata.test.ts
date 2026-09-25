import { describe, expect, it } from "vitest";

import { SITE_DESCRIPTION } from "@/constants";

describe("marketing metadata guardrails", () => {
  it("avoids overclaiming approval certainty in the site description", () => {
    expect(SITE_DESCRIPTION).not.toContain("100% confidence");
    expect(SITE_DESCRIPTION).not.toContain("perfect before you submit");
    expect(SITE_DESCRIPTION.toLowerCase()).not.toContain("get your visa approved");
  });
});
