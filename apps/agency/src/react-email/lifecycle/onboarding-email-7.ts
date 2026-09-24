export function onboardingEmail7Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

Your application is still waiting for you inside Vidicy.

If you have been gathering documents, this is the moment to put them in one place, run the first review, and see where the real risks are. If you have been putting it off, that is exactly why the workspace exists: to turn a vague to-do list into specific next steps.

Open your workspace: ${dashboardUrl}

Vidicy`;
}
