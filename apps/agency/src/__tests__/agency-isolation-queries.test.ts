import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { startTestPostgres } from "./helpers/postgres";
import { createWorkflowDatabase, seedWorkflowCase } from "./helpers/workflow-fixture";

const state = vi.hoisted(() => ({ db: vi.fn(), staff: vi.fn() }));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: state.db,
}));
vi.mock("@/server/agency-team", () => ({ requireAgencyStaff: state.staff }));
vi.mock("@/infra/kv-session", () => ({
  updateAllSessionsOfUser: vi.fn(),
  deleteAllSessionsOfUser: vi.fn(),
}));
import {
  getActiveAgencyStaffRows,
  getAgencyCaseRows,
  getAgencyCaseDetail,
  getAgencyClientsWithCounts,
  getAgencyDocuments,
  getAgencyReviewIssueRows,
  getAgencyReports,
} from "@/server/agency-data";
import { transferOrDeleteOwnedApplicationsForUser } from "@/server/application-server";
import {
  agencyTable,
  agencyTeamMemberTable,
  reviewIssueTable,
  clientReportTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema";

describe("agency query isolation against private PostgreSQL", () => {
  let cluster: ReturnType<typeof startTestPostgres>;
  let fixture: Awaited<ReturnType<typeof createWorkflowDatabase>>;
  let own: Awaited<ReturnType<typeof seedWorkflowCase>>;
  let other: Awaited<ReturnType<typeof seedWorkflowCase>>;
  let agencyId: string;
  beforeAll(() => {
    cluster = startTestPostgres();
  });
  afterAll(() => cluster.stop());
  beforeEach(async () => {
    fixture = await createWorkflowDatabase(cluster);
    state.db.mockReturnValue(fixture.db);
    own = await seedWorkflowCase({ db: fixture.db });
    other = await seedWorkflowCase({ db: fixture.db });
    const member = await fixture.db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.userId, own.userId),
    });
    agencyId = member!.agencyId!;
    state.staff.mockResolvedValue({
      session: { userId: own.userId, user: { id: own.userId } },
      staff: { agencyId, role: "admin", isAdmin: true },
    });
  });
  afterEach(async () => {
    await fixture.close();
  });

  it("scopes case searches, staff, clients, and documents before pagination", async () => {
    await fixture.db
      .update(visaApplicationTable)
      .set({ createdAt: new Date("2099-01-01") })
      .where(eq(visaApplicationTable.id, other.applicationId));
    expect(
      (await getAgencyCaseRows({ limit: 1, query: "Synthetic Applicant" })).map(
        (row) => row.application.id,
      ),
    ).toEqual([own.applicationId]);
    expect((await getActiveAgencyStaffRows()).map((row) => row.userId)).toEqual([own.userId]);
    expect(await getAgencyClientsWithCounts()).toHaveLength(1);
    const documents = await getAgencyDocuments({ limit: 1, query: "Synthetic Applicant" });
    expect(documents.map((row) => row.application.id)).toEqual([own.applicationId]);
  });

  it("scopes issues and reports to the signed-in agency", async () => {
    for (const item of [own, other]) {
      await fixture.db.insert(reviewIssueTable).values({
        applicationId: item.applicationId,
        title: "Synthetic issue",
        description: "Synthetic evidence check",
      });
      await fixture.db.insert(clientReportTable).values({
        applicationId: item.applicationId,
        summary: "Synthetic report",
        actionItems: [],
      });
    }
    expect(
      (await getAgencyReviewIssueRows({ query: "Synthetic" })).map(
        (row) => row.issue.applicationId,
      ),
    ).toEqual([own.applicationId]);
    expect(
      (await getAgencyReports({ query: "Synthetic" })).reports.map(
        (row) => row.report.applicationId,
      ),
    ).toEqual([own.applicationId]);
  });

  it("rejects another agency's case detail", async () => {
    await expect(getAgencyCaseDetail(other.applicationId)).rejects.toThrow("Case not found");
    expect((await getAgencyCaseDetail(own.applicationId)).application.id).toBe(own.applicationId);
  });

  it("does not expose legacy cases without an agency assignment", async () => {
    await fixture.db
      .update(visaApplicationTable)
      .set({ agencyId: null })
      .where(eq(visaApplicationTable.id, own.applicationId));

    expect(await getAgencyCaseRows()).toEqual([]);
    await expect(getAgencyCaseDetail(own.applicationId)).rejects.toThrow("Case not found");
  });

  async function addReplacementMember() {
    const [replacement] = await fixture.db
      .insert(userTable)
      .values({ email: "replacement@example.test", emailVerified: new Date() })
      .returning();
    await fixture.db.insert(agencyTeamMemberTable).values({
      agencyId,
      userId: replacement.id,
      email: replacement.email,
      role: "member",
      status: "active",
    });
    return replacement;
  }

  it("promotes the replacement owner to agency admin", async () => {
    const replacement = await addReplacementMember();

    await transferOrDeleteOwnedApplicationsForUser({ userId: own.userId });

    const membership = await fixture.db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.userId, replacement.id),
    });
    expect(membership).toMatchObject({ agencyId, role: "admin", status: "active" });
  });

  it("transfers an agency when its owner has no created cases", async () => {
    const replacement = await addReplacementMember();
    await fixture.db
      .update(visaApplicationTable)
      .set({ userId: replacement.id })
      .where(eq(visaApplicationTable.id, own.applicationId));

    await expect(transferOrDeleteOwnedApplicationsForUser({ userId: own.userId })).resolves.toEqual(
      { appsTransferred: 0, appsDeleted: 0 },
    );

    const agency = await fixture.db.query.agencyTable.findFirst({
      where: eq(agencyTable.id, agencyId),
    });
    expect(agency?.ownerUserId).toBe(replacement.id);
    const membership = await fixture.db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.userId, replacement.id),
    });
    expect(membership?.role).toBe("admin");
    const untouchedAgency = await fixture.db.query.agencyTable.findFirst({
      where: eq(agencyTable.ownerUserId, other.userId),
    });
    expect(untouchedAgency?.ownerUserId).toBe(other.userId);
  });

  it("transfers account-deletion cases only to staff in the same agency", async () => {
    const [replacement] = await fixture.db
      .insert(userTable)
      .values({ email: "replacement@example.test", emailVerified: new Date() })
      .returning();
    await fixture.db.insert(agencyTeamMemberTable).values({
      agencyId,
      userId: replacement.id,
      email: replacement.email,
      role: "member",
      status: "active",
    });
    await expect(transferOrDeleteOwnedApplicationsForUser({ userId: own.userId })).resolves.toEqual(
      { appsTransferred: 1, appsDeleted: 0 },
    );
    const app = await fixture.db.query.visaApplicationTable.findFirst({
      where: eq(visaApplicationTable.id, own.applicationId),
    });
    expect(app?.userId).toBe(replacement.id);
    expect(app?.agencyId).toBe(agencyId);
    const agency = await fixture.db.query.agencyTable.findFirst({
      where: eq(agencyTable.id, agencyId),
    });
    expect(agency?.ownerUserId).toBe(replacement.id);
  });
});
