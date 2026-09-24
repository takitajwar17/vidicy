export function winbackEmail3Text({
  firstName,
  dashboardUrl,
  expiryDate,
}: {
  firstName: string;
  dashboardUrl: string;
  expiryDate: string;
}) {
  return `Hi ${firstName},

If price or timing held you back, here is a simple nudge: use code COMEBACK20 for 20% off your first evaluation.

That brings the entry point down while still giving you the full checklist, evaluations, and Atlas workspace.

Return to your account: ${dashboardUrl}

The offer expires on ${expiryDate}.

Vidicy`;
}
