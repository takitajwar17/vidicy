import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import type { getDB } from "@/db";
import { checklistJobTable, agencyTeamMemberTable } from "@/db/schema";

export interface ChecklistJobCompletion {
  jobId: string;
  token: string;
  contextHash: string;
}

/** Called inside the same transaction that publishes the generated checklist. */
export async function completeChecklistJob({
  db,
  completion,
  applicationId,
  applicantId,
  agencyId,
}: {
  db: ReturnType<typeof getDB>;
  completion: ChecklistJobCompletion;
  applicationId: string;
  applicantId: string;
  agencyId: string | null;
}) {
  const [job] = await db
    .update(checklistJobTable)
    .set({
      status: "succeeded",
      error: null,
      claimToken: null,
      leaseUntil: null,
      updatedAt: new Date(),
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(checklistJobTable.id, completion.jobId),
        eq(checklistJobTable.applicationId, applicationId),
        eq(checklistJobTable.applicantId, applicantId),
        eq(checklistJobTable.contextHash, completion.contextHash),
        eq(checklistJobTable.status, "running"),
        eq(checklistJobTable.claimToken, completion.token),
        sql`${checklistJobTable.leaseUntil} > now()`,
      ),
    )
    .returning({ userId: checklistJobTable.userId });
  if (!job) throw new Error("Checklist worker claim expired or was replaced.");
  const staff = agencyId
    ? await db.query.agencyTeamMemberTable.findFirst({
        where: and(
          eq(agencyTeamMemberTable.userId, job.userId),
          eq(agencyTeamMemberTable.agencyId, agencyId),
          eq(agencyTeamMemberTable.status, "active"),
        ),
      })
    : null;
  if (!staff) throw new ZSAError("FORBIDDEN", "Checklist access was revoked.");
}
