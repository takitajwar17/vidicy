export function winbackEmail4Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

Quick heads-up: your 20% comeback offer ends soon.

If you still plan to apply, this is the cheapest point to get a real document review before the application moves any closer to submission.

Claim the discount: ${dashboardUrl}

Use code COMEBACK20 before it expires.

Vidicy`;
}
