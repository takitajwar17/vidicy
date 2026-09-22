import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { hasApplicationPermission } from "@/utils/application-auth";
import { requireApplicationPagePermission } from "@/utils/application-page-auth";

export const metadata: Metadata = {
  title: "Application settings",
};
import { APPLICATION_PERMISSIONS } from "@/db/schema";
import { getDB } from "@/db";
import { visaApplicationTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApplicationSettingsForm } from "@/components/applications/application-settings-form";
import { ApplicationOutcomeForm } from "@/components/applications/application-outcome-form";
import { Settings } from "lucide-react";
import type { Route } from "next";

export default async function ApplicationSettingsPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  await requireApplicationPagePermission(appId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);

  const db = getDB();
  const [app] = await db.select().from(visaApplicationTable).where(eq(visaApplicationTable.id, appId));
  if (!app) notFound();

  const [canEdit, canDelete] = await Promise.all([
    hasApplicationPermission(appId, APPLICATION_PERMISSIONS.EDIT_APPLICATION_SETTINGS),
    hasApplicationPermission(appId, APPLICATION_PERMISSIONS.DELETE_APPLICATION),
  ]);

  const appName = app.name || `${app.destinationCountry} — ${app.visaType} Visa`;

  return (
    <>
      <PageHeader
        items={[
          { href: `/dashboard/${appId}` as Route, label: "Application" },
          { href: `/dashboard/${appId}/settings` as Route, label: "Settings" },
        ]}
      />
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Settings className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Settings</h1>
              <p className="text-sm text-muted-foreground">{appName}</p>
            </div>
          </div>

          {/* General Info (read-only) */}
          <Card>
            <CardHeader>
              <CardTitle>Application Details</CardTitle>
              <CardDescription>Read-only details about this visa application</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Destination</p>
                  <p className="font-medium">{app.destinationCountry}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Visa Type</p>
                  <p className="font-medium">{app.visaType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Embassy</p>
                  <p className="font-medium">{app.embassy}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{app.status.replace("_", " ")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{new Date(app.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visa Outcome */}
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Visa Outcome</CardTitle>
                <CardDescription>
                  Record the actual decision once the embassy responds. This helps calibrate the AI evaluation over time.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApplicationOutcomeForm
                  applicationId={appId}
                  initialOutcome={{
                    actualOutcome: (app.actualOutcome as "approved" | "rejected" | null) ?? null,
                    outcomeDate: app.outcomeDate as unknown as Date | null ?? null,
                    outcomeNotes: app.outcomeNotes ?? null,
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Editable settings + danger zone */}
          {(canEdit || canDelete) && (
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>Update the application name</CardDescription>
              </CardHeader>
              <CardContent>
                <ApplicationSettingsForm
                  applicationId={appId}
                  initialName={app.name ?? appName}
                  canEdit={canEdit}
                  canDelete={canDelete}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
