import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  AgencyTable,
  AgencyTableCard,
  AgencyFilterCard,
  AgencyPagination,
  EmptyState,
  IssueSeverityBadge,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { ReviewIssueStatusSelect } from "@/components/agency/agency-case-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyReviewIssueRows } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Issues",
};

const ISSUES_PAGE_SIZE = 75;

function parsePage(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getIssuesHref({ page, query }: { page: number; query: string }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/dashboard/issues${suffix ? `?${suffix}` : ""}` as Route;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = parsePage(params.page);
  const rowsWithLookahead = await getAgencyReviewIssueRows({
    limit: ISSUES_PAGE_SIZE + 1,
    offset: (page - 1) * ISSUES_PAGE_SIZE,
    query,
  });
  const rows = rowsWithLookahead.slice(0, ISSUES_PAGE_SIZE);
  const hasNextPage = rowsWithLookahead.length > ISSUES_PAGE_SIZE;
  const hasActiveFilters = Boolean(query);

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/issues", label: "Issues" },
      ]}
      title="Issues"
      description="Open flags, reviewer notes, and client follow-ups."
    >
      <AgencyFilterCard>
        <form className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_180px]">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Search issues, applicants, applications..."
            className="h-11 rounded-xl bg-card"
          />
          <Button type="submit" variant="outline">
            Apply Filters
          </Button>
          <Button asChild variant="ghost">
            <Link href={"/dashboard/issues" as Route}>Clear</Link>
          </Button>
        </form>
      </AgencyFilterCard>

      {rows.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching issues" : "No issues yet"}
          description={
            hasActiveFilters
              ? "Adjust the search query to widen the issue queue."
              : "Run document review inside an application, then sync review flags to build this agency-wide issue queue."
          }
          href="/dashboard/applications"
          actionLabel="View applications"
        />
      ) : (
          <AgencyTableCard
            title="Issue queue"
            description="Open flags, reviewer notes, and client follow-up items."
          >
            <AgencyTable>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Issue</TableHead>
                  <TableHead>Application</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="pr-5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ issue, application, applicant }) => (
                  <TableRow key={issue.id}>
                    <TableCell className="max-w-[360px] pl-5">
                      <p
                        className="truncate font-bold"
                        title={`${issue.title}: ${issue.description}`}
                      >
                        {issue.title}
                      </p>
                    </TableCell>
                    <TableCell>
                      {application ? (
                        <Link
                          href={`/dashboard/${application.id}` as Route}
                          className="font-bold text-primary"
                        >
                          {getDisplayCaseNumber(application.caseNumber, application.id)}
                        </Link>
                      ) : (
                        "Missing case"
                      )}
                    </TableCell>
                    <TableCell>{application?.clientName ?? "Unassigned"}</TableCell>
                    <TableCell>{applicant?.name ?? "Primary applicant"}</TableCell>
                    <TableCell>
                      <IssueSeverityBadge severity={issue.severity} />
                    </TableCell>
                    <TableCell>{formatShortDate(issue.createdAt)}</TableCell>
                    <TableCell className="pr-5">
                      <ReviewIssueStatusSelect issueId={issue.id} status={issue.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </AgencyTable>
            <AgencyPagination
              page={page}
              hasNextPage={hasNextPage}
              previousHref={getIssuesHref({ page: page - 1, query })}
              nextHref={getIssuesHref({ page: page + 1, query })}
              endLabel="End of queue"
            />
          </AgencyTableCard>
      )}
    </AgencyPageShell>
  );
}
