import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientReport } from "@/server/client-reports";
import { requireAgencyPageSession } from "@/utils/auth-page";
import { ClientReportControls } from "@/components/agency/client-report-controls";
import {
  CLIENT_REPORT_DELIVERY_STATUS_META,
  CLIENT_REPORT_REVIEW_NOTE,
  getDisplayCaseNumber,
} from "@/lib/agency-workflow";
import { getCsrfToken } from "@/infra/csrf";
import { PageHeader } from "@/components/page-header";
import { formatShortDate } from "@/components/agency/agency-ui";
import { CsrfProvider } from "@/components/csrf-provider";

export const metadata: Metadata = {
  title: "Client report",
  robots: { index: false, follow: false },
};
export default async function ClientReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  await requireAgencyPageSession(`/dashboard/reports/${reportId}`);
  const data = await getClientReport({ reportId }).catch((error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["NOT_FOUND", "FORBIDDEN"].includes(String(error.code))
    )
      notFound();
    throw error;
  });
  const { report, application, isStale } = data;
  const recipient =
    report.deliveryRequest?.to[0] ?? report.deliveryPayload?.to ?? application.clientEmail;
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          items={[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/dashboard/reports", label: "Reports" },
            { href: `/dashboard/reports/${report.id}`, label: "Client report" },
          ]}
        />
      </div>
      <article id="client-report" className="mx-auto w-full max-w-4xl space-y-6 p-6 print:p-0">
        <style>{`@media print {
        body * { visibility: hidden; }
        #client-report, #client-report * { visibility: visible; }
        #client-report { position: absolute; left: 0; top: 0; width: 100%; max-width: none; color: #111; background: white; }
      }`}</style>
        <div className="print:hidden">
          <Link href={`/dashboard/${application.id}` as Route} className="text-primary underline">
            Back to case
          </Link>
        </div>
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Client document report</h1>
          <p>
            Case {getDisplayCaseNumber(application.caseNumber, application.id)} ·{" "}
            {application.clientName ?? "Client"}
          </p>
          <p>
            {application.destinationCountry} · {application.visaType}
          </p>
          <p className="text-sm text-muted-foreground">
            Prepared {formatShortDate(report.createdAt)} ·{" "}
            {isStale
              ? "Out of date"
              : (CLIENT_REPORT_DELIVERY_STATUS_META[
                  report.status as keyof typeof CLIENT_REPORT_DELIVERY_STATUS_META
                ]?.label ?? report.status)}
          </p>
        </header>
        {isStale ? (
          <p
            role="alert"
            className="rounded-md border border-status-warning/50 bg-status-warning/5 p-4"
          >
            This report is out of date. It is a historical copy. Prepare a new report before sending
            current corrections.
          </p>
        ) : null}
        {report.status === "sending" ? (
          <p role="status">
            {report.deliveryRequest
              ? "Delivery is pending or its outcome is unknown. Wait two minutes before retrying. The retry uses the same sender, recipient, and report. After 23 hours, check the provider before preparing another report."
              : "The original sender details were not saved for this pending report. Check the email provider before preparing another report."}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap">{report.summary}</p>
        <ol className="space-y-4">
          {report.actionItems.map((item, index) => (
            <li key={index} className="break-inside-avoid rounded-md border p-4">
              <h2 className="font-semibold">
                {index + 1}. {item.title}
              </h2>
              <p className="text-sm capitalize">{item.severity} priority</p>
              <p className="mt-2 whitespace-pre-wrap">{item.detail}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">{CLIENT_REPORT_REVIEW_NOTE}</p>
        {!recipient ? <p>Add a valid client email address before sending this report.</p> : null}
        <CsrfProvider token={await getCsrfToken()}>
          <ClientReportControls
            reportId={report.id}
            recipient={recipient}
            canEditRecipient={
              !isStale &&
              report.status === "ready" &&
              !report.deliveryKey &&
              !report.deliveryStartedAt &&
              !report.deliveryRequest &&
              !report.deliveryPayload
            }
            canSend={
              !isStale &&
              report.status !== "sent" &&
              (report.status !== "sending" || !!report.deliveryRequest)
            }
            isPendingDelivery={report.status === "sending"}
          />
        </CsrfProvider>
      </article>
    </>
  );
}
