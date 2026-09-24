import { describe, expect, it } from "vitest";

import {
  EMAIL_SIGNUP_STEP_ORDER,
  getNextEmailSignupStep,
  getPreviousEmailSignupStep,
} from "@/app/(auth)/sign-up/progressive-signup";

describe("progressive signup email flow", () => {
  it("keeps the approved three-step order", () => {
    expect(EMAIL_SIGNUP_STEP_ORDER).toEqual(["choice", "email", "details"]);
  });

  it("advances from auth choice to email to details", () => {
    expect(getNextEmailSignupStep("choice")).toBe("email");
    expect(getNextEmailSignupStep("email")).toBe("details");
    expect(getNextEmailSignupStep("details")).toBe("details");
  });

  it("allows backing up one step at a time", () => {
    expect(getPreviousEmailSignupStep("details")).toBe("email");
    expect(getPreviousEmailSignupStep("email")).toBe("choice");
    expect(getPreviousEmailSignupStep("choice")).toBe("choice");
  });
});
