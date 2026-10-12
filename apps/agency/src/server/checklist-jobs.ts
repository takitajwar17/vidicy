import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, desc, inArray, lt, or, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  checklistJobTable,
  applicantTable,
  visaApplicationTable,
  agencyTeamMemberTable,
} from "@/db/schema";
import { enqueueChecklistJob } from "@/infra/google/checklist-tasks";
import { generateChecklist } from "@/services/checklist-generation";
import { buildChecklistResearchContext, checklistResearchHash } from "@/lib/checklist-research";

interface ChecklistIdentity {
  applicationId: string;
  applicantId: string;
}
const MAX_ATTEMPTS = 5;
const LEASE_MS = 30 * 60_000;
const DELIVERY_UNCONFIRMED = "Checklist delivery is not confirmed.";
const publicColumns = {
  id: checklistJobTable.id,
  status: checklistJobTable.status,
  error: checklistJobTable.error,
  refreshResearch: checklistJobTable.refreshResearch,
};

export async function getLatestChecklistJob(
  input: ChecklistIdentity,
): Promise<Pick<
  typeof checklistJobTable.$inferSelect,
  "id" | "status" | "error" | "refreshResearch"
> | null> {
  const [job] = await getDB()
    .select(publicColumns)
    .from(checklistJobTable)
    .where(
      and(
        eq(checklistJobTable.applicationId, input.applicationId),
        eq(checklistJobTable.applicantId, input.applicantId),
      ),
    )
    .orderBy(desc(checklistJobTable.createdAt), desc(checklistJobTable.id))
    .limit(1);
  return job ?? null;
}

async function loadChecklistContext(input: ChecklistIdentity & { userId: string }) {
  const db = getDB();
  const application = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, input.applicationId),
  });
  if (!application || application.trashedAt) throw new ZSAError("NOT_FOUND", "Case not found.");
  if (application.finalSubmissionAt)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "This case was submitted. Keep the submitted checklist unchanged.",
    );
  const staff = await db.query.agencyTeamMemberTable.findFirst({
    where: and(
      eq(agencyTeamMemberTable.userId, input.userId),
      eq(agencyTeamMemberTable.status, "active"),
    ),
  });
  if (!application.agencyId || !application.clientId || staff?.agencyId !== application.agencyId)
    throw new ZSAError("FORBIDDEN", "Checklist access was revoked.");
  const applicants = await db.query.applicantTable.findMany({
    where: eq(applicantTable.applicationId, input.applicationId),
  });
  if (!applicants.some((person) => person.id === input.applicantId))
    throw new ZSAError("NOT_FOUND", "Applicant not found in this case.");
  return buildChecklistResearchContext({
    application,
    applicants,
    applicantId: input.applicantId,
    now: new Date(),
  });
}

export async function requestChecklistJob(
  input: ChecklistIdentity & { userId: string; refreshResearch?: boolean },
) {
  const db = getDB();
  const contextHash = checklistResearchHash(await loadChecklistContext(input));
  const [inserted] = await db
    .insert(checklistJobTable)
    .values({ ...input, contextHash })
    .onConflictDoNothing()
    .returning(publicColumns);
  const job =
    inserted ??
    (
      await db
        .select(publicColumns)
        .from(checklistJobTable)
        .where(
          and(
            eq(checklistJobTable.applicationId, input.applicationId),
            eq(checklistJobTable.applicantId, input.applicantId),
            inArray(checklistJobTable.status, ["queued", "running"]),
          ),
        )
        .limit(1)
    )[0];
  if (!job) throw new Error("Checklist request could not be saved");
  try {
    await enqueueChecklistJob({ jobId: job.id });
  } catch {
    await db
      .update(checklistJobTable)
      .set({ error: DELIVERY_UNCONFIRMED, updatedAt: new Date() })
      .where(and(eq(checklistJobTable.id, job.id), eq(checklistJobTable.status, "queued")));
    throw new ZSAError(
      "INTERNAL_SERVER_ERROR",
      "Checklist request was saved, but delivery is not confirmed. It will retry automatically.",
    );
  }
  if (job.status === "queued" && job.error === DELIVERY_UNCONFIRMED) {
    await db
      .update(checklistJobTable)
      .set({ error: null, updatedAt: new Date() })
      .where(
        and(
          eq(checklistJobTable.id, job.id),
          eq(checklistJobTable.status, "queued"),
          eq(checklistJobTable.error, DELIVERY_UNCONFIRMED),
        ),
      );
    return { ...job, error: null };
  }
  return job;
}

export async function processChecklistJob({ jobId }: { jobId: string }) {
  const db = getDB();
  const token = randomUUID();
  const now = new Date();
  await db
    .update(checklistJobTable)
    .set({
      status: "failed",
      claimToken: null,
      leaseUntil: null,
      finishedAt: now,
      updatedAt: now,
      error: "Checklist generation reached its attempt limit. Generate it again.",
    })
    .where(
      and(
        eq(checklistJobTable.id, jobId),
        sql`${checklistJobTable.attempts} >= ${MAX_ATTEMPTS}`,
        or(
          eq(checklistJobTable.status, "queued"),
          and(eq(checklistJobTable.status, "running"), lt(checklistJobTable.leaseUntil, now)),
        ),
      ),
    );
  const [job] = await db
    .update(checklistJobTable)
    .set({
      status: "running",
      claimToken: token,
      leaseUntil: new Date(now.getTime() + LEASE_MS),
      startedAt: sql`coalesce(${checklistJobTable.startedAt}, ${now})`,
      updatedAt: now,
      attempts: sql`${checklistJobTable.attempts}+1`,
      error: null,
    })
    .where(
      and(
        eq(checklistJobTable.id, jobId),
        lt(checklistJobTable.attempts, MAX_ATTEMPTS),
        or(
          eq(checklistJobTable.status, "queued"),
          and(eq(checklistJobTable.status, "running"), lt(checklistJobTable.leaseUntil, now)),
        ),
      ),
    )
    .returning();
  if (!job) {
    const existing = await db.query.checklistJobTable.findFirst({
      columns: { status: true },
      where: eq(checklistJobTable.id, jobId),
    });
    if (existing && ["queued", "running"].includes(existing.status))
      throw new Error("Checklist job is already running or exhausted");
    return;
  }
  let terminal = job.attempts >= MAX_ATTEMPTS;
  try {
    const context = await loadChecklistContext(job);
    if (checklistResearchHash(context) !== job.contextHash)
      throw new ZSAError("CONFLICT", "Case details changed. Generate the checklist again.");
    await generateChecklist({
      applicationId: job.applicationId,
      applicantId: job.applicantId,
      refreshResearch: job.refreshResearch,
      completion: { jobId, token, contextHash: job.contextHash },
    });
  } catch (error) {
    const isPrecondition =
      error instanceof ZSAError &&
      ["PRECONDITION_FAILED", "FORBIDDEN", "NOT_FOUND", "CONFLICT"].includes(error.code);
    terminal ||= isPrecondition;
    await db
      .update(checklistJobTable)
      .set({
        status: terminal ? "failed" : "queued",
        claimToken: null,
        leaseUntil: null,
        updatedAt: new Date(),
        finishedAt: terminal ? new Date() : null,
        error: isPrecondition
          ? error.message
          : terminal
            ? "Checklist generation could not finish. Generate it again."
            : "Checklist generation could not finish. It will retry automatically.",
      })
      .where(
        and(
          eq(checklistJobTable.id, jobId),
          eq(checklistJobTable.claimToken, token),
          eq(checklistJobTable.status, "running"),
        ),
      );
    if (!terminal) throw new Error("Checklist generation requires another attempt");
  }
}

export async function recoverChecklistJobs() {
  const db = getDB();
  const now = new Date();
  const stale = new Date(now.getTime() - 2 * 60_000);
  const cutoff = new Date(now.getTime() - LEASE_MS);
  const needsRecovery = or(
    and(
      eq(checklistJobTable.status, "queued"),
      or(
        and(
          eq(checklistJobTable.error, DELIVERY_UNCONFIRMED),
          lt(checklistJobTable.updatedAt, stale),
        ),
        lt(checklistJobTable.updatedAt, cutoff),
      ),
    ),
    and(eq(checklistJobTable.status, "running"), lt(checklistJobTable.leaseUntil, now)),
  );
  await db
    .update(checklistJobTable)
    .set({
      status: "failed",
      error: "Checklist recovery limit reached. Generate it again.",
      claimToken: null,
      leaseUntil: null,
      updatedAt: now,
      finishedAt: now,
    })
    .where(
      and(
        needsRecovery,
        or(
          sql`${checklistJobTable.attempts} >= ${MAX_ATTEMPTS}`,
          sql`${checklistJobTable.recoveryCount} >= 3`,
        ),
      ),
    );
  const jobs = await db
    .select({ id: checklistJobTable.id })
    .from(checklistJobTable)
    .where(and(lt(checklistJobTable.recoveryCount, 3), needsRecovery))
    .orderBy(checklistJobTable.updatedAt)
    .limit(20);
  let enqueued = 0,
    failed = 0;
  for (const job of jobs) {
    const [claim] = await db
      .update(checklistJobTable)
      .set({ recoveryCount: sql`${checklistJobTable.recoveryCount}+1`, updatedAt: now })
      .where(
        and(
          eq(checklistJobTable.id, job.id),
          lt(checklistJobTable.updatedAt, stale),
          lt(checklistJobTable.recoveryCount, 3),
          needsRecovery,
        ),
      )
      .returning();
    if (!claim) continue;
    try {
      await enqueueChecklistJob({ jobId: job.id, version: `recovery:${claim.recoveryCount}` });
      await db
        .update(checklistJobTable)
        .set({ error: null, updatedAt: new Date() })
        .where(and(eq(checklistJobTable.id, job.id), eq(checklistJobTable.status, "queued")));
      enqueued++;
    } catch {
      failed++;
    }
  }
  return { enqueued, failed };
}
