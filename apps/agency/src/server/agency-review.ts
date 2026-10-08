import "server-only";

import type { BatchItem } from "drizzle-orm/batch";
import { and, desc, eq, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  AGENCY_CASE_STATUS,
  CLIENT_REPORT_STATUS,
  CLIENT_REPORT_DELIVERY_STATUS,
  REVIEW_ISSUE_SOURCE,
  REVIEW_ISSUE_STATUS,
  VISA_APPLICATION_STATUS,
  applicantTable,
  checklistItemTable,
  clientReportTable,
  documentEvaluationTable,
  reviewIssueTable,
  uploadedDocumentTable,
  visaApplicationTable,
} from "@/db/schema";
import { isOpenReviewIssueStatus } from "@/lib/agency-workflow";

interface ReviewContext {
  db: ReturnType<typeof getDB>;
  applicationId: string;
}

// IDs provide a stable order when PostgreSQL timestamps are equal.
export const newestDocumentOrder = [desc(uploadedDocumentTable.uploadedAt), desc(uploadedDocumentTable.id)];
export const newestEvaluationOrder = [desc(documentEvaluationTable.createdAt), desc(documentEvaluationTable.id)];

export function isEvaluationCurrent({
  evaluation,
  checklistItems,
  documents,
}: {
  evaluation:
    | Pick<
        typeof documentEvaluationTable.$inferSelect,
        "applicantId" | "docSnapshots" | "itemFeedback"
      >
    | null
    | undefined;
  checklistItems: Pick<typeof checklistItemTable.$inferSelect, "id" | "applicantId">[];
  // Documents must be ordered newest first, including the stable ID tie-break above.
  documents: Pick<typeof uploadedDocumentTable.$inferSelect, "id" | "checklistItemId">[];
}) {
  if (!evaluation?.docSnapshots || !evaluation.itemFeedback) return false;
  const items = checklistItems.filter((item) => item.applicantId === evaluation.applicantId);
  if (!items.length || Object.keys(evaluation.docSnapshots).length !== items.length) return false;
  return items.every((item) => {
    const document = documents.find((candidate) => candidate.checklistItemId === item.id);
    const version = evaluation.docSnapshots?.[item.id];
    return (
      Boolean(evaluation.itemFeedback?.[item.id]) &&
      (document ? version?.split(":")[0] === document.id : version === "missing")
    );
  });
}

export function getAgencyReportInvalidationQueries({ db, applicationId }: ReviewContext) {
  return [
    db
      .update(clientReportTable)
      .set({ status: CLIENT_REPORT_DELIVERY_STATUS.DRAFT })
      .where(
        and(
          eq(clientReportTable.applicationId, applicationId),
          eq(clientReportTable.status, CLIENT_REPORT_DELIVERY_STATUS.READY),
        ),
      ),
    db
      .update(visaApplicationTable)
      .set({ clientReportStatus: CLIENT_REPORT_STATUS.DRAFT })
      .where(eq(visaApplicationTable.id, applicationId)),
  ] as const;
}

export async function invalidateAgencyReports(context: ReviewContext) {
  await context.db.batch(getAgencyReportInvalidationQueries(context));
}

export function getAgencyReviewInvalidationQueries({ db, applicationId }: ReviewContext) {
  return [
    db
      .update(visaApplicationTable)
      .set({
        status: VISA_APPLICATION_STATUS.IN_PROGRESS,
        agencyStatus: AGENCY_CASE_STATUS.IN_REVIEW,
        reviewCompletedAt: null,
        readinessScore: null,
        riskLevel: null,
        clientReportStatus: CLIENT_REPORT_STATUS.DRAFT,
      })
      .where(eq(visaApplicationTable.id, applicationId)),
    db
      .update(applicantTable)
      .set({ readinessScore: null, riskLevel: null })
      .where(eq(applicantTable.applicationId, applicationId)),
    ...getAgencyReportInvalidationQueries({ db, applicationId }),
  ] as const;
}

export async function invalidateAgencyReview(context: ReviewContext) {
  await context.db.batch(getAgencyReviewInvalidationQueries(context));
}

async function getAgencyReviewIssueChanges({
  db,
  applicationId,
  evaluation,
  userId,
}: ReviewContext & {
  evaluation: Pick<
    typeof documentEvaluationTable.$inferSelect,
    "applicantId" | "docSnapshots" | "itemFeedback" | "redFlags"
  >;
  userId: string;
}) {
  const [items, documents, existingIssues] = await Promise.all([
    db.query.checklistItemTable.findMany({
      where: eq(checklistItemTable.applicationId, applicationId),
    }),
    db.query.uploadedDocumentTable.findMany({
      where: eq(uploadedDocumentTable.applicationId, applicationId),
      orderBy: newestDocumentOrder,
    }),
    db.query.reviewIssueTable.findMany({
      where: and(
        eq(reviewIssueTable.applicationId, applicationId),
        eq(reviewIssueTable.source, REVIEW_ISSUE_SOURCE.AI),
      ),
    }),
  ]);
  if (!isEvaluationCurrent({ evaluation, checklistItems: items, documents })) {
    throw new ZSAError("PRECONDITION_FAILED", "The documents changed. Run review again.");
  }

  const findings: (typeof reviewIssueTable.$inferInsert)[] = [];
  const documentFindings = new Set<string>();
  for (const item of items.filter((item) => item.applicantId === evaluation.applicantId)) {
    const feedback = evaluation.itemFeedback?.[item.id];
    if (!feedback) continue;
    const missing = feedback.status === "missing" || feedback.hasDocument === false;
    if (missing && !item.isRequired) continue;
    if (
      !missing &&
      feedback.status !== "needs_review" &&
      !feedback.issues?.length &&
      (feedback.score ?? 100) >= 80
    )
      continue;
    for (const issue of feedback.issues ?? []) documentFindings.add(issue.trim().toLowerCase());
    findings.push({
      applicationId,
      applicantId: item.applicantId,
      checklistItemId: item.id,
      documentId: documents.find((document) => document.checklistItemId === item.id)?.id ?? null,
      title:
        `${missing ? "Missing " : ""}${item.documentName}${missing ? "" : " needs review"}`.slice(
          0,
          255,
        ),
      description: (feedback.issues?.join("\n") || feedback.feedback || item.description).slice(
        0,
        2000,
      ),
      recommendation: (
        feedback.feedback || `Ask the client for a corrected ${item.documentName}.`
      ).slice(0, 2000),
      category: missing ? "missing_document" : "document_quality",
      severity:
        missing || (feedback.score ?? 100) < 45
          ? "high"
          : (feedback.score ?? 100) < 75 || feedback.issues?.length
            ? "medium"
            : "low",
      confidence: feedback.confidence ?? null,
    });
  }
  for (const flag of new Set(evaluation.redFlags.map((flag) => flag.trim()).filter(Boolean))) {
    if (documentFindings.has(flag.toLowerCase())) continue;
    findings.push({
      applicationId,
      applicantId: evaluation.applicantId,
      checklistItemId: null,
      documentId:
        documents.find((document) =>
          items.some(
            (item) =>
              item.applicantId === evaluation.applicantId && item.id === document.checklistItemId,
          ),
        )?.id ?? null,
      title: flag.slice(0, 255),
      description: flag.slice(0, 2000),
      category: "cross_document",
      recommendation: "Check this finding against the current documents.",
      severity: "medium",
    });
  }

  const changes: BatchItem<"pg">[] = [];
  const retainedIds = new Set<string>();
  let createdCount = 0;
  for (const finding of findings) {
    const existing = existingIssues.find(
      (issue) =>
        !retainedIds.has(issue.id) &&
        issue.applicantId === evaluation.applicantId &&
        (finding.checklistItemId
          ? issue.checklistItemId === finding.checklistItemId
          : !issue.checklistItemId && issue.title === finding.title),
    );
    if (existing) {
      retainedIds.add(existing.id);
      // Preserve a reviewer decision for unchanged evidence. New evidence reopens it.
      const changed =
        (existing.documentId ?? null) !== (finding.documentId ?? null) ||
        existing.description !== finding.description ||
        // A finding cleared by AI has no reviewer resolution time. If it returns,
        // reopen it instead of treating it as a reviewer-confirmed resolution.
        (existing.status === REVIEW_ISSUE_STATUS.RESOLVED && !existing.resolvedAt);
      changes.push(
        db
          .update(reviewIssueTable)
          .set({
            ...finding,
            status: changed ? REVIEW_ISSUE_STATUS.OPEN : existing.status,
            resolvedAt: changed ? null : existing.resolvedAt,
          })
          .where(eq(reviewIssueTable.id, existing.id)),
      );
    } else {
      changes.push(
        db.insert(reviewIssueTable).values({
          ...finding,
          source: REVIEW_ISSUE_SOURCE.AI,
          status: REVIEW_ISSUE_STATUS.OPEN,
          clientVisible: true,
          assignedToId: userId,
          createdById: userId,
        }),
      );
      createdCount += 1;
    }
  }
  for (const issue of existingIssues) {
    if (
      issue.applicantId === evaluation.applicantId &&
      !retainedIds.has(issue.id) &&
      isOpenReviewIssueStatus(issue.status)
    ) {
      changes.push(
        db
          .update(reviewIssueTable)
          .set({ status: REVIEW_ISSUE_STATUS.RESOLVED, resolvedAt: null })
          .where(eq(reviewIssueTable.id, issue.id)),
      );
    }
  }
  return { changes, createdCount };
}

export async function syncAgencyReviewIssues(
  context: Parameters<typeof getAgencyReviewIssueChanges>[0],
) {
  const { changes, createdCount } = await getAgencyReviewIssueChanges(context);
  if (changes.length) await context.db.batch([changes[0], ...changes.slice(1)]);
  return { createdCount };
}

export async function publishAgencyReview({
  db,
  applicationId,
  userId,
  evaluation,
}: ReviewContext & {
  userId: string;
  evaluation: Omit<
    typeof documentEvaluationTable.$inferInsert,
    "id" | "createdAt" | "applicantId"
  > & { applicantId: string };
}) {
  const review = {
    ...evaluation,
    docSnapshots: evaluation.docSnapshots ?? null,
    itemFeedback: evaluation.itemFeedback ?? null,
  };
  const { changes } = await getAgencyReviewIssueChanges({
    db,
    applicationId,
    userId,
    evaluation: review,
  });
  // Publish the score, issue list, and report status together. A failed write must
  // never expose a completed evaluation without its tracked findings.
  const [[savedEvaluation]] = await db.batch([
    db.insert(documentEvaluationTable).values(evaluation).returning(),
    ...changes,
    db
      .update(applicantTable)
      .set({ readinessScore: evaluation.overallScore, riskLevel: evaluation.riskLevel })
      .where(
        and(
          eq(applicantTable.id, evaluation.applicantId),
          eq(applicantTable.applicationId, applicationId),
        ),
      ),
    db
      .update(visaApplicationTable)
      .set({
        readinessScore: evaluation.overallScore,
        riskLevel: evaluation.riskLevel,
        status: VISA_APPLICATION_STATUS.IN_PROGRESS,
        agencyStatus: AGENCY_CASE_STATUS.IN_REVIEW,
        reviewCompletedAt: null,
      })
      .where(eq(visaApplicationTable.id, applicationId)),
    ...getAgencyReportInvalidationQueries({ db, applicationId }),
  ]);
  const [checklistItems, documents] = await Promise.all([
    db.query.checklistItemTable.findMany({
      where: eq(checklistItemTable.applicationId, applicationId),
    }),
    db.query.uploadedDocumentTable.findMany({
      where: eq(uploadedDocumentTable.applicationId, applicationId),
      orderBy: newestDocumentOrder,
    }),
  ]);
  if (!isEvaluationCurrent({ evaluation: savedEvaluation, checklistItems, documents })) {
    await invalidateAgencyReview({ db, applicationId });
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "The documents changed during review. Run review again.",
    );
  }
  return savedEvaluation;
}

export async function requireCurrentAgencyReview({
  db,
  applicationId,
  userId,
}: ReviewContext & { userId: string }) {
  const [items, documents, evaluations] = await Promise.all([
    db.query.checklistItemTable.findMany({
      where: eq(checklistItemTable.applicationId, applicationId),
    }),
    db.query.uploadedDocumentTable.findMany({
      where: eq(uploadedDocumentTable.applicationId, applicationId),
      orderBy: newestDocumentOrder,
    }),
    db.query.documentEvaluationTable.findMany({
      where: eq(documentEvaluationTable.applicationId, applicationId),
      orderBy: newestEvaluationOrder,
    }),
  ]);
  if (!items.length)
    throw new ZSAError("PRECONDITION_FAILED", "Generate the document checklist first.");
  for (const applicantId of new Set(items.map((item) => item.applicantId))) {
    const evaluation = evaluations.find((evaluation) => evaluation.applicantId === applicantId);
    if (!isEvaluationCurrent({ evaluation, checklistItems: items, documents })) {
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Complete a review of the current documents first.",
      );
    }
    // Also covers cases reviewed before automatic issue tracking was added.
    await syncAgencyReviewIssues({ db, applicationId, evaluation: evaluation!, userId });
  }
  return { items, documents };
}

export async function requireSubmissionReady({
  db,
  applicationId,
  userId,
}: ReviewContext & { userId: string }) {
  const { items, documents } = await requireCurrentAgencyReview({ db, applicationId, userId });
  const missing = items.filter(
    (item) =>
      item.isRequired && !documents.some((document) => document.checklistItemId === item.id),
  );
  if (missing.length)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      `Upload all required documents first. ${missing.length} missing.`,
    );
  const issues = await db.query.reviewIssueTable.findMany({
    where: eq(reviewIssueTable.applicationId, applicationId),
  });
  if (issues.some((issue) => isOpenReviewIssueStatus(issue.status))) {
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "Resolve or dismiss all open issues before you mark this case ready.",
    );
  }
}

export async function markAgencyCaseReady({
  db,
  applicationId,
  userId,
}: ReviewContext & { userId: string }) {
  const application = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, applicationId),
    columns: { updateCounter: true },
  });
  if (!application) throw new ZSAError("NOT_FOUND", "Case not found.");
  await requireSubmissionReady({ db, applicationId, userId });
  // An upload or another case change must not be overwritten after these checks.
  const updated = await db
    .update(visaApplicationTable)
    .set({
      agencyStatus: AGENCY_CASE_STATUS.READY_TO_SUBMIT,
      status: VISA_APPLICATION_STATUS.READY,
      reviewCompletedAt: new Date(),
    })
    .where(
      and(
        eq(visaApplicationTable.id, applicationId),
        sql`${visaApplicationTable.updateCounter} IS NOT DISTINCT FROM ${application.updateCounter}`,
      ),
    )
    .returning({ id: visaApplicationTable.id });
  if (!updated.length)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "The case changed. Check the current documents and issues, then try again.",
    );
}
