export const EMAIL_SIGNUP_STEP_ORDER = ["choice", "email", "details"] as const;

export type EmailSignupStep = (typeof EMAIL_SIGNUP_STEP_ORDER)[number];

export function getNextEmailSignupStep(step: EmailSignupStep): EmailSignupStep {
  if (step === "choice") {
    return "email";
  }

  if (step === "email") {
    return "details";
  }

  return "details";
}

export function getPreviousEmailSignupStep(step: EmailSignupStep): EmailSignupStep {
  if (step === "details") {
    return "email";
  }

  if (step === "email") {
    return "choice";
  }

  return "choice";
}
