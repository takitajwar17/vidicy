import { SITE_DOMAIN, SITE_URL } from "@/constants";

export function welcomeEmailText({
  firstName,
}: {
  firstName: string;
}): string {
  const dashboardUrl = `${SITE_URL}/dashboard`;

  return `Hi ${firstName},

Welcome to Vidicy. You just took the hardest step — starting.

Here's what happens next: you create a visa application, tell us your destination and embassy, and our AI generates a document checklist built specifically for you. Not a generic government website list — a checklist that knows what your consulate actually requires.

It takes about 60 seconds.

Create your application: ${dashboardUrl}

Over the next two weeks, I'll send you a handful of emails to help you get the most out of Vidicy. You can unsubscribe anytime — but most people tell us these were genuinely useful.

Talk soon,
The ${SITE_DOMAIN} Team`;
}
