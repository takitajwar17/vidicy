import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { AlertTriangleIcon, CheckCircle2Icon, Clock3Icon, SparklesIcon } from "lucide-react";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  CaseStatusBadge,
  EmptyState,
  IssueSeverityBadge,
  MetricCard,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { ReviewIssueStatusSelect } from "@/components/agency/agency-case-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REVIEW_ISSUE_STATUS } from "@/db/schema";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyReviewIssueRows } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "AI Review",
};

export default async function ReviewQueuePage() {
  const rows = await getAgencyReviewIssueRows();
  const openRows = rows.filter(
    ({ issue }) => issue.status !== REVIEW_ISSUE_STATUS.RESOLVED,
  );
  const highRows = openRows.filter(({ issue }) => issue.severity === "high");
  const aiRows = openRows.filter(({ issue }) => issue.source === "ai");
  const clientRows = openRows.filter(({ issue }) => issue.status === REVIEW_ISSUE_STATUS.CLIENT_REQUESTED);

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/review", label: "AI Review" },
      ]}
      title="AI Review"
      description="Review AI-detected issues, reviewer notes, and client follow-up items across the agency queue."
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No review issues yet"
          description="Run AI review inside a case, then sync AI flags to build this agency-wide issue queue."
          href="/dashboard/applications"
          actionLabel="View applications"
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={AlertTriangleIcon} label="Open Issues" value={openRows.length} detail="Reviewer attention needed" tone="warning" />
            <MetricCard icon={SparklesIcon} label="AI Flags" value={aiRows.length} detail="Detected by AI review" tone="info" />
            <MetricCard icon={Clock3Icon} label="Client Requested" value={clientRows.length} detail="Waiting on client fixes" tone="default" />
            <MetricCard icon={CheckCircle2Icon} label="High Priority" value={highRows.length} detail="Resolve before final readiness" tone="danger" />
          </section>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Review issue queue</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Issue</TableHead>
                    <TableHead>Application</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Case Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="pr-5">Issue Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ issue, application, applicant }) => (
                    <TableRow key={issue.id}>
                      <TableCell className="max-w-[360px] pl-5">
                        <p className="font-bold">{issue.title}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{issue.description}</p>
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
                      <TableCell>{application ? <CaseStatusBadge status={application.agencyStatus} /> : null}</TableCell>
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
