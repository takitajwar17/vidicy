import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { eq } from "drizzle-orm";
import { spawnSync } from "node:child_process";
import { startTestPostgres } from "./helpers/postgres";
import {
  createWorkflowDatabase,
  currentReviewMetadata,
  seedWorkflowCase,
} from "./helpers/workflow-fixture";
const state = vi.hoisted(() => ({ db: vi.fn(), enqueue: vi.fn(), evaluate: vi.fn() }));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: state.db,
}));
vi.mock("@/infra/google/review-tasks", () => ({ enqueueReviewJob: state.enqueue }));
vi.mock("@/services/agency-evaluation", () => ({ runAgencyEvaluation: state.evaluate }));
import {
  requestReviewJob,
  processReviewJob,
  recoverReviewJobs,
  getLatestReviewJob,
} from "@/server/review-jobs";
import { loadReviewCheckpoint, saveReviewCheckpoint } from "@/server/review-checkpoints";
import type { DocumentEvaluationCheckpoint } from "@/services/case-evaluation";
import { publishAgencyReview } from "@/server/agency-review";
import {
  reviewJobTable,
  agencyTeamMemberTable,
  applicantTable,
  checklistItemTable,
  uploadedDocumentTable,
  visaApplicationTable,
} from "@/db/schema";

describe("durable review jobs against private PostgreSQL", () => {
  let cluster: ReturnType<typeof startTestPostgres>;
  let fixture: Awaited<ReturnType<typeof createWorkflowDatabase>>;
  let input: Awaited<ReturnType<typeof seedWorkflowCase>>;
  beforeAll(() => {
    cluster = startTestPostgres();
  });
  afterAll(() => cluster.stop());
  beforeEach(async () => {
    fixture = await createWorkflowDatabase(cluster);
    state.db.mockReturnValue(fixture.db);
    input = await seedWorkflowCase({ db: fixture.db });
    state.enqueue.mockReset().mockResolvedValue(undefined);
    state.evaluate.mockReset().mockImplementation(async ({ completion }) => {
      const doc = await fixture.db.query.uploadedDocumentTable.findFirst();
      return publishAgencyReview({
        db: fixture.db,
        ...input,
        completion,
        evaluation: {
          ...(await currentReviewMetadata({ db: fixture.db, ...input })),
          applicationId: input.applicationId,
          applicantId: input.applicantId,
          reviewStatus: "complete",
          overallScore: 95,
          riskLevel: "low",
          summary: "Synthetic review",
          redFlags: [],
          strengths: [],
          recommendations: [],
          docSnapshots: { [input.itemId]: `${doc!.id}:test:v2:hash` },
          itemFeedback: {
            [input.itemId]: { status: "ok", feedback: "Readable document", score: 95 },
          },
        },
      });
    });
  });
  afterEach(async () => {
    await fixture.close();
  });

  function checkpoint(itemId = input.itemId): DocumentEvaluationCheckpoint {
    return {
      versionKey: "doc:model:version:hash",
      evaluation: {
        checklistItemId: itemId,
        documentName: "Passport",
        isRequired: true,
        hasDocument: true,
        hasContent: true,
        status: "ok",
        score: 100,
        issues: [],
        strengths: [],
        feedback: "Readable",
        confidence: 90,
        confidenceReason: "Readable",
        contentExcerpt: "Passport",
        extractedFields: {
          holderName: null,
          expiryDate: null,
          documentNumber: null,
          issuingAuthority: null,
          language: "en",
          dateRange: null,
        },
      },
    };
  }

  async function claimJob() {
    const job = await requestReviewJob(input);
    await fixture.db
      .update(reviewJobTable)
      .set({ status: "running", claimToken: "owner", leaseUntil: new Date(Date.now() + 60_000) })
      .where(eq(reviewJobTable.id, job.id));
    return {
      jobId: job.id,
      token: "owner",
      applicationId: input.applicationId,
      applicantId: input.applicantId,
    };
  }

  it("refuses new reviews and stops queued reviews after submission", async () => {
    const job = await requestReviewJob(input);
    await fixture.db
      .update(visaApplicationTable)
      .set({ finalSubmissionAt: new Date() })
      .where(eq(visaApplicationTable.id, input.applicationId));
    await expect(requestReviewJob(input)).rejects.toThrow(/submitted/i);
    await processReviewJob({ jobId: job.id });
    expect(state.evaluate).not.toHaveBeenCalled();
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "failed" });
  });

  it("merges parallel document checkpoints and resets them for changed case facts", async () => {
    const claim = await claimJob();
    await Promise.all(
      ["one", "two"].map((itemId) =>
        saveReviewCheckpoint({
          ...claim,
          contextHash: "context-one",
          checkpoint: checkpoint(itemId),
        }),
      ),
    );
    expect(
      Object.keys((await loadReviewCheckpoint({ ...claim, contextHash: "context-one" }))!),
    ).toEqual(expect.arrayContaining(["one", "two"]));
    expect(await loadReviewCheckpoint({ ...claim, contextHash: "new-context" })).toBeUndefined();
    await saveReviewCheckpoint({
      ...claim,
      contextHash: "new-context",
      checkpoint: checkpoint("three"),
    });
    expect(
      Object.keys((await loadReviewCheckpoint({ ...claim, contextHash: "new-context" }))!),
    ).toEqual(["three"]);
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(0);
    expect(await getLatestReviewJob(input)).not.toHaveProperty("checkpoint");
  });

  it("rejects checkpoint writes and reads from expired or replaced worker claims", async () => {
    const claim = await claimJob();
    await saveReviewCheckpoint({ ...claim, contextHash: "context", checkpoint: checkpoint() });
    for (const patch of [
      { claimToken: "replacement" },
      { claimToken: "owner", leaseUntil: new Date(0) },
      { status: "queued" as const },
    ]) {
      await fixture.db.update(reviewJobTable).set(patch).where(eq(reviewJobTable.id, claim.jobId));
      await expect(
        saveReviewCheckpoint({ ...claim, contextHash: "context", checkpoint: checkpoint() }),
      ).rejects.toThrow();
      await expect(loadReviewCheckpoint({ ...claim, contextHash: "context" })).rejects.toThrow();
    }
  });

  it("keeps checkpoints after failure and carries them into a manual retry", async () => {
    const claim = await claimJob();
    await saveReviewCheckpoint({ ...claim, contextHash: "context", checkpoint: checkpoint() });
    await fixture.db
      .update(reviewJobTable)
      .set({ status: "failed", claimToken: null, leaseUntil: null })
      .where(eq(reviewJobTable.id, claim.jobId));
    const retry = await requestReviewJob(input);
    expect(retry.id).not.toBe(claim.jobId);
    const retryRow = await fixture.db.query.reviewJobTable.findFirst({
      where: eq(reviewJobTable.id, retry.id),
    });
    expect(retryRow?.checkpoint?.documents[input.itemId]).toEqual(checkpoint());
    await processReviewJob({ jobId: retry.id });
    const complete = await fixture.db.query.reviewJobTable.findFirst({
      where: eq(reviewJobTable.id, retry.id),
    });
    expect(complete).toMatchObject({ status: "succeeded", checkpoint: null });
  });

  it("saves one job for simultaneous requests and acknowledges accepted delivery", async () => {
    const jobs = await Promise.all(Array.from({ length: 8 }, () => requestReviewJob(input)));
    expect(new Set(jobs.map((job) => job.id)).size).toBe(1);
    expect(await fixture.db.query.reviewJobTable.findMany()).toHaveLength(1);
    expect(state.evaluate).not.toHaveBeenCalled();
  });
  it("blocks a separate applicant without personal or shared evidence", async () => {
    const [child] = await fixture.db
      .insert(applicantTable)
      .values({
        applicationId: input.applicationId,
        name: "Child with shared evidence",
        relationship: "child",
      })
      .returning();
    await expect(requestReviewJob({ ...input, applicantId: child.id })).rejects.toThrow(
      "checklist",
    );
  });
  it("does not queue a review without uploaded documents", async () => {
    await fixture.db.delete(uploadedDocumentTable);
    await expect(requestReviewJob(input)).rejects.toThrow("Upload");
    expect(await fixture.db.query.reviewJobTable.findMany()).toEqual([]);
    expect(state.enqueue).not.toHaveBeenCalled();
  });
  it("does not queue a review while its only file is processing", async () => {
    await fixture.db
      .update(uploadedDocumentTable)
      .set({ extractionStatus: "extracting", textContent: null });
    await expect(requestReviewJob(input)).rejects.toThrow("processing");
  });
  it("allows partial evidence without waiting for every requirement", async () => {
    await fixture.db.insert(checklistItemTable).values({
      applicationId: input.applicationId,
      applicantId: input.applicantId,
      documentName: "Funding",
      description: "Funding evidence",
      isRequired: true,
    });
    await expect(requestReviewJob(input)).resolves.toMatchObject({ status: "queued" });
  });
  it("publishes and completes once despite duplicate task delivery", async () => {
    const job = await requestReviewJob(input);
    await processReviewJob({ jobId: job.id });
    await processReviewJob({ jobId: job.id });
    expect(state.evaluate).toHaveBeenCalledTimes(1);
    expect(await getLatestReviewJob(input)).toMatchObject({
      status: "succeeded",
      evaluationId: expect.any(String),
    });
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(1);
  });
  it("rejects review work after the requester moves to another agency", async () => {
    const foreign = await seedWorkflowCase({ db: fixture.db });
    const foreignMember = await fixture.db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.userId, foreign.userId),
    });
    const job = await requestReviewJob(input);
    await fixture.db
      .update(agencyTeamMemberTable)
      .set({ agencyId: foreignMember!.agencyId })
      .where(eq(agencyTeamMemberTable.userId, input.userId));

    await processReviewJob({ jobId: job.id });

    expect(state.evaluate).not.toHaveBeenCalled();
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "failed" });
  });

  it("rejects overlapping workers", async () => {
    const job = await requestReviewJob(input);
    let release!: () => void;
    state.evaluate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(undefined);
        }),
    );
    const running = processReviewJob({ jobId: job.id });
    await vi.waitFor(() => expect(state.evaluate).toHaveBeenCalledTimes(1));
    await expect(processReviewJob({ jobId: job.id })).rejects.toThrow("already running");
    release();
    await running;
  });
  it("recovers a stopped worker after its lease expires", async () => {
    const job = await requestReviewJob(input);
    await fixture.db
      .update(reviewJobTable)
      .set({ status: "running", claimToken: "dead-worker", leaseUntil: new Date(0), attempts: 1 })
      .where(eq(reviewJobTable.id, job.id));
    await processReviewJob({ jobId: job.id });
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "succeeded" });
    const saved = await fixture.db.query.reviewJobTable.findFirst();
    expect(saved?.attempts).toBe(2);
  });

  it("recovers after a worker process exits without cleanup", { timeout: 20000 }, async () => {
    const job = await requestReviewJob(input);
    const child = spawnSync(
      "pnpm",
      ["exec", "vitest", "run", "--config", "tests/worker-vitest.config.ts"],
      {
        timeout: 15000,
        stdio: "pipe",
        env: {
          ...process.env,
          DB_SQL_LOG: "false",
          REVIEW_WORKER_TEST_SOCKET: String(fixture.pool.options.host),
          REVIEW_WORKER_TEST_DATABASE: String(fixture.pool.options.database),
          REVIEW_WORKER_TEST_JOB: job.id,
        },
      },
    );
    expect(child.status).not.toBe(0);
    const interrupted = await fixture.db.query.reviewJobTable.findFirst();
    expect(interrupted).toMatchObject({ status: "running", attempts: 1, evaluationId: null });
    await fixture.db
      .update(reviewJobTable)
      .set({ leaseUntil: new Date(0) })
      .where(eq(reviewJobTable.id, job.id));
    await processReviewJob({ jobId: job.id });
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "succeeded" });
    expect(state.evaluate).toHaveBeenCalledTimes(1);
  });
  it("retains a queued job after an enqueue failure and repairs it", async () => {
    state.enqueue.mockRejectedValueOnce(new Error("unavailable"));
    await expect(requestReviewJob(input)).rejects.toThrow("request was saved");
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "queued" });
    await fixture.db.update(reviewJobTable).set({ updatedAt: new Date(0) });
    expect(await recoverReviewJobs()).toEqual({ enqueued: 1, failed: 0 });
    await processReviewJob({ jobId: (await getLatestReviewJob(input))!.id });
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "succeeded" });
  });

  it("keeps accepted queued work while the task queue has a backlog", async () => {
    const job = await requestReviewJob(input);
    await fixture.db
      .update(reviewJobTable)
      .set({ updatedAt: new Date(Date.now() - 3 * 60_000), recoveryCount: 3 })
      .where(eq(reviewJobTable.id, job.id));
    expect(await recoverReviewJobs()).toEqual({ enqueued: 0, failed: 0 });
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "queued" });
    await processReviewJob({ jobId: job.id });
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "succeeded" });
  });

  it("clears an uncertain-delivery marker after a confirmed retry", async () => {
    state.enqueue.mockRejectedValueOnce(new Error("unavailable"));
    await expect(requestReviewJob(input)).rejects.toThrow("request was saved");
    await requestReviewJob(input);
    expect((await getLatestReviewJob(input))?.error).toBeNull();
  });
  it("retries provider failure and saves no partial review", async () => {
    const job = await requestReviewJob(input);
    state.evaluate.mockRejectedValueOnce(new Error("private provider payload"));
    await expect(processReviewJob({ jobId: job.id })).rejects.toThrow("another attempt");
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(0);
    expect(JSON.stringify(await getLatestReviewJob(input))).not.toContain(
      "private provider payload",
    );
    await processReviewJob({ jobId: job.id });
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "succeeded" });
  });
  it("shows failure after the final attempt, including a stopped final worker", async () => {
    const job = await requestReviewJob(input);
    await fixture.db
      .update(reviewJobTable)
      .set({ attempts: 5, status: "running", leaseUntil: new Date(0) });
    await processReviewJob({ jobId: job.id });
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "failed" });
  });
  it("does not run AI when staff access was revoked", async () => {
    const job = await requestReviewJob(input);
    await fixture.db.update(agencyTeamMemberTable).set({ status: "removed" });
    await processReviewJob({ jobId: job.id });
    expect(state.evaluate).not.toHaveBeenCalled();
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "failed" });
  });
  it("rolls back review writes if job completion fails", async () => {
    const job = await requestReviewJob(input);
    await fixture.pool.query(
      `CREATE FUNCTION reject_job_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'succeeded' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_completion BEFORE UPDATE ON review_job FOR EACH ROW EXECUTE FUNCTION reject_job_completion()`,
    );
    await expect(processReviewJob({ jobId: job.id })).rejects.toThrow();
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(0);
    expect(await getLatestReviewJob(input)).toMatchObject({ status: "queued" });
  });
  it("rejects a stale worker claim before saving any review", async () => {
    const job = await requestReviewJob(input);
    await fixture.db.update(reviewJobTable).set({
      status: "running",
      claimToken: "replacement-worker",
      leaseUntil: new Date(Date.now() + 60000),
    });
    await expect(
      state.evaluate({
        completion: { jobId: job.id, token: "old-worker", started: performance.now(), calls: [] },
      }),
    ).rejects.toThrow("lease expired");
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(0);
  });
});
