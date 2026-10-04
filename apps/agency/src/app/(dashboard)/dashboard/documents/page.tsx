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
  formatBytes,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { DocumentPreviewDrawer } from "@/components/visa/document-preview-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function getDocumentsHref({ page, query }: { page: number; query: string }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/dashboard/documents${suffix ? `?${suffix}` : ""}` as Route;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = parsePage(params.page);
  const rowsWithLookahead = await getAgencyDocuments({
    limit: DOCUMENTS_PAGE_SIZE + 1,
    offset: (page - 1) * DOCUMENTS_PAGE_SIZE,
    query,
  });
  const rows = rowsWithLookahead.slice(0, DOCUMENTS_PAGE_SIZE);
  const hasNextPage = rowsWithLookahead.length > DOCUMENTS_PAGE_SIZE;
  const hasActiveFilters = Boolean(query);

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/documents", label: "Documents" },
      ]}
      title="Documents"
      description="Passports, forms, bank statements, letters, bookings, and photos uploaded by case."
    >
      <AgencyFilterCard>
        <form className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_180px]">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Search files, applicants, clients..."
            className="h-11 rounded-xl bg-card"
          />
          <Button type="submit" variant="outline" className="h-11">
            Apply filters
          </Button>
          <Button asChild variant="ghost" className="h-11">
            <Link href={"/dashboard/documents" as Route}>Clear</Link>
          </Button>
        </form>
      </AgencyFilterCard>

      {rows.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching documents" : "No documents uploaded"}
          description={
            hasActiveFilters
              ? "Try a passport, bank statement, applicant, client, or case number."
              : "Open a case and upload the passport, form, bank statement, and supporting evidence."
          }
          href="/dashboard/applications"
          actionLabel="View cases"
        />
      ) : (
          <AgencyTableCard
            title="File inventory"
            description="Client files linked to agency cases."
          >
            <AgencyTable>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Document</TableHead>
                  <TableHead>Case</TableHead>
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
            <AgencyPagination
              page={page}
              hasNextPage={hasNextPage}
              previousHref={getDocumentsHref({ page: page - 1, query })}
              nextHref={getDocumentsHref({ page: page + 1, query })}
              endLabel="End of inventory"
            />
          </AgencyTableCard>
      )}
    </AgencyPageShell>
  );
}
