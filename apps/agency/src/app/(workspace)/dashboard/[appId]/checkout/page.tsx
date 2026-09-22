import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getDB } from "@/db";
import { visaApplicationTable, PAYMENT_STATUS } from "@/db/schema";
import { isEvalLocked } from "@/utils/application-auth";
import { requireApplicationOwnerPage } from "@/utils/application-page-auth";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckoutClient } from "./_checkout-client";
import { FileTextIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Checkout",
};

export default async function CheckoutPage({ params }: { params: Promise<{ appId: string }> }) {
  const { appId } = await params;

  await requireApplicationOwnerPage(appId);

  const db = getDB();
  const [app] = await db
    .select({
      id: visaApplicationTable.id,
      name: visaApplicationTable.name,
      destinationCountry: visaApplicationTable.destinationCountry,
      visaType: visaApplicationTable.visaType,
      embassy: visaApplicationTable.embassy,
      paymentStatus: visaApplicationTable.paymentStatus,
      trashedAt: visaApplicationTable.trashedAt,
      isFreeTrialApp: visaApplicationTable.isFreeTrialApp,
      freeEvaluationUsed: visaApplicationTable.freeEvaluationUsed,
    })
    .from(visaApplicationTable)
    .where(eq(visaApplicationTable.id, appId));

  if (!app || app.trashedAt) notFound();

  // Already paid — send straight to workspace
  if (app.paymentStatus === PAYMENT_STATUS.PAID) {
    redirect(`/dashboard/${appId}/checklist`);
  }

  const applicationName = app.name || `${app.destinationCountry} — ${app.visaType} Visa`;

  return (
    <>
      <PageHeader
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { href: `/dashboard/${appId}/checkout`, label: "Checkout" },
        ]}
      />
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="mx-auto w-full max-w-5xl flex flex-col gap-4 py-6 md:py-10 px-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-end">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                {isEvalLocked(app) ? "Unlock Full Analysis" : "Finalize Checkout"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isEvalLocked(app)
                  ? "Your first review is complete. Upgrade once to unlock unlimited re-runs and Atlas guidance."
                  : "Secure one-time payment for complete checklist, evaluation, and assistant access."}
              </p>
            </div>

            <Card className="shadow-xs">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <FileTextIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{applicationName}</p>
                    <p className="truncate text-xs text-muted-foreground">{app.embassy}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Billing & Usage</CardTitle>
              <CardDescription>
                Configure applicant count, compare plans, and proceed to secure checkout.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <CheckoutClient applicationId={appId} applicationName={applicationName} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
