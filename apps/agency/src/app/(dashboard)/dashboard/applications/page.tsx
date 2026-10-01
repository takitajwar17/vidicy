import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { PlusIcon } from "lucide-react";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  AgencyTable,
  AgencyTableCard,
  CaseStatusBadge,
  EmptyState,
  PriorityBadge,
  ReviewerAvatar,
  RiskBadge,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AGENCY_CASE_STATUS_OPTIONS,
  CASE_STATUS_META,
  formatAgencyVisaLabel,
  formatReviewerDisplayName,
  getDisplayCaseNumber,
  normalizeAgencyCaseStatus,
} from "@/lib/agency-workflow";
import { getAgencyCaseRows } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Applications",
};

const APPLICATIONS_TABLE_TEXT_CLASS = "text-[11px] leading-4";
const APPLICATIONS_TABLE_CELL_CLASS = "max-w-[170px] truncate whitespace-nowrap";
const APPLICATIONS_TABLE_BADGE_CLASS = "whitespace-nowrap text-[10px] leading-4";
const APPLICATIONS_TABLE_AVATAR_CLASS = "h-5 w-5 shrink-0 text-[9px]";
const APPLICATIONS_TABLE_REVIEWER_CLASS = "max-w-[150px] whitespace-nowrap";
const APPLICATIONS_TABLE_REVIEWER_LABEL_CLASS = "max-w-[116px] truncate whitespace-nowrap";

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
    const matchesStatus =
      !statusFilter || normalizeAgencyCaseStatus(row.application.agencyStatus) === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/applications", label: "Applications" },
      ]}
      title="Applications"
      description="Client cases across intake, review, follow-up, and final readiness."
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
                  {AGENCY_CASE_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {CASE_STATUS_META[status].label}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline">
                  Apply Filters
                </Button>
                <Button asChild variant="ghost">
                  <Link href={"/dashboard/applications" as Route}>Clear</Link>
                </Button>
              </form>
            </CardContent>
          </Card>

          <AgencyTableCard
            title="Application queue"
            description="Client applications across intake, review, follow-up, and readiness."
          >
            <AgencyTable className={APPLICATIONS_TABLE_TEXT_CLASS}>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Application ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Visa</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead className="pr-5 text-right">Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.application.id}>
                    <TableCell className="pl-5">
                      <Link
                        href={`/dashboard/${row.application.id}` as Route}
                        className="font-bold text-primary"
                      >
                        {getDisplayCaseNumber(row.application.caseNumber, row.application.id)}
                      </Link>
                    </TableCell>
                    <TableCell className={APPLICATIONS_TABLE_CELL_CLASS}>
                      {row.application.clientName ?? "Unassigned"}
                    </TableCell>
                    <TableCell className={APPLICATIONS_TABLE_CELL_CLASS}>
                      {row.primaryApplicant?.name ?? "Pending"}
                    </TableCell>
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
                        status={row.application.agencyStatus}
                        className={APPLICATIONS_TABLE_BADGE_CLASS}
                      />
                    </TableCell>
                    <TableCell>
                      <RiskBadge
                        riskLevel={row.latestEvaluation?.riskLevel ?? row.application.riskLevel}
                        className={APPLICATIONS_TABLE_BADGE_CLASS}
                      />
                    </TableCell>
                    <TableCell>
                      <PriorityBadge
                        priority={row.application.priority}
                        className={APPLICATIONS_TABLE_TEXT_CLASS}
                      />
                    </TableCell>
                    <TableCell>
                      <ReviewerAvatar
                        name={row.reviewer ? formatReviewerDisplayName(row.reviewer) : null}
                        email={row.reviewer?.email ?? null}
                        avatar={row.reviewer?.avatar ?? null}
                        className={`${APPLICATIONS_TABLE_TEXT_CLASS} ${APPLICATIONS_TABLE_REVIEWER_CLASS}`}
                        avatarClassName={APPLICATIONS_TABLE_AVATAR_CLASS}
                        labelClassName={`${APPLICATIONS_TABLE_TEXT_CLASS} ${APPLICATIONS_TABLE_REVIEWER_LABEL_CLASS}`}
                      />
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <span
                        className={
                          row.openIssueCount > 0
                            ? "font-bold text-destructive"
                            : "font-medium text-muted-foreground"
                        }
                      >
                        {row.openIssueCount}
                      </span>
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
