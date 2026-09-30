import type { Metadata } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import { ReviewerAvatar, formatShortDate } from "@/components/agency/agency-ui";
import { AddStaffForm, DisableStaffButton, StaffRoleSelect } from "@/components/agency/agency-team-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveAgencyStaffRows } from "@/server/agency-data";
import { requireAgencyStaff } from "@/server/agency-team";

export const metadata: Metadata = {
  title: "Team",
};

export default async function TeamPage() {
  const [{ staff: agencyStaff, session }, staff] = await Promise.all([
    requireAgencyStaff(),
    getActiveAgencyStaffRows(),
  ]);
  const isAdmin = agencyStaff.isAdmin;

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/team", label: "Team" },
      ]}
      title="Team"
      description="Staff access and roles."
    >
      <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
        <CardHeader>
          <CardTitle className="text-base">Add staff</CardTitle>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <AddStaffForm />
          ) : (
            <p className="text-sm text-muted-foreground">Only agency admins can add or change staff access.</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
        <CardHeader>
          <CardTitle className="text-base">Staff directory</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Staff member</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="pr-5 text-right">Access</TableHead>
              </TableRow>
            </TableHeader>
	            <TableBody>
	              {staff.map((member) => {
	                const displayName =
	                  `${member.user?.firstName ?? ""} ${member.user?.lastName ?? ""}`.trim() ||
	                  member.user?.email ||
	                  member.email ||
	                  "Staff member";
	                const isSelf = member.userId === session.userId;
	                return (
	                  <TableRow key={member.id}>
	                    <TableCell className="pl-5">
	                      <ReviewerAvatar name={displayName} email={member.user?.email ?? member.email} avatar={member.user?.avatar ?? null} />
	                    </TableCell>
	                    <TableCell>{member.user?.email ?? member.email ?? "—"}</TableCell>
	                    <TableCell className="w-[180px]">
	                      <StaffRoleSelect staffMemberId={member.id} role={member.role} disabled={!isAdmin || isSelf} />
	                    </TableCell>
	                    <TableCell>{formatShortDate(member.joinedAt ?? member.invitedAt)}</TableCell>
	                    <TableCell className="pr-5 text-right">
	                      <DisableStaffButton staffMemberId={member.id} disabled={!isAdmin || isSelf} />
	                    </TableCell>
	                  </TableRow>
	                );
	              })}
	            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </AgencyPageShell>
  );
}
