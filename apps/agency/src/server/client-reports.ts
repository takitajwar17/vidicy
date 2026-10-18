import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import {
  clientReportTable,
  documentEvaluationTable,
  reviewJobTable,
  visaApplicationTable,
} from "@/db/schema";
import { requireAgencyStaff } from "@/server/agency-team";
import {
  isEvaluationCurrent,
  newestEvaluationOrder,
  requireCurrentAgencyReview,
} from "@/server/agency-review";
import { buildReviewRouteContext, loadReviewSnapshot } from "@/server/review-context";
import { createClientReportEmailRequest, sendClientReportEmail } from "@/utils/email";
import { CLIENT_REPORT_REVIEW_NOTE } from "@/lib/agency-workflow";

const RETRY_DELAY_MS = 2 * 60_000;
// Resend retains idempotency keys for 24 hours. Stop earlier to avoid an
// ambiguous retry creating a second message after the provider forgets its key.
const RETRY_WINDOW_MS = 23 * 60 * 60_000;

async function loadReportReviewState({
  db,
  report,
}: {
  db: ReturnType<typeof getDB>;
  report: typeof clientReportTable.$inferSelect;
}) {
  const latest = await db.query.clientReportTable.findFirst({
    where: eq(clientReportTable.applicationId, report.applicationId),
    orderBy: [desc(clientReportTable.createdAt), desc(clientReportTable.id)],
    columns: { id: true },
  });
  const snapshot = await loadReviewSnapshot({ db, applicationId: report.applicationId });
  const reviews = await db.query.documentEvaluationTable.findMany({
    where: eq(documentEvaluationTable.applicationId, report.applicationId),
    orderBy: newestEvaluationOrder,
  });
  const pendingReview = await db.query.reviewJobTable.findFirst({
    columns: { id: true },
    where: and(
      eq(reviewJobTable.applicationId, report.applicationId),
      sql`${reviewJobTable.status} in ('queued', 'running')`,
    ),
  });
  const isStale =
    (report.reviewContextHash != null && report.reviewContextHash !== snapshot.reviewContextHash) ||
    (report.kind !== "collection" &&
      (Boolean(pendingReview) ||
        !snapshot.applicants.length ||
        snapshot.applicants.some(
          ({ id: applicantId }) =>
            !isEvaluationCurrent({
              evaluation: reviews.find((review) => review.applicantId === applicantId),
              ...snapshot,
              routeContext: buildReviewRouteContext({ ...snapshot, applicantId }),
            }),
        ))) ||
    latest?.id !== report.id ||
    report.status === "draft" ||
    !["ready", "sent"].includes(snapshot.application.clientReportStatus);
  return {
    isStale,
    isLatest: latest?.id === report.id,
    reviewContextHash: snapshot.reviewContextHash,
  };
}

export async function getClientReport({ reportId }: { reportId: string }) {
  const { session, staff } = await requireAgencyStaff();
  const db = getDB();
  const report = await db.query.clientReportTable.findFirst({
    where: eq(clientReportTable.id, reportId),
  });
  if (!report) throw new ZSAError("NOT_FOUND", "Report not found.");
  const application = await db.query.visaApplicationTable.findFirst({
    where: and(
      eq(visaApplicationTable.id, report.applicationId),
      eq(visaApplicationTable.agencyId, staff.agencyId),
      isNull(visaApplicationTable.trashedAt),
      isNotNull(visaApplicationTable.clientId),
    ),
  });
  if (!application) throw new ZSAError("NOT_FOUND", "Case not found.");
  const state = await loadReportReviewState({ db, report });
  return { report, application, session, ...state };
}

export async function updateClientReportRecipient({
  reportId,
  email,
}: {
  reportId: string;
  email: string;
}) {
  const { report, application, isStale } = await getClientReport({ reportId });
  if (isStale)
    throw new ZSAError("PRECONDITION_FAILED", "This report is out of date. Prepare a new report.");
  if (
    report.status !== "ready" ||
    report.deliveryKey ||
    report.deliveryStartedAt ||
    report.deliveryRequest ||
    report.deliveryPayload
  )
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "The delivery has started. Its recipient cannot be changed.",
    );
  const recipient = z.string().trim().email().parse(email).toLowerCase();
  const db = getDB();
  await db.withTransaction(async () => {
    // Use the same case-then-report lock order as delivery. The second guard
    // also covers a delivery claim made between the report and case reads.
    const changed = await db
      .update(visaApplicationTable)
      .set({ clientEmail: recipient })
      .where(
        and(
          eq(visaApplicationTable.id, application.id),
          sql`${visaApplicationTable.updateCounter} IS NOT DISTINCT FROM ${application.updateCounter}`,
        ),
      )
      .returning({ id: visaApplicationTable.id });
    if (!changed.length)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "The case changed. Refresh the report before saving its recipient.",
      );
    const saved = await db
      .update(clientReportTable)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(clientReportTable.id, report.id),
          eq(clientReportTable.status, "ready"),
          isNull(clientReportTable.deliveryKey),
          isNull(clientReportTable.deliveryStartedAt),
          isNull(clientReportTable.deliveryRequest),
          isNull(clientReportTable.deliveryPayload),
          sql`${clientReportTable.updateCounter} IS NOT DISTINCT FROM ${report.updateCounter}`,
        ),
      )
      .returning({ id: clientReportTable.id });
    if (!saved.length)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "The report changed or delivery has started. Refresh the report.",
      );
  });
  return { email: recipient };
}

export async function deliverClientReport({ reportId }: { reportId: string }) {
  const { report, application, isStale, session, reviewContextHash } = await getClientReport({
    reportId,
  });
  if (report.status === "sent") return { alreadySent: true };
  const isRetry = report.status === "sending";
  if (isRetry && !report.deliveryRequest)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "The original sender details were not saved. Check the email provider before preparing another report.",
    );
  if (isRetry && !report.deliveryKey)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "The original delivery key was not saved. Check the email provider before preparing another report.",
    );
  if (isStale && !isRetry)
    throw new ZSAError("PRECONDITION_FAILED", "This report is out of date. Prepare a new report.");
  if (!isRetry && report.kind !== "collection")
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
  if (isRetry) {
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
    subject: `Your ${report.kind === "collection" ? "document request" : "visa document review"} — ${application.caseNumber ?? application.id}`,
    text: [
      `Hello ${application.clientName ?? "Client"},`,
      "",
      report.kind === "collection"
        ? "Please send the documents and details listed below."
        : "Your document review is ready.",
      "",
      report.summary,
      "",
      ...report.actionItems.flatMap((item, index) => [
        `${index + 1}. ${item.title} (${item.severity} priority)`,
        item.detail,
        "",
      ]),
      CLIENT_REPORT_REVIEW_NOTE,
    ].join("\n"),
  };
  let request = report.deliveryRequest;
  if (!request) {
    const { renderClientReportPDF } = await import("@/server/client-report-pdf");
    const pdf = await renderClientReportPDF({ report, application, isStale });
    request = createClientReportEmailRequest({
      ...payload,
      attachments: [
        {
          filename: `client-report-${report.id}.pdf`,
          content: pdf.toString("base64"),
        },
      ],
    });
  }
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
    const state = await loadReportReviewState({ db, report });
    const wasCurrent = !isStale && !state.isStale && state.reviewContextHash === reviewContextHash;
    if (!isRetry && !wasCurrent)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "The case or documents changed. Prepare a new report before sending.",
      );
    if (!isRetry && report.kind !== "collection")
      await requireCurrentAgencyReview({
        db,
        applicationId: application.id,
        userId: session.userId,
        syncIssues: false,
      });
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
    return { report: claim, caseCounter: currentCase[0].updateCounter, wasCurrent };
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
      .select({ id: visaApplicationTable.id })
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.id, application.id))
      .for("update");
    const state = await loadReportReviewState({ db, report });
    const evidenceUnchanged =
      claimed.wasCurrent && !state.isStale && state.reviewContextHash === reviewContextHash;
    await db
      .update(clientReportTable)
      .set({ status: "sent", sentAt: new Date(), providerMessageId: accepted.id })
      .where(eq(clientReportTable.id, report.id));
    // A report sent while evidence changed remains a historical sent report;
    // the case stays draft and requires a new report.
    if (state.isLatest)
      await db
        .update(visaApplicationTable)
        .set({
          clientReportStatus: evidenceUnchanged ? "sent" : "draft",
          ...(evidenceUnchanged && report.actionItems.length
            ? {
                agencyStatus: "needs_client" as const,
                status: "in_progress" as const,
                reviewCompletedAt: null,
              }
            : {}),
        })
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
