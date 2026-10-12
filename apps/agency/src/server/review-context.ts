import "server-only";

import { desc, eq } from "drizzle-orm";
import { ZSAError } from "zsa";
import type { getDB } from "@/db";
import {
  applicantTable,
  checklistItemTable,
  uploadedDocumentTable,
  visaApplicationTable,
} from "@/db/schema";
import { buildReviewContextHash } from "@/lib/review-context-data";
import { resolveChecklistItems } from "@/lib/checklist-state";
export {
  buildReviewContextHash,
  buildReviewRouteContext,
  type ReviewSnapshotInput,
} from "@/lib/review-context-data";

export async function loadReviewSnapshot({
  db,
  applicationId,
}: {
  db: ReturnType<typeof getDB>;
  applicationId: string;
}) {
  // This helper also runs on a transaction's single PostgreSQL connection.
  const application = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, applicationId),
  });
  const applicants = await db.query.applicantTable.findMany({
    where: eq(applicantTable.applicationId, applicationId),
  });
  const checklistItems = await db.query.checklistItemTable.findMany({
    where: eq(checklistItemTable.applicationId, applicationId),
  });
  const documents = await db.query.uploadedDocumentTable.findMany({
    where: eq(uploadedDocumentTable.applicationId, applicationId),
    orderBy: [
      desc(uploadedDocumentTable.uploadedAt),
      desc(uploadedDocumentTable.uploadSequence),
      desc(uploadedDocumentTable.id),
    ],
  });
  if (!application) throw new ZSAError("NOT_FOUND", "Case not found.");
  const snapshot = {
    application,
    applicants,
    checklistItems: resolveChecklistItems({
      items: checklistItems,
      settings: application.settings,
    }),
    documents,
  };
  return { ...snapshot, reviewContextHash: buildReviewContextHash(snapshot) };
}
