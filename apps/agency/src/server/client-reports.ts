import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import { clientReportTable, visaApplicationTable } from "@/db/schema";
import { requireAgencyStaff } from "@/server/agency-team";
import { requireCurrentAgencyReview } from "@/server/agency-review";
import { createClientReportEmailRequest, sendClientReportEmail } from "@/utils/email";

const RETRY_DELAY_MS = 2 * 60_000;
// Resend retains idempotency keys for 24 hours. Stop earlier to avoid an
// ambiguous retry creating a second message after the provider forgets its key.
const RETRY_WINDOW_MS = 23 * 60 * 60_000;

export async function getClientReport({ reportId }: { reportId: string }) {
  const { session } = await requireAgencyStaff();
  const db = getDB();
  const report = await db.query.clientReportTable.findFirst({
    where: eq(clientReportTable.id, reportId),
  });
  if (!report) throw new ZSAError("NOT_FOUND", "Report not found.");
  const application = await db.query.visaApplicationTable.findFirst({
    where: and(
      eq(visaApplicationTable.id, report.applicationId),
      isNull(visaApplicationTable.trashedAt),
      isNotNull(visaApplicationTable.clientId),
    ),
  });
  if (!application) throw new ZSAError("NOT_FOUND", "Case not found.");
  const latest = await db.query.clientReportTable.findFirst({
    where: eq(clientReportTable.applicationId, application.id),
    orderBy: [desc(clientReportTable.createdAt), desc(clientReportTable.id)],
    columns: { id: true },
  });
  const isStale =
    latest?.id !== report.id ||
    report.status === "draft" ||
    !["ready", "sent"].includes(application.clientReportStatus);
  return { report, application, isStale, session };
}

export async function deliverClientReport({ reportId }: { reportId: string }) {
  const { report, application, isStale, session } = await getClientReport({ reportId });
  if (report.status === "sent") return { alreadySent: true };
  if (isStale)
    throw new ZSAError("PRECONDITION_FAILED", "This report is out of date. Prepare a new report.");
  await requireCurrentAgencyReview({
    db: getDB(),
    applicationId: application.id,
    userId: session.userId,
  });
  const recipient =
    report.deliveryRequest?.to[0] ?? report.deliveryPayload?.to ?? application.clientEmail?.trim();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    throw new ZSAError("PRECONDITION_FAILED", "Add a valid client email address first.");
  const now = new Date();
  if (report.status === "sending") {
    if (!report.deliveryRequest)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "The original sender details were not saved. Check the email provider before preparing another report.",
      );
    const age = now.getTime() - (report.deliveryStartedAt?.getTime() ?? 0);
    const lastAttemptAge = now.getTime() - report.updatedAt.getTime();
    if (age >= RETRY_WINDOW_MS)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Delivery outcome is unknown. Check the email provider before preparing another report.",
      );
    if (lastAttemptAge < RETRY_DELAY_MS)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Delivery is in progress. Check again in two minutes.",
      );
  }
  const payload = report.deliveryPayload ?? {
    to: recipient,
    subject: `Your visa document review — ${application.caseNumber ?? application.id}`,
    text: [
      `Hello ${application.clientName ?? "Client"},`,
      "",
      "Your document review is ready.",
      "",
      report.summary,
      "",
      ...report.actionItems.flatMap((item, index) => [
        `${index + 1}. ${item.title} (${item.severity} priority)`,
        item.detail,
        "",
      ]),
      "Please send these corrections to your agency reviewer.",
      "This report supports document preparation. It does not guarantee a visa decision.",
    ].join("\n"),
  };
  const request = report.deliveryRequest ?? createClientReportEmailRequest(payload);
  const db = getDB();
  const claimed = await db.withTransaction(async () => {
    // Serialize this short claim with case updates. No provider call runs in
    // this transaction. The counter stops a changed case from being claimed.
    const currentCase = await db
      .update(visaApplicationTable)
      .set({ updatedAt: now })
      .where(
        and(
          eq(visaApplicationTable.id, application.id),
          sql`${visaApplicationTable.updateCounter} IS NOT DISTINCT FROM ${application.updateCounter}`,
          eq(visaApplicationTable.clientReportStatus, application.clientReportStatus),
        ),
      )
      .returning({ updateCounter: visaApplicationTable.updateCounter });
    if (!currentCase.length)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "The case changed. Refresh the report before sending.",
      );
    const [claim] = await db
      .update(clientReportTable)
      .set({
        status: "sending",
        deliveryKey: report.deliveryKey ?? `client-report/${randomUUID()}`,
        deliveryRequest: request,
        deliveryStartedAt: report.deliveryStartedAt ?? now,
      })
      .where(
        and(
          eq(clientReportTable.id, report.id),
          eq(clientReportTable.status, report.status),
          sql`${clientReportTable.updateCounter} IS NOT DISTINCT FROM ${report.updateCounter}`,
        ),
      )
      .returning();
    if (!claim)
      throw new ZSAError("PRECONDITION_FAILED", "Delivery is in progress. Refresh the report.");
    return { report: claim, caseCounter: currentCase[0].updateCounter };
  });
  // Keep the claim on errors: a timeout can mean the provider accepted the
  // message. A retry uses the exact stored payload and idempotency key.
  const accepted = await sendClientReportEmail({
    request: claimed.report.deliveryRequest!,
    idempotencyKey: claimed.report.deliveryKey!,
  });
  if (!accepted?.id) throw new Error("The email provider did not confirm acceptance.");
  await db.withTransaction(async () => {
    await db
      .update(clientReportTable)
      .set({ status: "sent", sentAt: new Date(), providerMessageId: accepted.id })
      .where(eq(clientReportTable.id, report.id));
    // A report sent while evidence changed remains a historical sent report;
    // the case stays draft and requires a new report.
    await db
      .update(visaApplicationTable)
      .set({ clientReportStatus: "sent" })
      .where(
        and(
          eq(visaApplicationTable.id, application.id),
          eq(visaApplicationTable.clientReportStatus, "ready"),
          sql`${visaApplicationTable.updateCounter} IS NOT DISTINCT FROM ${claimed.caseCounter}`,
        ),
      );
  });
  return { alreadySent: false };
}
