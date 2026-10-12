import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestPostgres } from "./helpers/postgres";
import { createWorkflowDatabase, seedWorkflowCase } from "./helpers/workflow-fixture";
import { createCollectionRequest } from "@/server/collection-requests";
import { loadReviewSnapshot } from "@/server/review-context";

describe("document collection requests", () => {
  let cluster: ReturnType<typeof startTestPostgres>;
  let fixture: Awaited<ReturnType<typeof createWorkflowDatabase>>;
  let identity: Awaited<ReturnType<typeof seedWorkflowCase>>;
  beforeAll(() => {
    cluster = startTestPostgres();
  });
  afterAll(() => cluster.stop());
  beforeEach(async () => {
    fixture = await createWorkflowDatabase(cluster);
    identity = await seedWorkflowCase({ db: fixture.db, document: false });
  });
  afterEach(async () => {
    await fixture.close();
  });
  it("prepares a file request without an empty AI evaluation or a waiting-client state", async () => {
    const snapshot = await loadReviewSnapshot({
      db: fixture.db,
      applicationId: identity.applicationId,
    });
    const report = await createCollectionRequest({
      db: fixture.db,
      ...identity,
      expectedHash: snapshot.reviewContextHash,
    });
    expect(report).toMatchObject({
      kind: "collection",
      status: "ready",
      actionItems: [expect.objectContaining({ title: "Passport" })],
    });
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toEqual([]);
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.agencyStatus).toBe("intake");
  });
  it("rejects a stale request", async () => {
    await expect(
      createCollectionRequest({ db: fixture.db, ...identity, expectedHash: "0".repeat(64) }),
    ).rejects.toThrow("changed");
    expect(await fixture.db.query.clientReportTable.findMany()).toEqual([]);
  });
});
