import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  AgencyTable,
  AgencyTableCard,
  EmptyState,
  IssueSeverityBadge,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { ReviewIssueStatusSelect } from "@/components/agency/agency-case-actions";
import { Button } from "@/components/ui/button";
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

function getIssuesHref(page: number) {
  return page > 1 ? (`/dashboard/review?page=${page}` as Route) : ("/dashboard/review" as Route);
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const rowsWithLookahead = await getAgencyReviewIssueRows({
    limit: ISSUES_PAGE_SIZE + 1,
    offset: (page - 1) * ISSUES_PAGE_SIZE,
  });
  const rows = rowsWithLookahead.slice(0, ISSUES_PAGE_SIZE);
  const hasNextPage = rowsWithLookahead.length > ISSUES_PAGE_SIZE;

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/review", label: "Issues" },
      ]}
      title="Issues"
      description="Open flags, reviewer notes, and client follow-ups."
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No issues yet"
          description="Run document review inside a case, then sync review flags to build this agency-wide issue queue."
          href="/dashboard/applications"
          actionLabel="View applications"
        />
      ) : (
        <>
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
                  <TableHead className="pr-5">Issue Status</TableHead>
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
            <div className="flex items-center justify-between border-t border-border/70 px-5 py-3 text-xs text-muted-foreground">
              <span>
                Page {page}
                {hasNextPage ? "" : " · End of queue"}
              </span>
              <div className="flex items-center gap-2">
                {page === 1 ? (
                  <Button variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={getIssuesHref(page - 1)}>Previous</Link>
                  </Button>
                )}
                {hasNextPage ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={getIssuesHref(page + 1)}>Next</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next
                  </Button>
                )}
              </div>
            </div>
          </AgencyTableCard>
        </>
      )}
    </AgencyPageShell>
  );
}
