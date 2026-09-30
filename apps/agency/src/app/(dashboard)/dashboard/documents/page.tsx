import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { DatabaseIcon, FileCheck2Icon, FilesIcon, SearchCheckIcon } from "lucide-react";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import { EmptyState, MetricCard, formatBytes, formatShortDate } from "@/components/agency/agency-ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DOCUMENT_EXTRACTION_STATUS, DOCUMENT_INDEXING_STATUS } from "@/db/schema";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyDocuments } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Documents",
};

export default async function DocumentsPage() {
  const rows = await getAgencyDocuments();
  const totalStorage = rows.reduce((sum, row) => sum + row.document.fileSize, 0);
  const extracted = rows.filter(
    (row) =>
      row.document.extractionStatus === DOCUMENT_EXTRACTION_STATUS.COMPLETED ||
      row.document.extractionStatus === DOCUMENT_EXTRACTION_STATUS.PARTIAL,
  ).length;
  const indexed = rows.filter((row) => row.document.indexingStatus === DOCUMENT_INDEXING_STATUS.COMPLETED).length;

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/documents", label: "Documents" },
      ]}
      title="Documents"
      description="Inspect recently uploaded client files, extraction status, indexing state, and linked applications."
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No documents uploaded"
          description="Generate a checklist inside an application and upload files against the required client documents."
          href="/dashboard/applications"
          actionLabel="View applications"
        />
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={FilesIcon} label="Documents" value={rows.length} detail="Recently uploaded" tone="info" />
            <MetricCard icon={DatabaseIcon} label="Storage Used" value={formatBytes(totalStorage)} detail="Across visible files" tone="default" />
            <MetricCard icon={FileCheck2Icon} label="Extracted" value={extracted} detail="Readable by AI review" tone="success" />
            <MetricCard icon={SearchCheckIcon} label="Indexed" value={indexed} detail="Available to document search" tone="warning" />
          </section>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Document inventory</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Document</TableHead>
                    <TableHead>Application</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Extraction</TableHead>
                    <TableHead>Indexing</TableHead>
                    <TableHead className="pr-5">Uploaded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ document, application, applicant }) => (
                    <TableRow key={document.id}>
                      <TableCell className="max-w-[320px] pl-5">
                        <p className="truncate font-bold">{document.fileName}</p>
                        <p className="text-xs text-muted-foreground">{document.mimeType}</p>
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
                      <TableCell>{application?.clientName ?? "—"}</TableCell>
                      <TableCell>{applicant?.name ?? "—"}</TableCell>
                      <TableCell>{formatBytes(document.fileSize)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-full text-2xs font-bold capitalize">
                          {document.extractionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-full text-2xs font-bold capitalize">
                          {document.indexingStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-5">{formatShortDate(document.uploadedAt)}</TableCell>
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
