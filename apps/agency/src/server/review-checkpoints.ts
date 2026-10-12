import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDB } from "@/db";
import { reviewJobTable } from "@/db/schema";
import type { DocumentEvaluationCheckpoint } from "@/services/case-evaluation";

interface ReviewCheckpointClaim {
  jobId: string;
  token: string;
  applicationId: string;
  applicantId: string;
  contextHash: string;
}

function activeClaim(input: ReviewCheckpointClaim) {
  return and(
    eq(reviewJobTable.id, input.jobId),
    eq(reviewJobTable.claimToken, input.token),
    eq(reviewJobTable.applicationId, input.applicationId),
    eq(reviewJobTable.applicantId, input.applicantId),
    eq(reviewJobTable.status, "running"),
    sql`${reviewJobTable.leaseUntil} > now()`,
  );
}

export async function loadReviewCheckpoint(input: ReviewCheckpointClaim) {
  const [job] = await getDB()
    .select({ checkpoint: reviewJobTable.checkpoint })
    .from(reviewJobTable)
    .where(activeClaim(input));
  if (!job) throw new Error("Review checkpoint claim expired");
  return job.checkpoint?.contextHash === input.contextHash ? job.checkpoint.documents : undefined;
}

export async function saveReviewCheckpoint(
  input: ReviewCheckpointClaim & { checkpoint: DocumentEvaluationCheckpoint },
) {
  const document = JSON.stringify({
    [input.checkpoint.evaluation.checklistItemId]: input.checkpoint,
  });
  // One atomic update merges concurrent completions without lost writes. Only
  // matching case context survives; each document also has a full request hash.
  const saved = await getDB()
    .update(reviewJobTable)
    .set({
      checkpoint: sql`jsonb_build_object(
        'contextHash', ${input.contextHash}::text,
        'documents', (case
          when ${reviewJobTable.checkpoint}->>'contextHash' = ${input.contextHash}
          then coalesce(${reviewJobTable.checkpoint}->'documents', '{}'::jsonb)
          else '{}'::jsonb end) || ${document}::jsonb
      )`,
      updatedAt: new Date(),
    })
    .where(activeClaim(input))
    .returning({ id: reviewJobTable.id });
  if (!saved.length) throw new Error("Review checkpoint claim expired");
}
