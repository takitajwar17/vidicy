export function onboardingEmail1Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

Welcome to Vidicy. You just took the hardest step: starting.

Now do the part that unlocks the real value. Create your visa application, choose your destination and embassy, and Vidicy will generate a checklist tailored to that exact case instead of a generic government-page summary.

It takes about 60 seconds.

Create my application: ${dashboardUrl}

Over the next few days, I will send a short set of practical emails to help you move from sign-up to a real submission-ready document pack.

Talk soon,
Vidicy`;
}
