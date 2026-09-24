export function winbackEmail2Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

Visa mistakes are expensive in ways most applicants underestimate.

The direct fee is only part of it. A rejection can mean lost time, new document costs, another wait for an appointment, and a harder story to explain on the next application. Many of those setbacks come from small inconsistencies that are fixable before submission.

That is the point of Vidicy: catch detail-level problems early, while they are still cheap to fix.

Return to my workspace: ${dashboardUrl}

If your application is still active, this is the safest moment to review it properly.

Vidicy`;
}
