import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureAgencyTeamMembership } from "@/server/agency-team";
import { getAgencySettingsData } from "@/server/agency-membership";
import { getAgencyInvitations } from "@/server/agency-invitations";
import { requireVerifiedPageSession } from "@/utils/auth-page";
import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import AgencySettingsClient from "./agency-settings.client";

export const metadata: Metadata = { title: "Agency" };

export default async function AgencySettingsPage() {
  const session = await requireVerifiedPageSession("/dashboard/agency");
  const staff = await ensureAgencyTeamMembership(session);
  if (!staff) redirect("/agency-setup");
  const data = await getAgencySettingsData();
  const invitations = staff.isAdmin ? await getAgencyInvitations() : [];

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/agency", label: "Agency" },
      ]}
      title="Agency"
      description="Your agency details, staff invitations, and membership."
    >
      <AgencySettingsClient
        agency={data.agency}
        members={data.members}
        isAdmin={data.staff.isAdmin}
        isOwner={data.isOwner}
        userId={session.user.id}
        canDeleteAgency={data.canDeleteAgency}
        invitations={invitations}
      />
    </AgencyPageShell>
  );
}
