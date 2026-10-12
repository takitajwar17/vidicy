import "server-only";

import type { BatchItem } from "drizzle-orm/batch";
import { and, desc, eq, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  getChecklistRequirement,
  getReviewAvailability,
  isDocumentUsable,
  type ReviewDocumentInput,
} from "@/lib/checklist-state";
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
  reviewJobTable,
  visaApplicationTable,
} from "@/db/schema";
import { isOpenReviewIssueStatus } from "@/lib/agency-workflow";
import { reviewFindingSchema, reviewFindingTitleSchema } from "@/lib/review-findings";
import {
  canMarkCaseReady,
  isRouteAssessmentCurrent,
  type ReviewRouteContext,
} from "@/lib/review-rubric";
import { buildReviewRouteContext, loadReviewSnapshot } from "@/server/review-context";

interface ReviewContext {
  db: ReturnType<typeof getDB>;
  applicationId: string;
}

// Upload sequence resolves document timestamp ties. Evaluation IDs give a stable fallback.
export const newestDocumentOrder = [
  desc(uploadedDocumentTable.uploadedAt),
  desc(uploadedDocumentTable.uploadSequence),
  desc(uploadedDocumentTable.id),
];
export const newestEvaluationOrder = [
  desc(documentEvaluationTable.createdAt),
  desc(documentEvaluationTable.id),
];

export function isEvaluationCurrent({
  evaluation,
  checklistItems,
  documents,
  reviewContextHash,
  routeContext,
}: {
  evaluation:
    | Pick<
        typeof documentEvaluationTable.$inferSelect,
        | "applicantId"
        | "docSnapshots"
        | "itemFeedback"
        | "reviewStatus"
        | "routeAssessment"
        | "reviewContextHash"
      >
    | null
    | undefined;
  checklistItems: (Pick<typeof checklistItemTable.$inferSelect, "id" | "applicantId"> &
    Partial<Pick<typeof checklistItemTable.$inferSelect, "applicability">>)[];
  // Documents must be ordered newest first, including the upload sequence above.
  documents: ReviewDocumentInput[];
  reviewContextHash?: string;
  routeContext?: ReviewRouteContext;
}) {
  if (
    evaluation?.reviewStatus !== "complete" ||
    !evaluation.docSnapshots ||
    typeof evaluation.docSnapshots !== "object" ||
    Array.isArray(evaluation.docSnapshots) ||
    !evaluation.itemFeedback ||
    typeof evaluation.itemFeedback !== "object" ||
    Array.isArray(evaluation.itemFeedback) ||
    !reviewContextHash ||
    evaluation.reviewContextHash !== reviewContextHash ||
    !evaluation.routeAssessment ||
    !routeContext ||
    !isRouteAssessmentCurrent({
      assessment: evaluation.routeAssessment,
      context: routeContext,
      asOfDate: new Date().toISOString().slice(0, 10),
    })
  )
    return false;
  const items = checklistItems.filter(
    (item) =>
      item.applicability !== "does_not_apply" &&
      (item.applicantId === evaluation.applicantId || item.applicantId === null),
  );
  if (!items.length) return false;
  if (Object.keys(evaluation.docSnapshots).length !== items.length) return false;
  return items.every((item) => {
    const document = documents.find((candidate) => candidate.checklistItemId === item.id);
    const version = evaluation.docSnapshots?.[item.id];
    return (
      typeof evaluation.itemFeedback?.[item.id] === "object" &&
      evaluation.itemFeedback[item.id] !== null &&
      !Array.isArray(evaluation.itemFeedback[item.id]) &&
      typeof version === "string" &&
      (document ? version.split(":")[0] === document.id : version === "missing")
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
    | "applicantId"
    | "docSnapshots"
    | "itemFeedback"
    | "redFlags"
    | "reviewStatus"
    | "routeAssessment"
    | "reviewContextHash"
  >;
  userId: string;
}) {
  const [snapshot, existingIssues] = await Promise.all([
    loadReviewSnapshot({ db, applicationId }),
    db.query.reviewIssueTable.findMany({
      where: and(
        eq(reviewIssueTable.applicationId, applicationId),
        eq(reviewIssueTable.source, REVIEW_ISSUE_SOURCE.AI),
      ),
    }),
  ]);
  const { checklistItems: items, documents, reviewContextHash } = snapshot;
  const routeContext = evaluation.applicantId
    ? buildReviewRouteContext({ ...snapshot, applicantId: evaluation.applicantId })
    : undefined;
  if (
    !isEvaluationCurrent({
      evaluation,
      checklistItems: items,
      documents,
      reviewContextHash,
      routeContext,
    })
  ) {
    throw new ZSAError("PRECONDITION_FAILED", "The documents changed. Run review again.");
  }

  const findings: (typeof reviewIssueTable.$inferInsert)[] = [];
  const documentFindings = new Set<string>();
  for (const item of items.filter(
    (item) =>
      item.applicability !== "does_not_apply" &&
      (item.applicantId === evaluation.applicantId || item.applicantId === null),
  )) {
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
      title: feedback.title
        ? reviewFindingTitleSchema.parse(feedback.title)
        : `${missing ? "Missing " : ""}${item.documentName}${missing ? "" : " needs review"}`.slice(
            0,
            255,
          ),
      description: feedback.title
        ? [
            feedback.feedback,
            ...(feedback.issues ?? []).filter((issue) => !feedback.feedback?.includes(issue)),
          ]
            .filter(Boolean)
            .join("\n") || item.description
        : (feedback.issues?.join("\n") || feedback.feedback || item.description).slice(0, 2000),
      recommendation: (
        feedback.recommendation ||
        feedback.feedback ||
        `Ask the client for a corrected ${item.documentName}.`
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
  const seenFlags = new Set<string>();
  for (const savedFlag of evaluation.redFlags) {
    const flag =
      typeof savedFlag === "string" ? savedFlag.trim() : reviewFindingSchema.parse(savedFlag);
    const details = typeof flag === "string" ? flag : flag.details;
    if (!details || documentFindings.has(details.toLowerCase()) || seenFlags.has(details)) continue;
    seenFlags.add(details);
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
      title: typeof flag === "string" ? flag.slice(0, 255) : flag.title,
      description: details,
      category: "cross_document",
      recommendation:
        typeof flag === "string"
          ? "Check this finding against the current documents."
          : flag.recommendation,
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
        issue.applicantId === finding.applicantId &&
        (finding.checklistItemId
          ? issue.checklistItemId === finding.checklistItemId
          : !issue.checklistItemId && issue.description === finding.description),
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
          .where(
            and(
              eq(reviewIssueTable.id, existing.id),
              // Keep decisions made after this synchronization read the issue.
              sql`${reviewIssueTable.updateCounter} IS NOT DISTINCT FROM ${existing.updateCounter}`,
              eq(reviewIssueTable.status, existing.status),
              sql`${reviewIssueTable.resolvedAt} IS NOT DISTINCT FROM ${existing.resolvedAt}`,
            ),
          ),
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
      (issue.applicantId === evaluation.applicantId || issue.applicantId === null) &&
      !retainedIds.has(issue.id) &&
      isOpenReviewIssueStatus(issue.status)
    ) {
      changes.push(
        db
          .update(reviewIssueTable)
          .set({ status: REVIEW_ISSUE_STATUS.RESOLVED, resolvedAt: null })
          .where(
            and(
              eq(reviewIssueTable.id, issue.id),
              sql`${reviewIssueTable.updateCounter} IS NOT DISTINCT FROM ${issue.updateCounter}`,
              eq(reviewIssueTable.status, issue.status),
              sql`${reviewIssueTable.resolvedAt} IS NOT DISTINCT FROM ${issue.resolvedAt}`,
            ),
          ),
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
  completion,
}: ReviewContext & {
  userId: string;
  completion?: {
    jobId: string;
    token: string;
    started: number;
    calls: import("@/infra/evaluation-metrics").EvaluationCallMetric[];
  };
  evaluation: Omit<
    typeof documentEvaluationTable.$inferInsert,
    "id" | "createdAt" | "applicantId"
  > & { applicantId: string };
}) {
  if (evaluation.reviewStatus !== "complete") {
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "The review is incomplete. Run the review again before publishing it.",
    );
  }
  const review = {
    ...evaluation,
    reviewStatus: evaluation.reviewStatus,
    docSnapshots: evaluation.docSnapshots ?? null,
    itemFeedback: evaluation.itemFeedback ?? null,
    routeAssessment: evaluation.routeAssessment ?? null,
    reviewContextHash: evaluation.reviewContextHash ?? null,
  };
  const { changes } = await getAgencyReviewIssueChanges({
    db,
    applicationId,
    userId,
    evaluation: review,
  });
  // Publish the score, issue list, and report status together. A failed write must
  // never expose a completed evaluation without its tracked findings.
  const writes = [
    db.insert(documentEvaluationTable).values(evaluation).returning(),
    ...changes,
    db
      .update(applicantTable)
      .set({ readinessScore: null, riskLevel: null })
      .where(
        and(
          eq(applicantTable.id, evaluation.applicantId),
          eq(applicantTable.applicationId, applicationId),
        ),
      ),
    db
      .update(visaApplicationTable)
      .set({
        readinessScore: null,
        riskLevel: null,
        status: VISA_APPLICATION_STATUS.IN_PROGRESS,
        agencyStatus: AGENCY_CASE_STATUS.IN_REVIEW,
        reviewCompletedAt: null,
      })
      .where(eq(visaApplicationTable.id, applicationId)),
    ...getAgencyReportInvalidationQueries({ db, applicationId }),
  ] as const;
  const savedEvaluation = await db.withTransaction(async () => {
    await db
      .select({ id: visaApplicationTable.id })
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.id, applicationId))
      .for("update");
    const initialSnapshot = await loadReviewSnapshot({ db, applicationId });
    if (initialSnapshot.application.finalSubmissionAt)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "This case was submitted. A new review cannot be saved.",
      );
    if (
      !getReviewAvailability({
        applicantId: evaluation.applicantId,
        items: initialSnapshot.checklistItems,
        documents: initialSnapshot.documents,
      }).canReview
    )
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Upload usable document evidence for this applicant before review.",
      );
    if (
      !isEvaluationCurrent({
        evaluation: review,
        ...initialSnapshot,
        routeContext: buildReviewRouteContext({
          ...initialSnapshot,
          applicantId: evaluation.applicantId,
        }),
      })
    )
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "The case or documents changed during review. Run review again.",
      );
    if (completion) {
      // Updating the claim locks its row through publication. A stale worker
      // cannot publish after recovery assigns a different token.
      const claimed = await db
        .update(reviewJobTable)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(reviewJobTable.id, completion.jobId),
            eq(reviewJobTable.claimToken, completion.token),
            eq(reviewJobTable.status, "running"),
            eq(reviewJobTable.applicationId, applicationId),
            eq(reviewJobTable.applicantId, evaluation.applicantId),
            sql`${reviewJobTable.leaseUntil} > now()`,
          ),
        )
        .returning({ id: reviewJobTable.id });
      if (!claimed.length)
        throw new ZSAError(
          "PRECONDITION_FAILED",
          "The review job lease expired. Run review again.",
        );
    }
    const [saved] = await writes[0];
    for (const write of writes.slice(1)) await write;
    const snapshot = await loadReviewSnapshot({ db, applicationId });
    if (
      !isEvaluationCurrent({
        evaluation: saved,
        ...snapshot,
        routeContext: buildReviewRouteContext({ ...snapshot, applicantId: evaluation.applicantId }),
      })
    ) {
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "The documents changed during review. Run review again.",
      );
    }
    if (completion) {
      const completed = await db
        .update(reviewJobTable)
        .set({
          status: "succeeded",
          checkpoint: null,
          evaluationId: saved.id,
          claimToken: null,
          leaseUntil: null,
          finishedAt: new Date(),
          updatedAt: new Date(),
          error: null,
          metrics: { durationMs: performance.now() - completion.started, calls: completion.calls },
        })
        .where(
          and(
            eq(reviewJobTable.id, completion.jobId),
            eq(reviewJobTable.claimToken, completion.token),
            eq(reviewJobTable.status, "running"),
            sql`${reviewJobTable.leaseUntil} > now()`,
          ),
        )
        .returning({ id: reviewJobTable.id });
      if (!completed.length) throw new Error("Review claim expired before publication");
    }
    return saved;
  });
  return savedEvaluation;
}

export async function requireCurrentAgencyReview({
  db,
  applicationId,
  userId,
  syncIssues = true,
}: ReviewContext & { userId: string; syncIssues?: boolean }) {
  const pending = await db.query.reviewJobTable.findFirst({
    where: and(
      eq(reviewJobTable.applicationId, applicationId),
      sql`${reviewJobTable.status} in ('queued', 'running')`,
    ),
  });
  if (pending)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "Wait for the current review to finish before you prepare a report or mark the case ready.",
    );
  const snapshot = await loadReviewSnapshot({ db, applicationId });
  const evaluations = await db.query.documentEvaluationTable.findMany({
    where: eq(documentEvaluationTable.applicationId, applicationId),
    orderBy: newestEvaluationOrder,
  });
  const { checklistItems: items, documents, applicants, reviewContextHash } = snapshot;
  if (!items.length)
    throw new ZSAError("PRECONDITION_FAILED", "Generate the document checklist first.");
  if (!applicants.length)
    throw new ZSAError("PRECONDITION_FAILED", "Add an applicant before review.");
  for (const applicant of applicants) {
    if (!getReviewAvailability({ applicantId: applicant.id, items, documents }).canReview)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Review the current documents after uploading usable evidence for every applicant.",
      );
    const applicantId = applicant.id;
    const evaluation = evaluations.find((evaluation) => evaluation.applicantId === applicantId);
    if (
      !isEvaluationCurrent({
        evaluation,
        checklistItems: items,
        documents,
        reviewContextHash,
        routeContext: buildReviewRouteContext({ ...snapshot, applicantId }),
      })
    ) {
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Complete a review of the current documents first.",
      );
    }
    // Also covers cases reviewed before automatic issue tracking was added.
    if (syncIssues)
      await syncAgencyReviewIssues({ db, applicationId, evaluation: evaluation!, userId });
  }
  return {
    items,
    documents,
    evaluations: applicants.map(
      (applicant) => evaluations.find((evaluation) => evaluation.applicantId === applicant.id)!,
    ),
  };
}

export async function requireSubmissionReady({
  db,
  applicationId,
  userId,
  syncIssues = true,
}: ReviewContext & { userId: string; syncIssues?: boolean }) {
  const snapshot = await loadReviewSnapshot({ db, applicationId });
  if (snapshot.application.finalSubmissionAt)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "This case was submitted. Its submission state cannot be reset.",
    );
  if (snapshot.checklistItems.some((item) => getChecklistRequirement(item).unresolved))
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "Complete the case details or edit the unresolved checklist requirements first.",
    );
  if (
    snapshot.checklistItems.some(
      (item) =>
        item.isRequired &&
        !isDocumentUsable(
          snapshot.documents.find((document) => document.checklistItemId === item.id) ?? {
            id: "missing",
            checklistItemId: item.id,
          },
        ),
    )
  )
    throw new ZSAError("PRECONDITION_FAILED", "Upload usable required documents first.");
  if (
    snapshot.checklistItems.length &&
    snapshot.applicants.some(
      (applicant) =>
        !getReviewAvailability({
          applicantId: applicant.id,
          items: snapshot.checklistItems,
          documents: snapshot.documents,
        }).canReview,
    )
  )
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "Upload usable document evidence for every applicant before marking ready.",
    );
  const { items, documents, evaluations } = await requireCurrentAgencyReview({
    db,
    applicationId,
    userId,
    syncIssues,
  });
  for (const evaluation of evaluations) {
    const availability = getReviewAvailability({
      applicantId: evaluation.applicantId!,
      items,
      documents,
    });
    if (!availability.canReview)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Upload usable document evidence for every applicant before marking ready.",
      );
  }
  if (items.some((item) => getChecklistRequirement(item).unresolved))
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "Complete the case details or edit the unresolved checklist requirements first.",
    );

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
  if (
    items.some(
      (item) =>
        item.isRequired &&
        evaluations.some(
          (evaluation) =>
            (item.applicantId === null || item.applicantId === evaluation.applicantId) &&
            (evaluation.itemFeedback?.[item.id]?.hasDocument !== true ||
              evaluation.itemFeedback?.[item.id]?.hasContent !== true),
        ),
    )
  )
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "Review usable required documents before marking ready.",
    );
  if (
    evaluations.some(
      (evaluation) => !evaluation.routeAssessment || !canMarkCaseReady(evaluation.routeAssessment),
    )
  ) {
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "Complete the outstanding route checks for every applicant before you mark this case ready.",
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
  const updated = await db.withTransaction(async () => {
    await db
      .select({ id: visaApplicationTable.id })
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.id, applicationId))
      .for("update");
    await requireSubmissionReady({ db, applicationId, userId, syncIssues: false });
    return db
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
  });
  if (!updated.length)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "The case changed. Check the current documents and issues, then try again.",
    );
}
