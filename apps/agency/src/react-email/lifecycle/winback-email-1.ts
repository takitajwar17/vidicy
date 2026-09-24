export function winbackEmail1Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

You opened a Vidicy account but never finished the review flow, so I wanted to check in.

If you are still planning to apply, your workspace is still there and you can continue where you left off. Most people stop because they are busy gathering documents or they are unsure whether the review is worth doing yet.

Open my account: ${dashboardUrl}

If something specific held you back, reply and say what it was. That feedback is useful, and it often helps us point you to the next best step.

Vidicy`;
}
