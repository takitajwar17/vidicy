import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestPostgres } from "./helpers/postgres";
import { createWorkflowDatabase, seedWorkflowCase } from "./helpers/workflow-fixture";
import { loadReviewSnapshot } from "@/server/review-context";
import { mutateChecklistItem } from "@/server/checklist-management";

describe("staff checklist changes", () => {
  let cluster: ReturnType<typeof startTestPostgres>;
  let fixture: Awaited<ReturnType<typeof createWorkflowDatabase>>;
  let identity: Awaited<ReturnType<typeof seedWorkflowCase>>;
  beforeAll(() => {
    cluster = startTestPostgres();
  });
  afterAll(() => cluster.stop());
  beforeEach(async () => {
    fixture = await createWorkflowDatabase(cluster);
    identity = await seedWorkflowCase({ db: fixture.db });
  });
  afterEach(async () => {
    await fixture.close();
  });
  async function mutation(input: Record<string, unknown>, agencyId = identity.agencyId) {
    const snapshot = await loadReviewSnapshot({
      db: fixture.db,
      applicationId: identity.applicationId,
    });
    return mutateChecklistItem({
      db: fixture.db,
      agencyId,
      input: {
        applicationId: identity.applicationId,
        expectedHash: snapshot.reviewContextHash,
        ...input,
      },
    });
  }
  it("adds a usable required item without a confirmation step", async () => {
    await mutation({
      operation: "save",
      applicantId: identity.applicantId,
      documentName: "Funding",
      description: "Funding evidence",
      requirementType: "required",
      applicability: "applies",
      requirementCondition: "",
    });
    expect(await fixture.db.query.checklistItemTable.findMany()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentName: "Funding", isRequired: true, origin: "staff" }),
      ]),
    );
  });
  it("removes an item from the active checklist and preserves its file", async () => {
    const files = await fixture.db.query.uploadedDocumentTable.findMany();
    await mutation({ operation: "remove", itemId: identity.itemId });
    expect(
      (await loadReviewSnapshot({ db: fixture.db, applicationId: identity.applicationId }))
        .checklistItems,
    ).toEqual([]);
    expect(await fixture.db.query.uploadedDocumentTable.findMany()).toEqual(files);
    expect((await fixture.db.query.checklistItemTable.findFirst())?.removedAt).toBeInstanceOf(Date);
  });
  it("rejects another agency and stale changes", async () => {
    await expect(
      mutation({ operation: "remove", itemId: identity.itemId }, "other"),
    ).rejects.toThrow("Case not found");
    await expect(
      mutation({ operation: "remove", itemId: identity.itemId, expectedHash: "0".repeat(64) }),
    ).rejects.toThrow("changed");
    expect(
      (await loadReviewSnapshot({ db: fixture.db, applicationId: identity.applicationId }))
        .checklistItems,
    ).toHaveLength(1);
  });
});
