import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import { EmptyState, formatBytes, formatShortDate } from "@/components/agency/agency-ui";
import { DocumentPreviewDrawer } from "@/components/visa/document-preview-drawer";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyDocuments } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Documents",
};

export default async function DocumentsPage() {
  const rows = await getAgencyDocuments();

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/documents", label: "Documents" },
      ]}
      title="Documents"
      description="Uploaded client files."
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
          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Document</TableHead>
                    <TableHead>Application</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Applicant</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="pr-5 text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ document, application, applicant }) => (
                    <TableRow key={document.id}>
                      <TableCell className="max-w-[320px] pl-5">
                        <p className="truncate font-bold" title={document.fileName}>{document.fileName}</p>
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
                      <TableCell>{formatShortDate(document.uploadedAt)}</TableCell>
                      <TableCell className="pr-5 text-right">
                        <DocumentPreviewDrawer
                          documentId={document.id}
                          fileName={document.fileName}
                          fileSize={document.fileSize}
                          mimeType={document.mimeType}
                          uploadedAt={document.uploadedAt}
                          isActive
                          hasMultipleVersions={false}
                          sectionLabel={application ? getDisplayCaseNumber(application.caseNumber, application.id) : "Document"}
                          side="right"
                          triggerVariant="button"
                          triggerLabel="View"
                        />
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
