import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  AgencyTable,
  AgencyTableCard,
  EmptyState,
  formatBytes,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { DocumentPreviewDrawer } from "@/components/visa/document-preview-drawer";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";
import { getAgencyDocuments } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Documents",
};

const DOCUMENTS_PAGE_SIZE = 75;

function parsePage(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getDocumentsHref(page: number) {
  return page > 1 ? (`/dashboard/documents?page=${page}` as Route) : ("/dashboard/documents" as Route);
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const rowsWithLookahead = await getAgencyDocuments({
    limit: DOCUMENTS_PAGE_SIZE + 1,
    offset: (page - 1) * DOCUMENTS_PAGE_SIZE,
  });
  const rows = rowsWithLookahead.slice(0, DOCUMENTS_PAGE_SIZE);
  const hasNextPage = rowsWithLookahead.length > DOCUMENTS_PAGE_SIZE;

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
          <AgencyTableCard
            title="Document inventory"
            description="Recently uploaded client files linked to agency applications."
          >
            <AgencyTable>
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
                      <p className="truncate font-bold" title={document.fileName}>
                        {document.fileName}
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
                        sectionLabel={
                          application
                            ? getDisplayCaseNumber(application.caseNumber, application.id)
                            : "Document"
                        }
                        side="right"
                        triggerVariant="button"
                        triggerLabel="View"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </AgencyTable>
            <div className="flex items-center justify-between border-t border-border/70 px-5 py-3 text-xs text-muted-foreground">
              <span>
                Page {page}
                {hasNextPage ? "" : " · End of inventory"}
              </span>
              <div className="flex items-center gap-2">
                {page === 1 ? (
                  <Button variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={getDocumentsHref(page - 1)}>Previous</Link>
                  </Button>
                )}
                {hasNextPage ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={getDocumentsHref(page + 1)}>Next</Link>
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
