import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { PlusIcon } from "lucide-react";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  AgencyTable,
  AgencyTableCard,
  AgencyFilterCard,
  AgencyPagination,
  CaseStatusBadge,
  EmptyState,
  PriorityBadge,
  ReviewerAvatar,
  RiskBadge,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AGENCY_CASE_STATUS_OPTIONS,
  CASE_STATUS_META,
  formatAgencyVisaLabel,
  formatReviewerDisplayName,
  getDisplayCaseNumber,
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
const APPLICATIONS_PAGE_SIZE = 50;

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function parsePage(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getApplicationsHref({
  page,
  query,
  status,
}: {
  page: number;
  query: string;
  status: string;
}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/dashboard/applications${suffix ? `?${suffix}` : ""}` as Route;
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const statusFilter = normalize(params.status);
  const status = AGENCY_CASE_STATUS_OPTIONS.includes(
    statusFilter as (typeof AGENCY_CASE_STATUS_OPTIONS)[number],
  )
    ? statusFilter
    : "";
  const page = parsePage(params.page);
  const rowsWithLookahead = await getAgencyCaseRows({
    limit: APPLICATIONS_PAGE_SIZE + 1,
    offset: (page - 1) * APPLICATIONS_PAGE_SIZE,
    query,
    statuses: status ? [status] : undefined,
  });
  const rows = rowsWithLookahead.slice(0, APPLICATIONS_PAGE_SIZE);
  const hasNextPage = rowsWithLookahead.length > APPLICATIONS_PAGE_SIZE;
  const hasActiveFilters = Boolean(query || status);

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/applications", label: "Applications" },
      ]}
      title="Applications"
      description="Every client file: who owns it, which route it is on, and what still blocks it."
      actions={
        <Button asChild>
          <Link href={"/dashboard/applications/new" as Route}>
            <PlusIcon className="h-4 w-4" />
            New client file
          </Link>
        </Button>
      }
    >
      <AgencyFilterCard>
        <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_180px_180px]">
          <form className="contents">
            <Input
              name="q"
              defaultValue={query}
              placeholder="Search cases, clients, applicants..."
              className="h-11 rounded-xl bg-card"
            />
            <select
              name="status"
              defaultValue={status}
              className="h-11 rounded-xl border border-input bg-card px-3 text-sm font-medium"
            >
              <option value="">All statuses</option>
              {AGENCY_CASE_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {CASE_STATUS_META[status].label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" className="h-11">
              Apply filters
            </Button>
            <Button asChild variant="ghost" className="h-11">
              <Link href={"/dashboard/applications" as Route}>Clear</Link>
            </Button>
          </form>
        </div>
      </AgencyFilterCard>

      {rows.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching client files" : "No client files yet"}
          description={
            hasActiveFilters
              ? "Try a client name, applicant name, or case number from the queue."
              : "Add the first client file to start the agency intake queue."
          }
          href="/dashboard/applications/new"
          actionLabel="New client file"
        />
      ) : (
          <AgencyTableCard
            title="Case queue"
            description="Passports, forms, statements, letters, and client fixes by case."
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
                {rows.map((row) => (
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
            <AgencyPagination
              page={page}
              hasNextPage={hasNextPage}
              previousHref={getApplicationsHref({ page: page - 1, query, status })}
              nextHref={getApplicationsHref({ page: page + 1, query, status })}
              endLabel="End of queue"
            />
          </AgencyTableCard>
      )}
    </AgencyPageShell>
  );
}
