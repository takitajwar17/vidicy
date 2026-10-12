import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureAgencyTeamMembership } from "@/server/agency-team";
import { getAgencySettingsData } from "@/server/agency-membership";
import { getAgencyInvitations } from "@/server/agency-invitations";
import { requireVerifiedPageSession } from "@/utils/auth-page";
import AgencySettingsClient from "./agency-settings.client";

export const metadata: Metadata = { title: "Agency settings" };

export default async function AgencySettingsPage() {
  const session = await requireVerifiedPageSession("/settings/agency");
  const staff = await ensureAgencyTeamMembership(session);
  if (!staff) redirect("/agency-setup");
  const data = await getAgencySettingsData();
  const invitations = staff.isAdmin ? await getAgencyInvitations() : [];

  return (
    <AgencySettingsClient
      agency={data.agency}
      members={data.members}
      isAdmin={data.staff.isAdmin}
      isOwner={data.isOwner}
      userId={session.user.id}
      canDeleteAgency={data.canDeleteAgency}
      invitations={invitations}
    />
  );
}
