export function winbackEmail5Text({
  firstName,
  dashboardUrl,
}: {
  firstName: string;
  dashboardUrl: string;
}) {
  return `Hi ${firstName},

I do not want to keep sending emails if this is not useful.

If your visa application is still active, your workspace is waiting and you can pick it up anytime. If not, you can safely ignore this and the sequence will stop here.

Open my account: ${dashboardUrl}

Vidicy`;
}
