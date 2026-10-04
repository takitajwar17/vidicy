import type { Metadata } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  AgencyTable,
  AgencyTableCard,
  ReviewerAvatar,
  formatShortDate,
} from "@/components/agency/agency-ui";
import {
  AddStaffDialog,
  DisableStaffButton,
  StaffRoleSelect,
} from "@/components/agency/agency-team-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGENCY_STAFF_ROLE } from "@/db/schema";
import { cn } from "@/lib/utils";
import { getActiveAgencyStaffRows, getAgencyTeamWorkloadRows } from "@/server/agency-data";
import { requireAgencyStaff } from "@/server/agency-team";

export const metadata: Metadata = {
  title: "Team",
};

function formatRoleLabel(role?: string | null) {
  if (role === AGENCY_STAFF_ROLE.ADMIN) return "Admin";
  if (role === AGENCY_STAFF_ROLE.MEMBER) return "Member";
  return "Unassigned";
}

export default async function TeamPage() {
  const [{ staff: agencyStaff, session }, staff, workload] = await Promise.all([
    requireAgencyStaff(),
    getActiveAgencyStaffRows(),
    getAgencyTeamWorkloadRows(),
  ]);
  const isAdmin = agencyStaff.isAdmin;
  const adminCount = staff.filter((member) => member.role === AGENCY_STAFF_ROLE.ADMIN).length;
  const memberCount = staff.filter((member) => member.role === AGENCY_STAFF_ROLE.MEMBER).length;
  const totalActiveCases = workload.reduce((sum, row) => sum + row.activeCases, 0);
  const totalOpenIssues = workload.reduce((sum, row) => sum + row.openIssues, 0);

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/team", label: "Team" },
      ]}
      title="Team"
      description="Who can enter the review desk and who owns each client file."
    >
      <section>
        <Card className="overflow-hidden rounded-xl border-border/80 shadow-[var(--shadow-dashboard)]">
          <CardHeader className="flex flex-col gap-4 border-b border-border/70 bg-muted/20 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Team capacity</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Admins, reviewers, active cases, and open issues on one screen.
              </p>
            </div>
            {isAdmin ? (
              <AddStaffDialog />
            ) : (
              <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-2xs font-bold">
                Admins manage staff
              </Badge>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-2 divide-x divide-y divide-border/70 p-0 lg:grid-cols-4 lg:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold text-muted-foreground">Active staff</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{staff.length}</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-muted-foreground">Admins</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{adminCount}</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-muted-foreground">Active cases</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{totalActiveCases}</p>
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold text-muted-foreground">Open issues</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">{totalOpenIssues}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <AgencyTableCard
        title="Reviewer workload"
        description="Assigned cases, client waits, ready files, and open issues by reviewer."
        actions={
          <>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-2xs font-bold">
              {memberCount} members
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1 text-2xs font-bold">
              {totalActiveCases} active cases
            </Badge>
          </>
        }
      >
        <AgencyTable>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Reviewer</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Assigned</TableHead>
              <TableHead className="text-right">Needs client</TableHead>
              <TableHead className="text-right">Ready</TableHead>
              <TableHead className="text-right">Open issues</TableHead>
              <TableHead className="pr-5 text-right">Last activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workload.length > 0 ? (
              workload.map((row) => (
                <TableRow key={row.rowId}>
                  <TableCell className="pl-5">
                    <ReviewerAvatar
                      name={row.displayName}
                      email={row.staff?.user?.email ?? row.staff?.email}
                      avatar={row.staff?.user?.avatar ?? null}
                      labelClassName="max-w-[180px]"
                    />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-2.5 py-1 text-2xs font-bold",
                        row.staff?.role === AGENCY_STAFF_ROLE.ADMIN &&
                          "border-primary/25 bg-primary/[0.08] text-primary",
                      )}
                    >
                      {formatRoleLabel(row.staff?.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold">{row.assignedCases}</TableCell>
                  <TableCell className="text-right">{row.needsClientCases}</TableCell>
                  <TableCell className="text-right">{row.readyCases}</TableCell>
                  <TableCell className="text-right font-bold">{row.openIssues}</TableCell>
                  <TableCell className="pr-5 text-right">
                    {formatShortDate(row.lastActivityAt)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-20 pl-5 text-muted-foreground">
                  No active reviewers yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </AgencyTable>
      </AgencyTableCard>

      <AgencyTableCard
        title="Staff directory"
        description="Who can sign in, who can add staff, and who can be removed."
      >
        <AgencyTable>
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
                    <ReviewerAvatar
                      name={displayName}
                      email={member.user?.email ?? member.email}
                      avatar={member.user?.avatar ?? null}
                    />
                  </TableCell>
                  <TableCell>{member.user?.email ?? member.email ?? "—"}</TableCell>
                  <TableCell className="w-[180px]">
                    <StaffRoleSelect
                      staffMemberId={member.id}
                      role={member.role}
                      disabled={!isAdmin || isSelf}
                    />
                  </TableCell>
                  <TableCell>{formatShortDate(member.joinedAt ?? member.invitedAt)}</TableCell>
                  <TableCell className="pr-5 text-right">
                    <DisableStaffButton staffMemberId={member.id} disabled={!isAdmin || isSelf} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </AgencyTable>
      </AgencyTableCard>
    </AgencyPageShell>
  );
}
