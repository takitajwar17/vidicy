import { describe, expect, it } from "vitest";

import {
  MARKETING_SEQUENCE_DEFINITIONS,
  MARKETING_TOPIC,
} from "@/server/marketing/sequence-definitions";

describe("marketing lifecycle sequence definitions", () => {
  it("defines the onboarding, post-purchase, and win-back sequences", () => {
    expect(MARKETING_SEQUENCE_DEFINITIONS.onboarding).toHaveLength(7);
    expect(MARKETING_SEQUENCE_DEFINITIONS.post_purchase).toHaveLength(6);
    expect(MARKETING_SEQUENCE_DEFINITIONS.winback).toHaveLength(5);
  });

  it("keeps the documented first and last step keys for each sequence", () => {
    expect(MARKETING_SEQUENCE_DEFINITIONS.onboarding[0]?.stepKey).toBe("welcome_first_step");
    expect(MARKETING_SEQUENCE_DEFINITIONS.onboarding.at(-1)?.stepKey).toBe("conversion_push");

    expect(MARKETING_SEQUENCE_DEFINITIONS.post_purchase[0]?.stepKey).toBe("purchase_confirmation");
    expect(MARKETING_SEQUENCE_DEFINITIONS.post_purchase.at(-1)?.stepKey).toBe("final_check_in");

    expect(MARKETING_SEQUENCE_DEFINITIONS.winback[0]?.stepKey).toBe("soft_check_in");
    expect(MARKETING_SEQUENCE_DEFINITIONS.winback.at(-1)?.stepKey).toBe("clean_break");
  });

  it("keeps each sequence step ordered with delay and topic metadata", () => {
    for (const steps of Object.values(MARKETING_SEQUENCE_DEFINITIONS)) {
      let previousDelay = -1;

      for (const step of steps) {
        expect(step.stepKey).toBeTruthy();
        expect(step.templateKey).toBeTruthy();
        expect(step.delayMs).toBeGreaterThanOrEqual(0);
        expect(step.delayMs).toBeGreaterThan(previousDelay);
        expect(Object.values(MARKETING_TOPIC)).toContain(step.topic);
        expect(["user", "application"]).toContain(step.scope);

        previousDelay = step.delayMs;
      }
    }
  });
});
