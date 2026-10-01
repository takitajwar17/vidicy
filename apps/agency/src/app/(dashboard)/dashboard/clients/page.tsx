import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import {
  AgencyTable,
  AgencyTableCard,
  EmptyState,
  formatShortDate,
} from "@/components/agency/agency-ui";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAgencyClientsWithCounts } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Clients",
};

export default async function ClientsPage() {
  const rows = await getAgencyClientsWithCounts();

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/clients", label: "Clients" },
      ]}
      title="Clients"
      description="Agency client directory."
      actions={
        <Button asChild>
          <Link href={"/dashboard/applications/new" as Route}>Create application</Link>
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Clients are created automatically when you add agency applications."
          href="/dashboard/applications/new"
          actionLabel="Create application"
        />
      ) : (
        <>
          <AgencyTableCard
            title="Client directory"
            description="Agency clients with current case volume and recent activity."
          >
            <AgencyTable>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Client</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Open Cases</TableHead>
                  <TableHead>Total Cases</TableHead>
                  <TableHead className="pr-5">Last Activity</TableHead>
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
          </AgencyTableCard>
        </>
      )}
    </AgencyPageShell>
  );
}
