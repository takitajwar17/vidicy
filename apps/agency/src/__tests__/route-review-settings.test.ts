import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { startTestPostgres } from "./helpers/postgres";
import { createWorkflowDatabase, seedWorkflowCase } from "./helpers/workflow-fixture";
import { applicantTable, visaApplicationTable } from "@/db/schema";
import { loadReviewSnapshot } from "@/server/review-context";
import { saveRouteReviewSettings } from "@/server/route-review-settings";

describe("route facts saved to private PostgreSQL", () => {
  let cluster: ReturnType<typeof startTestPostgres>;
  let fixture: Awaited<ReturnType<typeof createWorkflowDatabase>>;
  let seeded: Awaited<ReturnType<typeof seedWorkflowCase>>;
  beforeAll(() => {
    cluster = startTestPostgres();
  });
  afterAll(() => cluster.stop());
  beforeEach(async () => {
    fixture = await createWorkflowDatabase(cluster);
    seeded = await seedWorkflowCase({ db: fixture.db });
    await fixture.db
      .update(visaApplicationTable)
      .set({
        settings: JSON.stringify({ existing: "keep" }),
        readinessScore: 99,
        riskLevel: "low",
        agencyStatus: "ready_to_submit",
        clientReportStatus: "ready",
      })
      .where(eq(visaApplicationTable.id, seeded.applicationId));
  });
  afterEach(async () => {
    await fixture.close();
  });

  async function input() {
    const snapshot = await loadReviewSnapshot({
      db: fixture.db,
      applicationId: seeded.applicationId,
    });
    return {
      applicationId: seeded.applicationId,
      expectedHash: snapshot.reviewContextHash,
      stage: "application",
      subtype: "temporary visitor",
      applicationDate: "2026-10-22",
      facts: { purpose: "Family visit", legalRegime: "national" },
      applicants: [
        { id: seeded.applicantId, nationality: "Bangladesh", dateOfBirth: "1995-05-01" },
      ],
    };
  }
  it("preserves settings, saves personal nationality and clears stale readiness", async () => {
    const result = await saveRouteReviewSettings({
      db: fixture.db,
      agencyId: seeded.agencyId,
      input: await input(),
    });
    expect(result).toMatchObject({ saved: true });
    const app = await fixture.db.query.visaApplicationTable.findFirst();
    expect(JSON.parse(app!.settings)).toMatchObject({
      existing: "keep",
      routeReview: { stage: "application", facts: { purpose: "Family visit" } },
    });
    expect(app).toMatchObject({
      readinessScore: null,
      riskLevel: null,
      agencyStatus: "in_review",
      clientReportStatus: "draft",
    });
    expect(await fixture.db.query.applicantTable.findFirst()).toMatchObject({
      nationality: "Bangladesh",
      dateOfBirth: "1995-05-01",
    });
  });
  it("rejects another agency without changing the case", async () => {
    await expect(
      saveRouteReviewSettings({ db: fixture.db, agencyId: "other-agency", input: await input() }),
    ).rejects.toThrow("Case not found");
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.readinessScore).toBe(99);
  });
  it("rejects a stale form and preserves the newer draft", async () => {
    const stale = await input();
    await fixture.db
      .update(applicantTable)
      .set({ name: "Corrected name" })
      .where(eq(applicantTable.id, seeded.applicantId));
    await expect(
      saveRouteReviewSettings({ db: fixture.db, agencyId: seeded.agencyId, input: stale }),
    ).rejects.toThrow("changed");
    expect(JSON.parse((await fixture.db.query.visaApplicationTable.findFirst())!.settings)).toEqual(
      { existing: "keep" },
    );
  });
  it("rejects a person outside the case", async () => {
    const draft = await input();
    draft.applicants[0].id = "other-person";
    await expect(
      saveRouteReviewSettings({ db: fixture.db, agencyId: seeded.agencyId, input: draft }),
    ).rejects.toThrow("applicant");
  });
  it("rejects invalid calendar dates without writes", async () => {
    const draft = await input();
    draft.applicants[0].dateOfBirth = "2026-02-30";
    await expect(
      saveRouteReviewSettings({ db: fixture.db, agencyId: seeded.agencyId, input: draft }),
    ).rejects.toThrow();
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.readinessScore).toBe(99);
  });
  it("cannot convert submitted facts into confirmed legal findings", async () => {
    const draft = { ...(await input()), facts: { licence: { state: "confirmed", value: true } } };
    await expect(
      saveRouteReviewSettings({ db: fixture.db, agencyId: seeded.agencyId, input: draft }),
    ).rejects.toThrow();
  });
  it("can replace a legacy free-text visa with an exact catalog route", async () => {
    await saveRouteReviewSettings({
      db: fixture.db,
      agencyId: seeded.agencyId,
      input: { ...(await input()), destinationCountry: "Canada", visaType: "Express Entry" },
    });
    expect(await fixture.db.query.visaApplicationTable.findFirst()).toMatchObject({
      destinationCountry: "Canada",
      visaType: "Express Entry",
      readinessScore: null,
    });
  });
});
