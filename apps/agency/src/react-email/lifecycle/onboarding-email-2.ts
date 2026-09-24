export function onboardingEmail2Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

Most applicants assume every embassy asks for the same documents. In practice, small consulate-specific differences are exactly where avoidable mistakes start.

That is why Vidicy starts with the checklist. Once you create your application, the platform can map your case to the right embassy-specific requirements and show you what to prepare first.

Generate my checklist: ${dashboardUrl}

If you have already started the application, this should only take a minute to finish.

Vidicy`;
}
