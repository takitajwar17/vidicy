import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import { CaseStatusBadge, EmptyState, formatShortDate } from "@/components/agency/agency-ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CLIENT_REPORT_DELIVERY_STATUS_META, getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyReports } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage() {
  const data = await getAgencyReports();

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/reports", label: "Reports" },
      ]}
      title="Reports"
      description="Client-ready issue summaries."
    >
      {data.reports.length === 0 && data.casesWithoutReports.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="Generate a client report inside an application after AI or reviewer issues have been added."
          href="/dashboard/applications"
          actionLabel="View applications"
        />
      ) : (
        <>
          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Client reports</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Application</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="pr-5">Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.reports.map(({ report, caseRow }) => (
                    <TableRow key={report.id}>
                      <TableCell className="pl-5">
                        {caseRow ? (
                          <Link href={`/dashboard/${caseRow.application.id}` as Route} className="font-bold text-primary">
                            {getDisplayCaseNumber(caseRow.application.caseNumber, caseRow.application.id)}
                          </Link>
                        ) : (
                          "Missing case"
                        )}
                      </TableCell>
                      <TableCell>{caseRow?.application.clientName ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-full text-2xs font-bold">
                          {CLIENT_REPORT_DELIVERY_STATUS_META[
                            report.status as keyof typeof CLIENT_REPORT_DELIVERY_STATUS_META
                          ]?.label ?? "Draft"}
                        </Badge>
                      </TableCell>
                      <TableCell>{report.actionItems.length}</TableCell>
                      <TableCell>{formatShortDate(report.createdAt)}</TableCell>
                      <TableCell className="max-w-[520px] pr-5">
                        <p className="line-clamp-2 text-sm text-muted-foreground">{report.summary}</p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.casesWithoutReports.length > 0 ? (
            <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
              <CardHeader>
                <CardTitle className="text-base">Cases without reports</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {data.casesWithoutReports.slice(0, 8).map((row) => (
                  <Link
                    key={row.application.id}
                    href={`/dashboard/${row.application.id}` as Route}
                    className="grid gap-3 rounded-xl border border-border/80 bg-card p-3 hover:bg-muted/40 md:grid-cols-[180px_1fr_auto]"
                  >
                    <span className="font-bold text-primary">
                      {getDisplayCaseNumber(row.application.caseNumber, row.application.id)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {row.application.clientName ?? "Unassigned client"} · {row.primaryApplicant?.name ?? "Applicant pending"}
                    </span>
                    <CaseStatusBadge status={row.application.agencyStatus} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </AgencyPageShell>
  );
}
