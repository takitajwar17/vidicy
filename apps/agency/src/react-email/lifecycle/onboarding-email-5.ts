export function onboardingEmail5Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

The fair question is whether AI can really help with something this sensitive.

Vidicy is not trying to replace immigration strategy or legal advice. It is built to do the detail work humans are inconsistent at: reading every document, cross-checking dates and names, and spotting embassy-specific gaps before submission.

That is why people use it as a second set of eyes, not as magic.

Try it on your case: ${dashboardUrl}

Vidicy`;
}
