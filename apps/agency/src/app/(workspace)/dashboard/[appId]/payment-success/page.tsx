import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getDB } from "@/db";
import { visaApplicationTable, PAYMENT_STATUS } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PaymentSuccessPoll } from "./_poll-client";
import { PageHeader } from "@/components/page-header";
import { requireApplicationOwnerPage } from "@/utils/application-page-auth";

export const metadata: Metadata = { title: "Activating workspace" };

// Revalidate every 2s so the server-side redirect fires as soon as the webhook lands
export const revalidate = 2;

export default async function PaymentSuccessPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;

  await requireApplicationOwnerPage(appId);

  const db = getDB();
  const [app] = await db
    .select({
      paymentStatus: visaApplicationTable.paymentStatus,
      trashedAt: visaApplicationTable.trashedAt,
    })
    .from(visaApplicationTable)
    .where(eq(visaApplicationTable.id, appId));

  if (!app || app.trashedAt) notFound();

  // Webhook already landed — go straight to the workspace
  if (app.paymentStatus === PAYMENT_STATUS.PAID) {
    redirect(`/dashboard/${appId}/checklist`);
  }

  // Webhook not yet processed — render the polling UI
  return (
    <>
      <PageHeader items={[{ href: `/dashboard/${appId}/checkout`, label: "Checkout" }]} />
      <div className="@container/main flex flex-1 flex-col">
        <PaymentSuccessPoll />
      </div>
    </>
  );
}
