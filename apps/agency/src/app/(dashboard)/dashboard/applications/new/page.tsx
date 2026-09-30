import { requireVerifiedPageSession } from "@/utils/auth-page";
import { getActiveAgencyStaffRows } from "@/server/agency-data";
import { NewApplicationClient } from "./new-application-client";

export default async function Page() {
  await requireVerifiedPageSession();
  const staff = await getActiveAgencyStaffRows();

  return (
    <NewApplicationClient
      staff={staff
        .filter((member) => member.userId && member.user)
        .map((member) => ({
          userId: member.userId!,
	          label:
	            `${member.user?.firstName ?? ""} ${member.user?.lastName ?? ""}`.trim() ||
	            member.user?.email ||
	            member.email ||
	            "Reviewer",
        }))}
    />
  );
}
