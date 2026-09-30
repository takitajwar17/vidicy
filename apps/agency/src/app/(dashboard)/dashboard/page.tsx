import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import {
  CheckCircle2Icon,
  Clock3Icon,
  FileWarningIcon,
  FilesIcon,
  LineChartIcon,
  PlusIcon,
} from "lucide-react";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  CaseStatusBadge,
  EmptyState,
  MetricCard,
  ReviewerAvatar,
  RiskBadge,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGENCY_CASE_STATUS } from "@/db/schema";
import { getAgencyDashboardData } from "@/server/agency-data";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";

export const metadata: Metadata = {
  title: "Dashboard",
};

function getDailyMovement(cases: Awaited<ReturnType<typeof getAgencyDashboardData>>["cases"]) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    date.setHours(0, 0, 0, 0);
    return date;
  });

  return days.map((date) => {
    const nextDate = new Date(date);
    nextDate.setDate(date.getDate() + 1);
    const submitted = cases.filter(
      ({ application }) => application.createdAt >= date && application.createdAt < nextDate,
    ).length;
    const completed = cases.filter(
      ({ application }) =>
        application.reviewCompletedAt &&
        application.reviewCompletedAt >= date &&
        application.reviewCompletedAt < nextDate,
    ).length;
    const flagged = cases.filter(
      ({ application, highIssueCount }) =>
        highIssueCount > 0 &&
        application.createdAt >= date &&
        application.createdAt < nextDate,
    ).length;

    return {
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
      submitted,
      completed,
      flagged,
      max: Math.max(submitted, completed, flagged, 1),
    };
  });
}

export default async function DashboardPage() {
  const data = await getAgencyDashboardData();
  const movement = getDailyMovement(data.cases);

  return (
    <AgencyPageShell
      breadcrumbs={[{ href: "/dashboard", label: "Dashboard" }]}
      title="Dashboard"
      description="Agency review pipeline at a glance."
      actions={
        <Button asChild>
          <Link href={"/dashboard/applications/new" as Route}>
            <PlusIcon className="h-4 w-4" />
            New Application
          </Link>
        </Button>
      }
    >
      {data.stats.totalApplications === 0 ? (
        <EmptyState
          title="No agency cases yet"
          description="Create the first client application to initialize the agency review workflow."
          href="/dashboard/applications/new"
          actionLabel="Create application"
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={FilesIcon}
              label="Total Applications"
              value={data.stats.totalApplications}
              detail="Across all clients"
              tone="info"
            />
            <MetricCard
              icon={CheckCircle2Icon}
              label="Ready to submit"
              value={data.stats.completed}
              detail="Review-complete cases"
              tone="success"
            />
            <MetricCard
              icon={Clock3Icon}
              label="In Review"
              value={data.stats.inReview}
              detail="Currently moving through review"
              tone="warning"
            />
            <MetricCard
              icon={FileWarningIcon}
              label="Flagged"
              value={data.stats.flagged}
              detail="Needs reviewer or client action"
              tone="danger"
            />
            <MetricCard
              icon={LineChartIcon}
              label="Ready Rate"
              value={`${data.stats.approvalReadyRate}%`}
              detail={`${data.stats.scoredCases} reviewed cases`}
              tone="default"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr_0.95fr]">
            <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">Application Throughput</CardTitle>
                <span className="text-xs font-medium text-muted-foreground">Last 7 days</span>
              </CardHeader>
              <CardContent>
                <div className="grid h-56 grid-cols-7 items-end gap-3 border-b border-border/80 pb-4">
                  {movement.map((day) => (
                    <div key={day.label} className="flex h-full flex-col justify-end gap-1.5">
                      <div
                        className="rounded-t bg-primary/80"
                        style={{ height: `${Math.max((day.submitted / day.max) * 100, day.submitted ? 10 : 0)}%` }}
                        title={`${day.submitted} submitted`}
                      />
                      <div
                        className="rounded-t bg-status-success/80"
                        style={{ height: `${Math.max((day.completed / day.max) * 76, day.completed ? 8 : 0)}%` }}
                        title={`${day.completed} completed`}
                      />
                      <div
                        className="rounded-t bg-destructive/75"
                        style={{ height: `${Math.max((day.flagged / day.max) * 52, day.flagged ? 6 : 0)}%` }}
                        title={`${day.flagged} flagged`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-7 gap-3 text-center text-2xs font-semibold text-muted-foreground">
                  {movement.map((day) => (
                    <span key={day.label}>{day.label}</span>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" /> Submitted</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-status-success" /> Completed</span>
                  <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-destructive" /> Flagged</span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">Top Flagged Issues</CardTitle>
                <Link href={"/dashboard/review" as Route} className="text-xs font-bold text-primary">
                  View all
                </Link>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.topFlaggedIssues.length > 0 ? (
                  data.topFlaggedIssues.map((issue) => (
                    <div key={issue.label} className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{issue.label}</p>
                        <p className="text-xs text-muted-foreground">{issue.high} high priority</p>
                      </div>
                      <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">
                        {issue.count}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No active issue clusters yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">Reviewer Workload</CardTitle>
                <Link href={"/dashboard/team" as Route} className="text-xs font-bold text-primary">
                  View team
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.workload.length > 0 ? (
                  data.workload.slice(0, 5).map((member) => (
                    <div key={member.userId ?? member.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 pb-3 last:border-b-0 last:pb-0">
                      <ReviewerAvatar name={member.displayName} email={member.user?.email ?? member.email} avatar={member.user?.avatar ?? null} />
                      <div className="text-right">
                        <p className="text-sm font-bold">
                          {member.inReview === 0 ? "No active cases" : `${member.inReview} active`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.completed} ready
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No reviewers have been added yet.</p>
                )}
              </CardContent>
            </Card>
          </section>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">Recent Applications</CardTitle>
              <Link href={"/dashboard/applications" as Route} className="text-xs font-bold text-primary">
                View all applications
              </Link>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader className="[&_th]:text-xs">
                  <TableRow>
                    <TableHead>Application</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Visa Type</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Reviewer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentCases.map((row) => (
                    <TableRow key={row.application.id}>
                      <TableCell>
                        <Link href={`/dashboard/${row.application.id}` as Route} className="font-bold text-primary">
                          {getDisplayCaseNumber(row.application.caseNumber, row.application.id)}
                        </Link>
                      </TableCell>
                      <TableCell>{row.application.clientName ?? "Unassigned"}</TableCell>
                      <TableCell>{row.primaryApplicant?.name ?? "Applicant pending"}</TableCell>
                      <TableCell>{row.application.destinationCountry} {row.application.visaType}</TableCell>
                      <TableCell>{formatShortDate(row.application.submittedAt ?? row.application.createdAt)}</TableCell>
                      <TableCell><CaseStatusBadge status={row.application.agencyStatus ?? AGENCY_CASE_STATUS.INTAKE} /></TableCell>
                      <TableCell><RiskBadge riskLevel={row.latestEvaluation?.riskLevel ?? row.application.riskLevel} /></TableCell>
                      <TableCell>
                        <ReviewerAvatar
                          name={row.reviewer ? `${row.reviewer.firstName ?? ""} ${row.reviewer.lastName ?? ""}`.trim() : null}
                          email={row.reviewer?.email ?? null}
                          avatar={row.reviewer?.avatar ?? null}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </AgencyPageShell>
  );
}
