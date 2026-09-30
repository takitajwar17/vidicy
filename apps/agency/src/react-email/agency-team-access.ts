import { SITE_DOMAIN, SITE_URL } from "@/constants";

export function agencyTeamAccessText({
  addedByName,
  role,
}: {
  addedByName: string;
  role: string;
}) {
  return `Hi,

${addedByName} added you to the Vidicy agency workspace as ${role === "admin" ? "an admin" : "a reviewer"}.

You can sign in here:
${SITE_URL}/sign-in

There is no invitation to accept. Use this email address when you sign in and you will have access to the agency case queue.

Best,
${SITE_DOMAIN}`;
}
