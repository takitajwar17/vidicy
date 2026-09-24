export function onboardingEmail3Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

I built Vidicy after seeing a visa application fail for a fixable document-detail mistake that nobody caught in time.

The lesson was simple: most rejections are not dramatic. They come from small gaps, mismatches, and missing proof that are obvious only when someone checks the whole package systematically.

That is what Vidicy is for. It gives you a structured place to build the application before those mistakes become expensive.

Start your application: ${dashboardUrl}

Vidicy`;
}
