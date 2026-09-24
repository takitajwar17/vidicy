export function onboardingEmail4Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

Applicants regularly tell us the same thing: the issue Vidicy flagged was something they, their family, or even a consultant had skimmed past.

The common pattern is not missing an entire document. It is missing the one inconsistency that makes the whole story weaker:
- a name mismatch
- a date gap
- a financial figure that does not line up
- an embassy-specific requirement hidden in the fine print

That is why the checklist and evaluation matter together.

Open your dashboard: ${dashboardUrl}

Vidicy`;
}
