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
  AgencyTable,
  AgencyTableCard,
  CaseStatusBadge,
  EmptyState,
  MetricCard,
  ReviewerAvatar,
  RiskBadge,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGENCY_CASE_STATUS } from "@/db/schema";
import { getDashboardDailyMovement } from "@/lib/agency-dashboard";
import { getAgencyDashboardData } from "@/server/agency-data";
import {
  formatAgencyVisaLabel,
  formatReviewerDisplayName,
  getDisplayCaseNumber,
} from "@/lib/agency-workflow";

export const metadata: Metadata = {
  title: "Dashboard",
};

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatReadyRateDetail({
  readyToSubmit,
  totalApplications,
}: {
  readyToSubmit: number;
  totalApplications: number;
}) {
  if (totalApplications === 0) return "No client files yet";
  return `${readyToSubmit} of ${formatCountLabel(totalApplications, "file")} ready`;
}

function formatIssuePatternDetail({
  caseCount,
  high,
}: {
  caseCount: number;
  high: number;
}) {
  const caseLabel = formatCountLabel(caseCount, "case");
  if (high === 0) return caseLabel;
  return `${caseLabel} · ${formatCountLabel(high, "high-priority issue")}`;
}

export default async function DashboardPage() {
  const data = await getAgencyDashboardData();
  const movement = getDashboardDailyMovement({ cases: data.cases });
  const readyToSubmit = data.stats.readyToSubmit ?? data.stats.completed ?? 0;
  const needsClient = data.stats.needsClient ?? data.stats.flagged ?? 0;
  const readyRate = data.stats.readyRate ?? data.stats.approvalReadyRate ?? 0;

  return (
    <AgencyPageShell
      breadcrumbs={[{ href: "/dashboard", label: "Dashboard" }]}
      title="Dashboard"
      description="Today's queue: files in review, clients waiting on fixes, and reviewers carrying the work."
      actions={
        <Button asChild>
          <Link href={"/dashboard/applications/new" as Route}>
            <PlusIcon className="h-4 w-4" />
            New client file
          </Link>
        </Button>
      }
    >
      {data.stats.totalApplications === 0 ? (
        <EmptyState
          title="No agency cases yet"
          description="Add the first client, applicant, route, and reviewer. The case will appear here before documents arrive."
          href="/dashboard/applications/new"
          actionLabel="New client file"
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={FilesIcon}
              label="Client files"
              value={data.stats.totalApplications}
              detail="Every active client case"
              tone="info"
            />
            <MetricCard
              icon={CheckCircle2Icon}
              label="Ready to submit"
              value={readyToSubmit}
              detail="Reviewer marked ready"
              tone="success"
            />
            <MetricCard
              icon={Clock3Icon}
              label="In review"
              value={data.stats.inReview}
              detail="On a reviewer's desk"
              tone="warning"
            />
            <MetricCard
              icon={FileWarningIcon}
              label="Needs client"
              value={needsClient}
              detail="Waiting on client fixes"
              tone="danger"
            />
            <MetricCard
              icon={LineChartIcon}
              label="Ready rate"
              value={`${readyRate}%`}
              detail={formatReadyRateDetail({
                readyToSubmit,
                totalApplications: data.stats.totalApplications,
              })}
              tone="default"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr_0.95fr]">
            <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">Files moving this week</CardTitle>
                <span className="text-xs font-medium text-muted-foreground">Last 7 days</span>
              </CardHeader>
              <CardContent>
                <div className="grid h-56 grid-cols-7 items-end gap-3 border-b border-border/80 pb-4">
                  {movement.map((day) => (
                    <div key={day.label} className="flex h-full flex-col justify-end gap-1.5">
                      <div
                        className="rounded-t bg-primary/80"
                        style={{
                          height: `${Math.max((day.submitted / day.max) * 100, day.submitted ? 10 : 0)}%`,
                        }}
                        title={`${day.submitted} submitted`}
                      />
                      <div
                        className="rounded-t bg-status-success/80"
                        style={{
                          height: `${Math.max((day.completed / day.max) * 76, day.completed ? 8 : 0)}%`,
                        }}
                        title={`${day.completed} completed`}
                      />
                      <div
                        className="rounded-t bg-destructive/75"
                        style={{
                          height: `${Math.max((day.flagged / day.max) * 52, day.flagged ? 6 : 0)}%`,
                        }}
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
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" /> Received
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-status-success" /> Ready to submit
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-destructive" /> Needs client
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">Most repeated issues</CardTitle>
                <Link
                  href={"/dashboard/issues" as Route}
                  className="text-xs font-bold text-primary"
                >
                  View all
                </Link>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.topFlaggedIssues.length > 0 ? (
                  data.topFlaggedIssues.map((issue) => (
                    <div
                      key={issue.label}
                      className="flex items-center justify-between gap-4 border-b border-border/70 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{issue.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatIssuePatternDetail({
                            caseCount: issue.caseCount,
                            high: issue.high,
                          })}
                        </p>
                      </div>
                      <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-bold text-destructive">
                        {issue.count}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No repeated issue patterns yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="text-base">Reviewer workload</CardTitle>
                <Link href={"/dashboard/team" as Route} className="text-xs font-bold text-primary">
                  View team
                </Link>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.workload.length > 0 ? (
                  data.workload.slice(0, 5).map((member) => (
                    <div
                      key={member.userId ?? member.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 pb-3 last:border-b-0 last:pb-0"
                    >
                      <ReviewerAvatar
                        name={member.displayName}
                        email={member.user?.email ?? member.email}
                        avatar={member.user?.avatar ?? null}
                      />
                      <div className="text-right">
                        <p className="text-sm font-bold">
                          {member.inReview === 0 ? "No active cases" : `${member.inReview} active`}
                        </p>
                        <p className="text-xs text-muted-foreground">{member.completed} ready files</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No reviewers in the team yet.</p>
                )}
              </CardContent>
            </Card>
          </section>

          <AgencyTableCard
            title="Recent client files"
            description="The latest passports, forms, and evidence moving through the desk."
            actions={
              <Link
                href={"/dashboard/applications" as Route}
                className="text-xs font-bold text-primary"
              >
                  View all client files
              </Link>
            }
          >
            <AgencyTable>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Visa</TableHead>
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
                      <Link
                        href={`/dashboard/${row.application.id}` as Route}
                        className="font-bold text-primary"
                      >
                        {getDisplayCaseNumber(row.application.caseNumber, row.application.id)}
                      </Link>
                    </TableCell>
                    <TableCell>{row.application.clientName ?? "Unassigned"}</TableCell>
                    <TableCell>{row.primaryApplicant?.name ?? "Applicant pending"}</TableCell>
                    <TableCell>
                      {formatAgencyVisaLabel({
                        destinationCountry: row.application.destinationCountry,
                        visaType: row.application.visaType,
                      })}
                    </TableCell>
                    <TableCell>
                      {formatShortDate(row.application.submittedAt ?? row.application.createdAt)}
                    </TableCell>
                    <TableCell>
                      <CaseStatusBadge
                        status={row.application.agencyStatus ?? AGENCY_CASE_STATUS.INTAKE}
                      />
                    </TableCell>
                    <TableCell>
                      <RiskBadge
                        riskLevel={row.latestEvaluation?.riskLevel ?? row.application.riskLevel}
                      />
                    </TableCell>
                    <TableCell>
                      <ReviewerAvatar
                        name={row.reviewer ? formatReviewerDisplayName(row.reviewer) : null}
                        email={row.reviewer?.email ?? null}
                        avatar={row.reviewer?.avatar ?? null}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </AgencyTable>
          </AgencyTableCard>
        </>
      )}
    </AgencyPageShell>
  );
}
