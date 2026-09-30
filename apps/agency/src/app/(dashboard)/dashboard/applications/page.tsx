import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import {
  CheckCircle2Icon,
  Clock3Icon,
  FileWarningIcon,
  FilesIcon,
  PlusIcon,
} from "lucide-react";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  CaseStatusBadge,
  EmptyState,
  MetricCard,
  PriorityBadge,
  ReviewerAvatar,
  RiskBadge,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGENCY_CASE_STATUS } from "@/db/schema";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyCaseRows } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Applications",
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const rows = await getAgencyCaseRows({ limit: 500 });
  const query = normalize(params.q);
  const statusFilter = normalize(params.status);

  const filteredRows = rows.filter((row) => {
    const searchable = normalize(
      [
        row.application.caseNumber,
        row.application.clientName,
        row.application.clientEmail,
        row.primaryApplicant?.name,
        row.application.destinationCountry,
        row.application.visaType,
      ].join(" "),
    );
    const matchesQuery = !query || searchable.includes(query);
    const matchesStatus = !statusFilter || row.application.agencyStatus === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const needsReview = rows.filter((row) =>
    [
      AGENCY_CASE_STATUS.READY_FOR_REVIEW,
      AGENCY_CASE_STATUS.AI_REVIEWED,
      AGENCY_CASE_STATUS.IN_REVIEW,
      AGENCY_CASE_STATUS.NEEDS_CLIENT,
    ].includes(row.application.agencyStatus as never),
  ).length;
  const flagged = rows.filter((row) => row.highIssueCount > 0).length;
  const completedToday = rows.filter((row) => {
    if (!row.application.reviewCompletedAt) return false;
    const today = new Date();
    return row.application.reviewCompletedAt.toDateString() === today.toDateString();
  }).length;

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/applications", label: "Applications" },
      ]}
      title="Applications"
      description="Manage and track every client application across intake, AI review, reviewer checks, client follow-up, and final readiness."
      actions={
        <Button asChild>
          <Link href={"/dashboard/applications/new" as Route}>
            <PlusIcon className="h-4 w-4" />
            New Application
          </Link>
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="Create the first client file to start the agency intake queue."
          href="/dashboard/applications/new"
          actionLabel="Create application"
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={FilesIcon} label="Total Applications" value={rows.length} detail="All active client files" tone="info" />
            <MetricCard icon={Clock3Icon} label="Needs Review" value={needsReview} detail="Requiring attention" tone="warning" />
            <MetricCard icon={FileWarningIcon} label="Flagged" value={flagged} detail="High-risk issues detected" tone="danger" />
            <MetricCard icon={CheckCircle2Icon} label="Completed Today" value={completedToday} detail="Marked ready today" tone="success" />
          </section>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[minmax(280px,1fr)_180px_180px_180px]">
              <form className="contents">
                <Input
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="Search applications, clients, applicants..."
                  className="h-11 rounded-xl bg-card"
                />
                <select
                  name="status"
                  defaultValue={params.status ?? ""}
                  className="h-11 rounded-xl border border-input bg-card px-3 text-sm font-medium"
                >
                  <option value="">All statuses</option>
                  {Object.values(AGENCY_CASE_STATUS).map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline">Apply Filters</Button>
                <Button asChild variant="ghost">
                  <Link href={"/dashboard/applications" as Route}>Clear</Link>
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Application ID</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Visa Type</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>AI Risk</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead className="pr-5 text-right">Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.application.id}>
                      <TableCell className="pl-5">
                        <Link href={`/dashboard/${row.application.id}` as Route} className="font-bold text-primary">
                          {getDisplayCaseNumber(row.application.caseNumber, row.application.id)}
                        </Link>
                      </TableCell>
                      <TableCell>{row.application.clientName ?? "Unassigned"}</TableCell>
                      <TableCell>{row.primaryApplicant?.name ?? "Pending"}</TableCell>
                      <TableCell>{row.application.visaType}</TableCell>
                      <TableCell>{row.application.destinationCountry}</TableCell>
                      <TableCell>{formatShortDate(row.application.submittedAt ?? row.application.createdAt)}</TableCell>
                      <TableCell><CaseStatusBadge status={row.application.agencyStatus} /></TableCell>
                      <TableCell><RiskBadge riskLevel={row.latestEvaluation?.riskLevel ?? row.application.riskLevel} /></TableCell>
                      <TableCell><PriorityBadge priority={row.application.priority} /></TableCell>
                      <TableCell>
                        <ReviewerAvatar
                          name={row.reviewer ? `${row.reviewer.firstName ?? ""} ${row.reviewer.lastName ?? ""}`.trim() : null}
                          email={row.reviewer?.email ?? null}
                          avatar={row.reviewer?.avatar ?? null}
                        />
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <span className={row.openIssueCount > 0 ? "font-bold text-destructive" : "font-medium text-muted-foreground"}>
                          {row.openIssueCount}
                        </span>
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
