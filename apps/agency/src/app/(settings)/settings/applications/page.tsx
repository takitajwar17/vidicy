import "server-only";

import Link from "next/link";
import { requireVerifiedPageSession } from "@/utils/auth-page";
import { getDB } from "@/db";
import { visaApplicationTable } from "@/db/schema";
import { eq, desc, isNull, and } from "drizzle-orm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApertureIcon, PlusIcon } from "lucide-react";
import type { Route } from "next";
import { RISK_BADGE_COLORS } from "@/constants";
import { getDisplayCaseNumber } from "@/lib/agency-workflow";

export default async function ApplicationsSettingsPage() {
  const session = await requireVerifiedPageSession();

  const db = getDB();
  const apps = await db
    .select({
      id: visaApplicationTable.id,
      destinationCountry: visaApplicationTable.destinationCountry,
      visaType: visaApplicationTable.visaType,
      homeCountry: visaApplicationTable.homeCountry,
      currentCountry: visaApplicationTable.currentCountry,
      embassy: visaApplicationTable.embassy,
      caseNumber: visaApplicationTable.caseNumber,
      clientName: visaApplicationTable.clientName,
      agencyStatus: visaApplicationTable.agencyStatus,
      status: visaApplicationTable.status,
      readinessScore: visaApplicationTable.readinessScore,
      riskLevel: visaApplicationTable.riskLevel,
      createdAt: visaApplicationTable.createdAt,
    })
    .from(visaApplicationTable)
    .where(
      and(
        eq(visaApplicationTable.userId, session.user.id),
        isNull(visaApplicationTable.trashedAt),
      ),
    )
    .orderBy(desc(visaApplicationTable.createdAt));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Applications</CardTitle>
            <CardDescription>Client cases created by your account</CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={"/dashboard/applications/new" as Route}>
              <PlusIcon className="h-3.5 w-3.5" />
              New
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {apps.length === 0 ? (
          <div className="flex flex-col items-center gap-5 py-16 px-4 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
              <div className="absolute inset-0 bg-primary blur-2xl rounded-full opacity-15 scale-150" />
              <ApertureIcon className="h-10 w-10 text-primary relative z-10" />
            </div>
            <div className="space-y-2 max-w-sm">
              <p className="text-lg font-semibold">No applications yet</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Create the first client case to start the agency intake and review queue.
              </p>
            </div>
            <Button
              asChild
              className="shadow-lg hover:shadow-primary/10 transition-all hover:-translate-y-0.5"
            >
              <Link href={"/dashboard/applications/new" as Route}>
                <PlusIcon className="h-4 w-4" />
                Create application
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {apps.map((app) => (
              <Link
                key={app.id}
                href={`/dashboard/${app.id}` as Route}
                className="flex items-center justify-between rounded-lg border px-3 py-3 hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {getDisplayCaseNumber(app.caseNumber, app.id)} · {app.clientName ?? "Client"} · {app.destinationCountry} {app.visaType}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {app.homeCountry} → {app.currentCountry} · {app.embassy}
                  </p>
                </div>
                <div className="ml-3 flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className="capitalize text-xs hidden sm:inline-flex"
                  >
                    {app.agencyStatus.replaceAll("_", " ")}
                  </Badge>
                  {app.readinessScore !== null &&
                  app.readinessScore !== undefined ? (
                    <Badge
                      variant="outline"
                      className={`tabular-nums text-xs font-semibold ${app.riskLevel ? (RISK_BADGE_COLORS[app.riskLevel] ?? "") : ""}`}
                    >
                      {app.readinessScore}/100
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-xs text-muted-foreground"
                    >
                      Not evaluated
                    </Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
