import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { BriefcaseBusinessIcon, Clock3Icon, MailIcon, UsersIcon } from "lucide-react";

import { AgencyPageShell } from "@/components/agency/agency-page-shell";
import { EmptyState, MetricCard, formatShortDate } from "@/components/agency/agency-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAgencyClientsWithCounts } from "@/server/agency-data";

export const metadata: Metadata = {
  title: "Clients",
};

export default async function ClientsPage() {
  const rows = await getAgencyClientsWithCounts();
  const activeClients = rows.filter((row) => row.openCaseCount > 0).length;
  const totalCases = rows.reduce((sum, row) => sum + row.caseCount, 0);
  const openCases = rows.reduce((sum, row) => sum + row.openCaseCount, 0);

  return (
    <AgencyPageShell
      breadcrumbs={[
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/clients", label: "Clients" },
      ]}
      title="Clients"
      description="Track agency clients and the applications currently moving through review."
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
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={UsersIcon} label="Clients" value={rows.length} detail="In the agency system" tone="info" />
            <MetricCard icon={BriefcaseBusinessIcon} label="Active Clients" value={activeClients} detail="With open cases" tone="success" />
            <MetricCard icon={Clock3Icon} label="Open Cases" value={openCases} detail="Across all clients" tone="warning" />
            <MetricCard icon={MailIcon} label="Total Cases" value={totalCases} detail="Created to date" tone="default" />
          </section>

          <Card className="rounded-xl shadow-[var(--shadow-dashboard)]">
            <CardHeader>
              <CardTitle className="text-base">Client directory</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
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
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </AgencyPageShell>
  );
}
