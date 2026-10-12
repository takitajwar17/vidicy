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
          <h1 className="text-2xl font-bold">
            {report.kind === "collection" ? "Client document request" : "Client document report"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {report.kind === "collection"
              ? "Check the requested documents and details before delivery."
              : "Review the client corrections and prepare the report for delivery."}
          </p>
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
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{report.kind === "collection" ? "Request summary" : "Review summary"}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                {report.summary}
              </p>
            </CardContent>
          </Card>
          {!isStale ||
          (report.status === "sending" && report.deliveryRequest && report.deliveryKey) ? (
            <Card>
              <CardHeader>
                <CardTitle>Report delivery</CardTitle>
                <CardDescription>
                  {isStale
                    ? "Check the earlier delivery attempt using its saved report and recipient. This does not send updated case details."
                    : "Send the report and its PDF attachment to the client by email."}
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                      (!isStale || report.status === "sending") &&
                      report.status !== "sent" &&
                      (report.status !== "sending" || !!report.deliveryRequest)
                    }
                    isPendingDelivery={report.status === "sending"}
                  />
                </CsrfProvider>
                {report.status === "sent" ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    The email provider accepted this report.
                  </p>
                ) : null}
                {report.status === "sending" ? (
                  <p role="status" className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {report.deliveryRequest
                      ? "Delivery is pending or its outcome is unknown. Wait two minutes before retrying. The retry uses the same sender, recipient, and report. After 23 hours, check the provider before preparing another report."
                      : "The original sender details were not saved for this pending report. Check the email provider before preparing another report."}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <CardTitle>
              <h2>What you need to do</h2>
            </CardTitle>
            <Badge variant="outline" className="rounded-[4px] text-2xs font-bold">
              {report.actionItems.length} action{" "}
              {report.actionItems.length === 1 ? "item" : "items"}
            </Badge>
          </CardHeader>
          <CardContent>
            <ol className="divide-y divide-border">
              {report.actionItems.map((item, index) => (
                <li key={index} className="space-y-3 py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                      Action {String(index + 1).padStart(2, "0")}
                    </span>
                    <IssueSeverityBadge severity={item.severity} />
                  </div>
                  <h3 className="break-words text-sm font-semibold">{item.title}</h3>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                    {item.detail}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <footer className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          <p>{CLIENT_REPORT_REVIEW_NOTE}</p>
          <p className="break-all">Report reference: {report.id}</p>
        </footer>
      </article>
    </>
  );
}
