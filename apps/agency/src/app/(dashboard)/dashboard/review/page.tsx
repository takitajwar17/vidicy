import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  EmptyState,
  IssueSeverityBadge,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { ReviewIssueStatusSelect } from "@/components/agency/agency-case-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyReviewIssueRows } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Issues",
};

export default async function IssuesPage() {
  const rows = await getAgencyReviewIssueRows();

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
          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardContent className="overflow-x-auto p-0">
              <Table>
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
                        <p className="truncate font-bold" title={`${issue.title}: ${issue.description}`}>
                          {issue.title}
                        </p>
                      </TableCell>
                      <TableCell>
                        {application ? (
                          <Link href={`/dashboard/${application.id}` as Route} className="font-bold text-primary">
                            {getDisplayCaseNumber(application.caseNumber, application.id)}
                          </Link>
                        ) : (
                          "Missing case"
                        )}
                      </TableCell>
                      <TableCell>{application?.clientName ?? "Unassigned"}</TableCell>
                      <TableCell>{applicant?.name ?? "Primary applicant"}</TableCell>
                      <TableCell><IssueSeverityBadge severity={issue.severity} /></TableCell>
                      <TableCell>{formatShortDate(issue.createdAt)}</TableCell>
                      <TableCell className="pr-5"><ReviewIssueStatusSelect issueId={issue.id} status={issue.status} /></TableCell>
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
