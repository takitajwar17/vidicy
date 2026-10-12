import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import type { getDB } from "@/db";
import { clientReportTable, visaApplicationTable, type ClientReportActionItem } from "@/db/schema";
import { loadReviewSnapshot } from "./review-context";

export async function createCollectionRequest({
  db,
  agencyId,
  applicationId,
  userId,
  expectedHash,
}: {
  db: ReturnType<typeof getDB>;
  agencyId: string;
  applicationId: string;
  userId: string;
  expectedHash: string;
}) {
  return db.withTransaction(async () => {
    const locked = await db.execute(
      sql`SELECT id FROM visa_application WHERE id = ${applicationId} AND "agencyId" = ${agencyId} AND "trashedAt" IS NULL FOR UPDATE`,
    );
    if (!locked.rows.length) throw new ZSAError("NOT_FOUND", "Case not found.");
    const snapshot = await loadReviewSnapshot({ db, applicationId });
    if (!snapshot.application.clientId) throw new ZSAError("NOT_FOUND", "Case not found.");
    if (snapshot.application.finalSubmissionAt)
      throw new ZSAError("PRECONDITION_FAILED", "This case was submitted.");
    if (snapshot.reviewContextHash !== expectedHash)
      throw new ZSAError(
        "CONFLICT",
        "The case changed. Refresh before preparing a document request.",
      );
    if (!snapshot.checklistItems.length)
      throw new ZSAError("PRECONDITION_FAILED", "Generate or add checklist items first.");
    const actionItems: ClientReportActionItem[] = snapshot.checklistItems
      .filter(
        (item) =>
          item.applicability !== "does_not_apply" &&
          !snapshot.documents.some((document) => document.checklistItemId === item.id),
      )
      .map((item) => ({
        title: `${item.requirementType === "recommended" ? "Recommended: " : ""}${item.documentName}`,
        detail: `${item.description}${item.requirementCondition ? ` Condition: ${item.requirementCondition}` : ""}${item.applicability === "unknown" || item.requirementType === "unknown" ? " The agency needs more details to determine whether this item applies." : ""}`,
        severity: item.isRequired ? "high" : "low",
      }));
    if (!actionItems.length)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "All checklist items have files. Review the available documents for corrections.",
      );
    await db
      .update(clientReportTable)
      .set({ status: "draft" })
      .where(
        and(
          eq(clientReportTable.applicationId, applicationId),
          eq(clientReportTable.status, "ready"),
        ),
      );
    const [report] = await db
      .insert(clientReportTable)
      .values({
        applicationId,
        kind: "collection",
        reviewContextHash: snapshot.reviewContextHash,
        status: "ready",
        summary:
          "Please provide the documents and details below so the agency can review your case. No document review has been completed by this request.",
        actionItems,
        createdById: userId,
      })
      .returning();
    await db
      .update(visaApplicationTable)
      .set({ clientReportStatus: "ready" })
      .where(eq(visaApplicationTable.id, applicationId));
    return report;
  });
}
