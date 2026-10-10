import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, desc, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  reviewJobTable,
  applicantTable,
  checklistItemTable,
  uploadedDocumentTable,
  visaApplicationTable,
  agencyTeamMemberTable,
} from "@/db/schema";
import { enqueueReviewJob } from "@/infra/google/review-tasks";
import { runAgencyEvaluation } from "@/services/agency-evaluation";
import { withEvaluationMetrics, type EvaluationCallMetric } from "@/infra/evaluation-metrics";

interface ReviewIdentity {
  applicationId: string;
  applicantId: string;
}
const MAX_ATTEMPTS = 5;
const LEASE_MS = 30 * 60_000;
const DELIVERY_UNCONFIRMED = "Review delivery is not confirmed.";
const publicColumns = {
  id: reviewJobTable.id,
  status: reviewJobTable.status,
  error: reviewJobTable.error,
  evaluationId: reviewJobTable.evaluationId,
};

export async function getLatestReviewJob(
  input: ReviewIdentity,
): Promise<Pick<
  typeof reviewJobTable.$inferSelect,
  "id" | "status" | "error" | "evaluationId"
> | null> {
  const [job] = await getDB()
    .select(publicColumns)
    .from(reviewJobTable)
    .where(
      and(
        eq(reviewJobTable.applicationId, input.applicationId),
        eq(reviewJobTable.applicantId, input.applicantId),
      ),
    )
    .orderBy(desc(reviewJobTable.createdAt), desc(reviewJobTable.id))
    .limit(1);
  return job ?? null;
}

export async function requestReviewJob(input: ReviewIdentity & { userId: string }) {
  const db = getDB();
  const [applicant, item, document] = await Promise.all([
    db.query.applicantTable.findFirst({
      where: and(
        eq(applicantTable.id, input.applicantId),
        eq(applicantTable.applicationId, input.applicationId),
      ),
    }),
    db.query.checklistItemTable.findFirst({
      where: and(
        eq(checklistItemTable.applicationId, input.applicationId),
        eq(checklistItemTable.applicantId, input.applicantId),
      ),
    }),
    db.query.uploadedDocumentTable.findFirst({
      where: and(
        eq(uploadedDocumentTable.applicationId, input.applicationId),
        eq(uploadedDocumentTable.applicantId, input.applicantId),
      ),
    }),
  ]);
  if (!applicant || !item || !document)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "Add an applicant, checklist, and document before review.",
    );
  const [inserted] = await db
    .insert(reviewJobTable)
    .values(input)
    .onConflictDoNothing()
    .returning(publicColumns);
  const job =
    inserted ??
    (
      await db
        .select(publicColumns)
        .from(reviewJobTable)
        .where(
          and(
            eq(reviewJobTable.applicantId, input.applicantId),
            inArray(reviewJobTable.status, ["queued", "running"]),
          ),
        )
        .limit(1)
    )[0];
  if (!job) throw new Error("Review request could not be saved");
  try {
    await enqueueReviewJob({ jobId: job.id });
  } catch {
    await db
      .update(reviewJobTable)
      .set({ error: DELIVERY_UNCONFIRMED, updatedAt: new Date() })
      .where(and(eq(reviewJobTable.id, job.id), eq(reviewJobTable.status, "queued")));
    throw new ZSAError(
      "INTERNAL_SERVER_ERROR",
      "Review request was saved, but delivery is not confirmed. It will retry automatically.",
    );
  }
  if (job.status === "queued" && job.error === DELIVERY_UNCONFIRMED) {
    await db
      .update(reviewJobTable)
      .set({ error: null, updatedAt: new Date() })
      .where(
        and(
          eq(reviewJobTable.id, job.id),
          eq(reviewJobTable.status, "queued"),
          eq(reviewJobTable.error, DELIVERY_UNCONFIRMED),
        ),
      );
    return { ...job, error: null };
  }
  return job;
}

export async function processReviewJob({ jobId }: { jobId: string }) {
  const db = getDB();
  const token = randomUUID();
  const now = new Date();
  await db
    .update(reviewJobTable)
    .set({
      status: "failed",
      claimToken: null,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
      error: "Review reached its attempt limit. Run it again.",
    })
    .where(
      and(
        eq(reviewJobTable.id, jobId),
        sql`${reviewJobTable.attempts} >= ${MAX_ATTEMPTS}`,
        or(
          eq(reviewJobTable.status, "queued"),
          and(eq(reviewJobTable.status, "running"), lt(reviewJobTable.leaseUntil, now)),
        ),
      ),
    );
  const [job] = await db
    .update(reviewJobTable)
    .set({
      status: "running",
      claimToken: token,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      startedAt: sql`coalesce(${reviewJobTable.startedAt}, ${now})`,
      updatedAt: now,
      attempts: sql`${reviewJobTable.attempts}+1`,
      error: null,
    })
    .where(
      and(
        eq(reviewJobTable.id, jobId),
        lt(reviewJobTable.attempts, MAX_ATTEMPTS),
        or(
          eq(reviewJobTable.status, "queued"),
          and(eq(reviewJobTable.status, "running"), lt(reviewJobTable.leaseUntil, now)),
        ),
      ),
    )
    .returning();
  if (!job) {
    const existing = await db.query.reviewJobTable.findFirst({
      where: eq(reviewJobTable.id, jobId),
    });
    if (existing && ["queued", "running"].includes(existing.status))
      throw new Error("Review job is already running or exhausted");
    return;
  }
  const calls: EvaluationCallMetric[] = [...(job.metrics?.calls ?? [])];
  const started = performance.now();
  let terminal = job.attempts >= MAX_ATTEMPTS;
  try {
    const [application, staff] = await Promise.all([
      db.query.visaApplicationTable.findFirst({
        where: and(
          eq(visaApplicationTable.id, job.applicationId),
          isNull(visaApplicationTable.trashedAt),
        ),
      }),
      db.query.agencyTeamMemberTable.findFirst({
        where: and(
          eq(agencyTeamMemberTable.userId, job.userId),
          eq(agencyTeamMemberTable.status, "active"),
        ),
      }),
    ]);
    if (
      !application?.clientId ||
      !application.agencyId ||
      !staff ||
      staff.agencyId !== application.agencyId
    ) {
      terminal = true;
      throw new Error("Review access was revoked");
    }
    await withEvaluationMetrics({
      calls,
      run: () =>
        runAgencyEvaluation({
          applicationId: job.applicationId,
          applicantId: job.applicantId,
          userId: job.userId,
          completion: { jobId, token, started: started - (job.metrics?.durationMs ?? 0), calls },
        }),
    });
  } catch {
    await db
      .update(reviewJobTable)
      .set({
        status: terminal ? "failed" : "queued",
        claimToken: null,
        leaseUntil: null,
        updatedAt: new Date(),
        finishedAt: terminal ? new Date() : null,
        error: terminal
          ? "Review could not finish. Run it again."
          : "Review could not finish. It will retry until the attempt limit is reached.",
        metrics: {
          durationMs: (job.metrics?.durationMs ?? 0) + performance.now() - started,
          calls,
        },
      })
      .where(
        and(
          eq(reviewJobTable.id, jobId),
          eq(reviewJobTable.claimToken, token),
          eq(reviewJobTable.status, "running"),
        ),
      );
    if (!terminal) throw new Error("Review requires another attempt");
  }
}

export async function recoverReviewJobs() {
  const db = getDB();
  const now = new Date();
  const stale = new Date(now.getTime() - 2 * 60_000);
  const deliveryCutoff = new Date(now.getTime() - LEASE_MS);
  const needsRecovery = or(
    and(
      eq(reviewJobTable.status, "queued"),
      or(
        and(eq(reviewJobTable.error, DELIVERY_UNCONFIRMED), lt(reviewJobTable.updatedAt, stale)),
        lt(reviewJobTable.updatedAt, deliveryCutoff),
      ),
    ),
    and(eq(reviewJobTable.status, "running"), lt(reviewJobTable.leaseUntil, now)),
  );
  await db
    .update(reviewJobTable)
    .set({
      status: "failed",
      error: "Review recovery limit reached. Run it again.",
      claimToken: null,
      leaseUntil: null,
      updatedAt: now,
      finishedAt: now,
    })
    .where(
      and(
        needsRecovery,
        or(
          sql`${reviewJobTable.attempts} >= ${MAX_ATTEMPTS}`,
          sql`${reviewJobTable.recoveryCount} >= 3`,
        ),
      ),
    );
  const jobs = await db
    .select({ id: reviewJobTable.id })
    .from(reviewJobTable)
    .where(and(lt(reviewJobTable.recoveryCount, 3), needsRecovery))
    .orderBy(reviewJobTable.updatedAt)
    .limit(20);
  let enqueued = 0,
    failed = 0;
  for (const job of jobs) {
    const [claim] = await db
      .update(reviewJobTable)
      .set({ recoveryCount: sql`${reviewJobTable.recoveryCount}+1`, updatedAt: now })
      .where(
        and(
          eq(reviewJobTable.id, job.id),
          lt(reviewJobTable.updatedAt, stale),
          lt(reviewJobTable.recoveryCount, 3),
          needsRecovery,
        ),
      )
      .returning();
    if (!claim) continue;
    try {
      await enqueueReviewJob({ jobId: job.id, version: `recovery:${claim.recoveryCount}` });
      await db
        .update(reviewJobTable)
        .set({ error: null, updatedAt: new Date() })
        .where(and(eq(reviewJobTable.id, job.id), eq(reviewJobTable.status, "queued")));
      enqueued++;
    } catch {
      failed++;
    }
  }
  return { enqueued, failed };
}
