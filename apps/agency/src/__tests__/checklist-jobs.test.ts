import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { startTestPostgres } from "./helpers/postgres";
import { createWorkflowDatabase, seedWorkflowCase } from "./helpers/workflow-fixture";
const state = vi.hoisted(() => ({
  db: vi.fn(),
  enqueue: vi.fn(),
  generate: vi.fn(),
  research: vi.fn(),
}));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: state.db,
}));
vi.mock("@/infra/google/checklist-tasks", () => ({ enqueueChecklistJob: state.enqueue }));
vi.mock("@/lib/openai", () => ({
  getOpenAIClient: () => ({ chat: { completions: { create: state.generate } } }),
  getPerplexityClient: () => ({ chat: { completions: { create: state.research } } }),
}));
vi.mock("@/infra/runtime-context", () => ({ getRuntimeContext: () => ({ env: {} }) }));
vi.mock("@/infra/logger", () => ({ logger: { warn: vi.fn() }, logAlert: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  requestChecklistJob,
  getLatestChecklistJob,
  processChecklistJob,
  recoverChecklistJobs,
} from "@/server/checklist-jobs";
import {
  checklistJobTable,
  checklistItemTable,
  visaApplicationTable,
  agencyTeamMemberTable,
  applicantTable,
} from "@/db/schema";

function response() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            items: [
              {
                documentName: "Funding evidence",
                description: "Provide funding evidence.",
                requirement: "required",
                applicability: "applies",
              },
            ],
          }),
        },
      },
    ],
  };
}

describe("durable checklist jobs against private PostgreSQL", () => {
  let cluster: ReturnType<typeof startTestPostgres>;
  let fixture: Awaited<ReturnType<typeof createWorkflowDatabase>>;
  let input: Awaited<ReturnType<typeof seedWorkflowCase>>;
  beforeAll(() => {
    cluster = startTestPostgres();
  });
  afterAll(() => cluster.stop());
  beforeEach(async () => {
    fixture = await createWorkflowDatabase(cluster);
    input = await seedWorkflowCase({ db: fixture.db, document: false });
    state.db.mockReturnValue(fixture.db);
    state.enqueue.mockReset().mockResolvedValue(undefined);
    state.research.mockReset().mockResolvedValue({
      choices: [{ message: { content: "Synthetic research" } }],
      citations: [],
    });
    state.generate.mockReset().mockResolvedValue(response());
  });
  afterEach(async () => {
    await fixture.close();
  });
  function request() {
    return requestChecklistJob({ ...input, refreshResearch: true });
  }
  it("saves one job for concurrent requests without starting AI work", async () => {
    const jobs = await Promise.all(Array.from({ length: 6 }, () => request()));
    expect(new Set(jobs.map((j) => j.id)).size).toBe(1);
    expect(await fixture.db.query.checklistJobTable.findMany()).toHaveLength(1);
    expect(state.generate).not.toHaveBeenCalled();
    expect(await getLatestChecklistJob(input)).toMatchObject({
      status: "queued",
      refreshResearch: true,
    });
    expect(await getLatestChecklistJob(input)).not.toHaveProperty("contextHash");
  });
  it("generates and saves the checklist and success status in one transaction", async () => {
    const job = await request();
    await processChecklistJob({ jobId: job.id });
    expect(await getLatestChecklistJob(input)).toMatchObject({
      id: job.id,
      status: "succeeded",
      error: null,
    });
    expect(await fixture.db.query.checklistItemTable.findMany()).toEqual(
      expect.arrayContaining([expect.objectContaining({ documentName: "Funding evidence" })]),
    );
    expect(
      (await fixture.db.query.visaApplicationTable.findFirst())?.checklistGeneratedAt,
    ).not.toBeNull();
    await processChecklistJob({ jobId: job.id });
    expect(state.generate).toHaveBeenCalledTimes(1);
  });
  it("finishes initial generation with saved items without repeating AI calls", async () => {
    const job = await requestChecklistJob(input);
    await processChecklistJob({ jobId: job.id });
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "succeeded" });
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("keeps a failed delivery saved for scheduler recovery", async () => {
    state.enqueue.mockRejectedValueOnce(new Error("private details"));
    await expect(request()).rejects.toThrow(/saved/i);
    const job = await fixture.db.query.checklistJobTable.findFirst();
    expect(job).toMatchObject({ status: "queued" });
    await fixture.db
      .update(checklistJobTable)
      .set({ updatedAt: new Date(0) })
      .where(eq(checklistJobTable.id, job!.id));
    expect(await recoverChecklistJobs()).toMatchObject({ enqueued: 1, failed: 0 });
    expect(state.enqueue.mock.calls[1][0]).toMatchObject({ jobId: job!.id, version: "recovery:1" });
  });
  it("rejects an applicant from another case and a user without case access", async () => {
    const other = await seedWorkflowCase({ db: fixture.db, document: false });
    await expect(
      requestChecklistJob({ ...input, applicantId: other.applicantId }),
    ).rejects.toThrow();
    await expect(requestChecklistJob({ ...input, userId: other.userId })).rejects.toThrow();
    expect(await fixture.db.query.checklistJobTable.findMany()).toHaveLength(0);
  });
  it("stops queued work after submission or staff access removal", async () => {
    const job = await request();
    await fixture.db
      .update(visaApplicationTable)
      .set({ finalSubmissionAt: new Date() })
      .where(eq(visaApplicationTable.id, input.applicationId));
    await processChecklistJob({ jobId: job.id });
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "failed" });
    expect(state.generate).not.toHaveBeenCalled();
    await expect(request()).rejects.toThrow(/submitted/i);
    await fixture.db
      .update(visaApplicationTable)
      .set({ finalSubmissionAt: null })
      .where(eq(visaApplicationTable.id, input.applicationId));
    const next = await request();
    await fixture.db
      .update(agencyTeamMemberTable)
      .set({ status: "removed" })
      .where(eq(agencyTeamMemberTable.userId, input.userId));
    await processChecklistJob({ jobId: next.id });
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "failed" });
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("rejects facts changed after queueing instead of generating for a different case", async () => {
    const job = await request();
    await fixture.db
      .update(applicantTable)
      .set({ nationality: "Canada" })
      .where(eq(applicantTable.id, input.applicantId));
    await processChecklistJob({ jobId: job.id });
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "failed" });
    expect(state.generate).not.toHaveBeenCalled();
  });
  it("does not publish results after the worker loses its claim", async () => {
    const job = await request();
    state.generate.mockImplementationOnce(async () => {
      await fixture.db
        .update(checklistJobTable)
        .set({ claimToken: "replacement" })
        .where(eq(checklistJobTable.id, job.id));
      return response();
    });
    await expect(processChecklistJob({ jobId: job.id })).rejects.toThrow(/attempt/i);
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(1);
    expect(await fixture.db.query.checklistJobTable.findFirst()).toMatchObject({
      status: "running",
      claimToken: "replacement",
    });
  });
  it("does not publish after its lease expires during AI work", async () => {
    const job = await request();
    state.generate.mockImplementationOnce(async () => {
      await fixture.db
        .update(checklistJobTable)
        .set({ leaseUntil: new Date(0) })
        .where(eq(checklistJobTable.id, job.id));
      return response();
    });
    await expect(processChecklistJob({ jobId: job.id })).rejects.toThrow(/attempt/i);
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(1);
    expect(await getLatestChecklistJob(input)).not.toMatchObject({ status: "succeeded" });
  });
  it("keeps staff changes and uploaded files during a refresh", async () => {
    const { uploadedDocumentTable } = await import("@/db/schema");
    await fixture.db
      .update(checklistItemTable)
      .set({ origin: "staff", description: "Staff instructions" });
    await fixture.db.insert(uploadedDocumentTable).values({
      applicationId: input.applicationId,
      applicantId: input.applicantId,
      checklistItemId: input.itemId,
      fileName: "existing.pdf",
      fileKey: "existing.pdf",
      fileSize: 10,
      mimeType: "application/pdf",
    });
    const job = await request();
    await processChecklistJob({ jobId: job.id });
    expect(
      await fixture.db.query.checklistItemTable.findFirst({
        where: eq(checklistItemTable.id, input.itemId),
      }),
    ).toMatchObject({ description: "Staff instructions", origin: "staff", removedAt: null });
    expect(await fixture.db.query.uploadedDocumentTable.findMany()).toHaveLength(1);
  });
  it("retries failed AI work to a bounded limit without changing the saved checklist", async () => {
    const original = await fixture.db.query.checklistItemTable.findMany();
    const job = await request();
    state.generate.mockRejectedValue(new Error("provider failed"));
    for (let attempt = 1; attempt < 5; attempt++)
      await expect(processChecklistJob({ jobId: job.id })).rejects.toThrow(/attempt/i);
    await processChecklistJob({ jobId: job.id });
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "failed" });
    expect(await fixture.db.query.checklistItemTable.findMany()).toEqual(original);
    expect(state.generate).toHaveBeenCalledTimes(5);
  });
  it("recovers an expired worker and rejects a duplicate live delivery", async () => {
    const job = await request();
    await fixture.db
      .update(checklistJobTable)
      .set({
        status: "running",
        claimToken: "old-worker",
        leaseUntil: new Date(Date.now() + 60000),
      })
      .where(eq(checklistJobTable.id, job.id));
    await expect(processChecklistJob({ jobId: job.id })).rejects.toThrow(/running/i);
    expect(state.generate).not.toHaveBeenCalled();
    await fixture.db
      .update(checklistJobTable)
      .set({ leaseUntil: new Date(0), updatedAt: new Date(0) })
      .where(eq(checklistJobTable.id, job.id));
    expect(await recoverChecklistJobs()).toMatchObject({ enqueued: 1 });
    await processChecklistJob({ jobId: job.id });
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "succeeded" });
  });
  it("rolls back checklist writes and success status when publication fails", async () => {
    const job = await request();
    await fixture.pool.query(
      `CREATE FUNCTION reject_checklist_insert() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'write failed'; END; $$ LANGUAGE plpgsql`,
    );
    await fixture.pool.query(
      `CREATE TRIGGER reject_checklist_insert BEFORE INSERT ON checklist_item FOR EACH ROW EXECUTE FUNCTION reject_checklist_insert()`,
    );
    await expect(processChecklistJob({ jobId: job.id })).rejects.toThrow(/attempt/i);
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(1);
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "queued" });
    expect(
      (await fixture.db.query.visaApplicationTable.findFirst())?.checklistGeneratedAt,
    ).toBeNull();
  });

  it("does not publish when staff access is revoked during generation", async () => {
    const job = await request();
    state.generate.mockImplementationOnce(async () => {
      await fixture.db
        .update(agencyTeamMemberTable)
        .set({ status: "removed" })
        .where(eq(agencyTeamMemberTable.userId, input.userId));
      return response();
    });
    await processChecklistJob({ jobId: job.id });
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "failed" });
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(1);
  });

  it("does not publish when case facts change during generation", async () => {
    const job = await request();
    state.generate.mockImplementationOnce(async () => {
      await fixture.db
        .update(applicantTable)
        .set({ nationality: "Canada" })
        .where(eq(applicantTable.id, input.applicantId));
      return response();
    });
    await processChecklistJob({ jobId: job.id });
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "failed" });
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(1);
  });

  it("ends recovery after its limit", async () => {
    const job = await request();
    await fixture.db
      .update(checklistJobTable)
      .set({ recoveryCount: 3, updatedAt: new Date(0) })
      .where(eq(checklistJobTable.id, job.id));
    expect(await recoverChecklistJobs()).toMatchObject({ enqueued: 0 });
    expect(await getLatestChecklistJob(input)).toMatchObject({ status: "failed" });
  });
});
