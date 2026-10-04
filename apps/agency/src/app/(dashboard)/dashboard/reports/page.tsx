import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  AgencyTable,
  AgencyTableCard,
  AgencyFilterCard,
  AgencyPagination,
  CaseStatusBadge,
  EmptyState,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CLIENT_REPORT_DELIVERY_STATUS_META, getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyReports } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Reports",
};

const REPORTS_PAGE_SIZE = 50;

function parsePage(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getReportsHref({ page, query }: { page: number; query: string }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/dashboard/reports${suffix ? `?${suffix}` : ""}` as Route;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = parsePage(params.page);
  const data = await getAgencyReports({
    limit: REPORTS_PAGE_SIZE + 1,
    offset: (page - 1) * REPORTS_PAGE_SIZE,
    query,
  });
  const reports = data.reports.slice(0, REPORTS_PAGE_SIZE);
  const hasNextPage = data.reports.length > REPORTS_PAGE_SIZE;
  const hasActiveFilters = Boolean(query);

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/reports", label: "Reports" },
      ]}
      title="Reports"
      description="Client issue lists: what to upload, fix, replace, or clarify."
    >
      <AgencyFilterCard>
        <form className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_180px]">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Search reports, clients, applicants..."
            className="h-11 rounded-xl bg-card"
          />
          <Button type="submit" variant="outline" className="h-11">
            Apply filters
          </Button>
          <Button asChild variant="ghost" className="h-11">
            <Link href={"/dashboard/reports" as Route}>Clear</Link>
          </Button>
        </form>
      </AgencyFilterCard>

      {reports.length === 0 && data.casesWithoutReports.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching reports" : "No reports yet"}
          description={
            hasActiveFilters
              ? "Try a client, applicant, case number, or report summary."
              : "Generate a report after a case has missing documents, reviewer notes, or client fixes."
          }
          href="/dashboard/applications"
          actionLabel="View cases"
        />
      ) : (
        <>
          <AgencyTableCard
            title="Client reports"
            description="Fix lists ready to send back to clients."
          >
            <AgencyTable>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Case</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="pr-5">Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map(({ report, caseRow }) => (
                  <TableRow key={report.id}>
                    <TableCell className="pl-5">
                      {caseRow ? (
                        <Link
                          href={`/dashboard/${caseRow.application.id}` as Route}
                          className="font-bold text-primary"
                        >
                          {getDisplayCaseNumber(
                            caseRow.application.caseNumber,
                            caseRow.application.id,
                          )}
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
                        <p className="truncate text-xs text-muted-foreground" title={report.summary}>
                          {report.summary}
                        </p>
                      </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </AgencyTable>
            <AgencyPagination
              page={page}
              hasNextPage={hasNextPage}
              previousHref={getReportsHref({ page: page - 1, query })}
              nextHref={getReportsHref({ page: page + 1, query })}
              endLabel="End of reports"
            />
          </AgencyTableCard>

          {data.casesWithoutReports.length > 0 ? (
            <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
              <CardHeader>
                <CardTitle className="text-base">Cases still missing a client list</CardTitle>
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
                      {row.application.clientName ?? "Unassigned client"} ·{" "}
                      {row.primaryApplicant?.name ?? "Applicant pending"}
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
