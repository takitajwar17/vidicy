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
  formatShortDate,
} from "@/components/agency/agency-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAgencyClientsWithCounts } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Clients",
};

const CLIENTS_PAGE_SIZE = 50;

function parsePage(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getClientsHref({ page, query }: { page: number; query: string }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const suffix = params.toString();
  return `/dashboard/clients${suffix ? `?${suffix}` : ""}` as Route;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const page = parsePage(params.page);
  const rowsWithLookahead = await getAgencyClientsWithCounts({
    limit: CLIENTS_PAGE_SIZE + 1,
    offset: (page - 1) * CLIENTS_PAGE_SIZE,
    query,
  });
  const rows = rowsWithLookahead.slice(0, CLIENTS_PAGE_SIZE);
  const hasNextPage = rowsWithLookahead.length > CLIENTS_PAGE_SIZE;
  const hasActiveFilters = Boolean(query);

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/clients", label: "Clients" },
      ]}
      title="Clients"
      description="Which clients have files open, how many are moving, and when they last sent work."
      actions={
        <Button asChild>
          <Link href={"/dashboard/applications/new" as Route}>New client file</Link>
        </Button>
      }
    >
      <AgencyFilterCard>
        <form className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_180px]">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Search clients, emails, countries..."
            className="h-11 rounded-xl bg-card"
          />
          <Button type="submit" variant="outline" className="h-11">
            Apply filters
          </Button>
          <Button asChild variant="ghost" className="h-11">
            <Link href={"/dashboard/clients" as Route}>Clear</Link>
          </Button>
        </form>
      </AgencyFilterCard>

      {rows.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching clients" : "No clients yet"}
          description={
            hasActiveFilters
              ? "Try a client name, email, phone number, or country."
              : "Clients appear here after you add their first case."
          }
          href="/dashboard/applications/new"
          actionLabel="New client file"
        />
      ) : (
          <AgencyTableCard
            title="Client directory"
            description="Open files, total files, and the last day each client sent work."
          >
            <AgencyTable>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Client</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Open cases</TableHead>
                  <TableHead>Total cases</TableHead>
                  <TableHead className="pr-5">Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ client, caseCount, openCaseCount, lastCaseAt }) => (
                  <TableRow key={client.id}>
                    <TableCell className="pl-5 font-bold">{client.name}</TableCell>
                    <TableCell>{client.email ?? "—"}</TableCell>
                    <TableCell>{client.phone ?? "—"}</TableCell>
                    <TableCell>{client.country ?? "—"}</TableCell>
                    <TableCell className="font-bold">{openCaseCount}</TableCell>
                    <TableCell>{caseCount}</TableCell>
                    <TableCell className="pr-5">{formatShortDate(lastCaseAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </AgencyTable>
            <AgencyPagination
              page={page}
              hasNextPage={hasNextPage}
              previousHref={getClientsHref({ page: page - 1, query })}
              nextHref={getClientsHref({ page: page + 1, query })}
              endLabel="End of directory"
            />
          </AgencyTableCard>
      )}
    </AgencyPageShell>
  );
}
