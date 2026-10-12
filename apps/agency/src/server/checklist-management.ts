import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import type { getDB } from "@/db";
import { checklistItemTable } from "@/db/schema";
import { checklistMutationSchema } from "@/lib/checklist-input";
import { getChecklistRequirement } from "@/lib/checklist-state";
import { loadReviewSnapshot } from "./review-context";
import { getAgencyReviewInvalidationQueries } from "./agency-review";

export async function mutateChecklistItem({
  db,
  agencyId,
  input,
}: {
  db: ReturnType<typeof getDB>;
  agencyId: string;
  input: unknown;
}) {
  const draft = checklistMutationSchema.parse(input);
  return db.withTransaction(async () => {
    const locked = await db.execute(
      sql`SELECT id FROM visa_application WHERE id = ${draft.applicationId} AND "agencyId" = ${agencyId} AND "trashedAt" IS NULL FOR UPDATE`,
    );
    if (!locked.rows.length) throw new ZSAError("NOT_FOUND", "Case not found.");
    const snapshot = await loadReviewSnapshot({ db, applicationId: draft.applicationId });
    if (!snapshot.application.clientId) throw new ZSAError("NOT_FOUND", "Case not found.");
    if (snapshot.application.finalSubmissionAt)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "This case was submitted. Keep the submitted evidence unchanged.",
      );
    if (snapshot.reviewContextHash !== draft.expectedHash)
      throw new ZSAError(
        "CONFLICT",
        "The case changed. Refresh the case before you save. Your form changes are still available.",
      );
    const existing = draft.itemId
      ? snapshot.checklistItems.find((item) => item.id === draft.itemId)
      : null;
    if (draft.itemId && !existing) throw new ZSAError("NOT_FOUND", "Checklist item not found.");
    if (draft.operation === "remove") {
      await db
        .update(checklistItemTable)
        .set({ removedAt: new Date(), origin: "staff" })
        .where(
          and(
            eq(checklistItemTable.id, draft.itemId),
            eq(checklistItemTable.applicationId, draft.applicationId),
            isNull(checklistItemTable.removedAt),
          ),
        );
    } else {
      if (
        draft.applicantId &&
        !snapshot.applicants.some((person) => person.id === draft.applicantId)
      )
        throw new ZSAError("NOT_FOUND", "Applicant not found.");
      if (existing && existing.applicantId !== draft.applicantId)
        throw new ZSAError(
          "INPUT_PARSE_ERROR",
          "Keep the checklist item with its original applicant.",
        );
      const values = {
        documentName: draft.documentName,
        description: draft.description,
        requirementType: draft.requirementType,
        applicability: draft.applicability,
        requirementCondition: draft.requirementCondition || null,
        origin: "staff" as const,
        isRequired: getChecklistRequirement({
          id: draft.itemId ?? "new",
          isRequired: false,
          ...draft,
        }).isRequired,
      };
      if (existing)
        await db
          .update(checklistItemTable)
          .set(values)
          .where(eq(checklistItemTable.id, existing.id));
      else
        await db.insert(checklistItemTable).values({
          ...values,
          applicationId: draft.applicationId,
          applicantId: draft.applicantId,
          sortOrder:
            snapshot.checklistItems.reduce((last, item) => Math.max(last, item.sortOrder), 0) + 1,
        });
    }
    for (const write of getAgencyReviewInvalidationQueries({
      db,
      applicationId: draft.applicationId,
    }))
      await write;
    return {
      saved: true,
      reviewContextHash: (await loadReviewSnapshot({ db, applicationId: draft.applicationId }))
        .reviewContextHash,
    };
  });
}
