import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestPostgres } from "./helpers/postgres";

const { mockGetDB, mockAgencyContext, mockMarkReady, mockValidateCsrf } = vi.hoisted(() => ({
  mockGetDB: vi.fn(),
  mockAgencyContext: vi.fn(),
  mockMarkReady: vi.fn(),
  mockValidateCsrf: vi.fn(async () => true),
}));

vi.mock("zsa", () => ({
  ZSAError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  createServerAction: () => {
    const chain = {
      input: () => chain,
      handler: (handler: (args: { input: unknown }) => unknown) => (input: unknown) =>
        handler({ input }),
    };
    return chain;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: mockGetDB,
}));
vi.mock("@/server/agency-team", () => ({
  requireAgencyStaff: mockAgencyContext,
  requireAgencyAdmin: mockAgencyContext,
}));
vi.mock("@/server/agency-review", () => ({
  invalidateAgencyReports: vi.fn(),
  getAgencyReportInvalidationQueries: () => [],
  newestEvaluationOrder: [],
  requireCurrentAgencyReview: vi.fn(),
  markAgencyCaseReady: mockMarkReady,
  syncAgencyReviewIssues: vi.fn(),
}));
vi.mock("@/server/client-reports", () => ({
  deliverClientReport: vi.fn(),
  updateClientReportRecipient: vi.fn(),
}));
vi.mock("@/infra/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/infra/csrf", () => ({ validateCsrfToken: mockValidateCsrf }));

import { getDB, getDBFromDatabase } from "@/db";
import {
  agencyTable,
  agencyClientTable,
  agencyTeamMemberTable,
  reviewIssueTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema";
import {
  addReviewIssueAction,
  assignAgencyCaseAction,
  createAgencyCaseAction,
  disableAgencyStaffAction,
  finalizeReviewAction,
  generateClientReportAction,
  updateAgencyCaseStatusAction,
  updateAgencyStaffRoleAction,
  updateReviewIssueStatusAction,
} from "@/actions/agency-case.action";

let postgres: ReturnType<typeof startTestPostgres>;
let pool: ReturnType<ReturnType<typeof startTestPostgres>["createPool"]>;
let adminPool: typeof pool;
let db: ReturnType<typeof getDB>;
const databaseName = `tenant_actions_${randomUUID().replaceAll("-", "")}`;
let agencyA: string;
let agencyB: string;
let userA: string;
let userB: string;
let caseA: string;
let caseB: string;
let memberB: string;

beforeAll(async () => {
  vi.stubEnv("DB_SQL_LOG", "false");
  postgres = startTestPostgres();
  adminPool = postgres.createPool();
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  pool = postgres.createPool(databaseName);
  const directory = new URL("../db/postgres-migrations/", import.meta.url);
  for (const filename of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await pool.query(readFileSync(new URL(filename, directory), "utf8"));
  }
  db = getDBFromDatabase(pool);
}, 30_000);

afterAll(async () => {
  await pool?.end();
  if (adminPool) {
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await adminPool.end();
  }
  postgres?.stop();
  vi.unstubAllEnvs();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await pool.query('TRUNCATE TABLE "user" CASCADE');
  const [first, second] = await db
    .insert(userTable)
    .values([
      { email: "owner-a@example.com", emailVerified: new Date() },
      { email: "owner-b@example.com", emailVerified: new Date() },
    ])
    .returning();
  userA = first.id;
  userB = second.id;
  const [firstAgency, secondAgency] = await db
    .insert(agencyTable)
    .values([
      { ownerUserId: userA, name: "Agency A" },
      { ownerUserId: userB, name: "Agency B" },
    ])
    .returning();
  agencyA = firstAgency.id;
  agencyB = secondAgency.id;
  const memberships = await db
    .insert(agencyTeamMemberTable)
    .values([
      { agencyId: agencyA, userId: userA, email: first.email, role: "admin", status: "active" },
      { agencyId: agencyB, userId: userB, email: second.email, role: "admin", status: "active" },
    ])
    .returning();
  memberB = memberships[1].id;
  const clients = await db
    .insert(agencyClientTable)
    .values([
      { agencyId: agencyA, name: "Client A", email: "shared-client@example.com" },
      { agencyId: agencyB, name: "Client B", email: "shared-client@example.com" },
    ])
    .returning();
  const common = {
    homeCountry: "Bangladesh",
    currentCountry: "Bangladesh",
    destinationCountry: "Japan",
    visaType: "Tourist",
    embassy: "Dhaka",
    agencyStatus: "intake" as const,
  };
  const cases = await db
    .insert(visaApplicationTable)
    .values([
      { ...common, agencyId: agencyA, userId: userA, clientId: clients[0].id },
      { ...common, agencyId: agencyB, userId: userB, clientId: clients[1].id },
    ])
    .returning();
  caseA = cases[0].id;
  caseB = cases[1].id;
  mockGetDB.mockReturnValue(db);
  mockAgencyContext.mockResolvedValue({
    session: { userId: userA, user: first },
    staff: { agencyId: agencyA, role: "admin", isAdmin: true },
  });
});

describe("agency actions isolate one agency from another", () => {
  it("rejects a status change for another agency's case", async () => {
    await expect(
      updateAgencyCaseStatusAction({ applicationId: caseB, status: "in_review" }),
    ).rejects.toThrow("Application not found");
    expect(
      await db.query.visaApplicationTable.findFirst({ where: eq(visaApplicationTable.id, caseB) }),
    ).toMatchObject({ agencyStatus: "intake" });
  });

  it("allows a status change within the current agency", async () => {
    await expect(
      updateAgencyCaseStatusAction({ applicationId: caseA, status: "in_review" }),
    ).resolves.toEqual({ success: true });
  });

  it("rejects a reviewer from another agency", async () => {
    await expect(
      assignAgencyCaseAction({ applicationId: caseA, reviewerId: userB }),
    ).rejects.toThrow("Reviewer not found");
  });

  it("rejects a note on another agency's case", async () => {
    await expect(
      addReviewIssueAction({
        applicationId: caseB,
        title: "Changed",
        description: "Changed elsewhere",
        severity: "low",
        clientVisible: true,
      }),
    ).rejects.toThrow("Application not found");
    expect(await db.query.reviewIssueTable.findMany()).toHaveLength(0);
  });

  it("rejects changes to another agency's issue", async () => {
    const [issue] = await db
      .insert(reviewIssueTable)
      .values({
        applicationId: caseB,
        title: "Private issue",
        description: "Private detail",
        category: "document",
      })
      .returning();
    await expect(
      updateReviewIssueStatusAction({ issueId: issue.id, status: "dismissed" }),
    ).rejects.toThrow("Application not found");
    expect(
      await db.query.reviewIssueTable.findFirst({ where: eq(reviewIssueTable.id, issue.id) }),
    ).toMatchObject({ status: "open" });
  });

  it("does not finalize another agency's case", async () => {
    await expect(finalizeReviewAction({ applicationId: caseB })).rejects.toThrow(
      "Application not found",
    );
    expect(mockMarkReady).not.toHaveBeenCalled();
  });

  it("does not prepare a report from another agency's case", async () => {
    await expect(generateClientReportAction({ applicationId: caseB })).rejects.toThrow(
      "Application not found",
    );
  });

  it("does not change another agency's staff role", async () => {
    await expect(
      updateAgencyStaffRoleAction({ staffMemberId: memberB, role: "member", csrfToken: "token" }),
    ).rejects.toThrow("Staff member not found");
    expect(
      await db.query.agencyTeamMemberTable.findFirst({
        where: eq(agencyTeamMemberTable.id, memberB),
      }),
    ).toMatchObject({ role: "admin", agencyId: agencyB });
  });

  it("does not disable another agency's staff member", async () => {
    await expect(
      disableAgencyStaffAction({ staffMemberId: memberB, csrfToken: "token" }),
    ).rejects.toThrow("Staff member not found");
    expect(
      await db.query.agencyTeamMemberTable.findFirst({
        where: eq(agencyTeamMemberTable.id, memberB),
      }),
    ).toMatchObject({ status: "active", agencyId: agencyB });
  });

  it("creates a case and reuses a client only within the current agency", async () => {
    await createAgencyCaseAction({
      clientName: "Updated A",
      clientEmail: "shared-client@example.com",
      applicantName: "Applicant A",
      homeCountry: "Bangladesh",
      currentCountry: "Bangladesh",
      destinationCountry: "Japan",
      visaType: "Tourist",
      embassy: "Dhaka",
      priority: "normal",
    });
    expect(
      await db.query.visaApplicationTable.findFirst({
        where: eq(visaApplicationTable.clientName, "Updated A"),
      }),
    ).toMatchObject({ agencyId: agencyA, userId: userA });
    const clients = await db.query.agencyClientTable.findMany();
    expect(clients.find((client) => client.agencyId === agencyA)?.name).toBe("Updated A");
    expect(clients.find((client) => client.agencyId === agencyB)?.name).toBe("Client B");
  });

  it("saves the current agency on a new client", async () => {
    await createAgencyCaseAction({
      clientName: "New Client",
      clientEmail: "new-client@example.com",
      applicantName: "New Applicant",
      homeCountry: "Bangladesh",
      currentCountry: "Bangladesh",
      destinationCountry: "Japan",
      visaType: "Tourist",
      embassy: "Dhaka",
      priority: "normal",
    });
    expect(
      await db.query.agencyClientTable.findFirst({
        where: eq(agencyClientTable.email, "new-client@example.com"),
      }),
    ).toMatchObject({ agencyId: agencyA, email: "new-client@example.com" });
  });

  it("rejects role and access changes without a valid security token", async () => {
    mockValidateCsrf.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    await expect(
      updateAgencyStaffRoleAction({ staffMemberId: memberB, role: "member", csrfToken: "bad" }),
    ).rejects.toThrow("Invalid security token");
    await expect(
      disableAgencyStaffAction({ staffMemberId: memberB, csrfToken: "bad" }),
    ).rejects.toThrow("Invalid security token");
    expect(mockAgencyContext).not.toHaveBeenCalled();
  });

  it("protects the owner from another admin", async () => {
    const [admin] = await db
      .insert(userTable)
      .values({ email: "admin@example.com", emailVerified: new Date() })
      .returning();
    await db
      .insert(agencyTeamMemberTable)
      .values({ agencyId: agencyA, userId: admin.id, email: admin.email, role: "admin" });
    const owner = await db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.userId, userA),
    });
    mockAgencyContext.mockResolvedValue({
      session: { userId: admin.id, user: admin },
      staff: { agencyId: agencyA, role: "admin", isAdmin: true },
    });
    await expect(
      updateAgencyStaffRoleAction({ staffMemberId: owner!.id, role: "member", csrfToken: "token" }),
    ).rejects.toThrow("Transfer agency ownership");
    await expect(
      disableAgencyStaffAction({ staffMemberId: owner!.id, csrfToken: "token" }),
    ).rejects.toThrow("Transfer agency ownership");
    expect(
      await db.query.agencyTeamMemberTable.findFirst({
        where: eq(agencyTeamMemberTable.id, owner!.id),
      }),
    ).toMatchObject({ role: "admin", status: "active" });
  });

  it("rejects a stale admin context after the caller loses access", async () => {
    await db
      .update(agencyTeamMemberTable)
      .set({ role: "member" })
      .where(eq(agencyTeamMemberTable.userId, userA));
    await expect(
      disableAgencyStaffAction({ staffMemberId: memberB, csrfToken: "token" }),
    ).rejects.toThrow("Your admin access has changed");
  });

  it("retains the last admin even if the agency has no owner", async () => {
    await db.update(agencyTable).set({ ownerUserId: null }).where(eq(agencyTable.id, agencyA));
    const owner = await db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.userId, userA),
    });
    await expect(
      updateAgencyStaffRoleAction({ staffMemberId: owner!.id, role: "member", csrfToken: "token" }),
    ).rejects.toThrow("Assign another admin");
    await expect(
      disableAgencyStaffAction({ staffMemberId: owner!.id, csrfToken: "token" }),
    ).rejects.toThrow("Assign another admin");
  });

  it("serializes competing admin changes and checks the waiting caller again", async () => {
    await db.update(agencyTable).set({ ownerUserId: null }).where(eq(agencyTable.id, agencyA));
    const [admin] = await db
      .insert(userTable)
      .values({ email: "competing@example.com", emailVerified: new Date() })
      .returning();
    const [secondMember] = await db
      .insert(agencyTeamMemberTable)
      .values({ agencyId: agencyA, userId: admin.id, email: admin.email, role: "admin" })
      .returning();
    const firstMember = await db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.userId, userA),
    });
    const firstUser = await db.query.userTable.findFirst({ where: eq(userTable.id, userA) });
    mockAgencyContext.mockResolvedValueOnce({
      session: { userId: userA, user: firstUser },
      staff: { agencyId: agencyA, role: "admin", isAdmin: true },
    });
    mockAgencyContext.mockResolvedValueOnce({
      session: { userId: admin.id, user: admin },
      staff: { agencyId: agencyA, role: "admin", isAdmin: true },
    });
    const results = await Promise.allSettled([
      updateAgencyStaffRoleAction({
        staffMemberId: secondMember.id,
        role: "member",
        csrfToken: "token",
      }),
      updateAgencyStaffRoleAction({
        staffMemberId: firstMember!.id,
        role: "member",
        csrfToken: "token",
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const members = await db.query.agencyTeamMemberTable.findMany({
      where: eq(agencyTeamMemberTable.agencyId, agencyA),
    });
    expect(
      members.filter((member) => member.role === "admin" && member.status === "active"),
    ).toHaveLength(1);
  });

  it("reassigns unfinished work when an admin disables a member", async () => {
    const [memberUser] = await db
      .insert(userTable)
      .values({ email: "worker@example.com", emailVerified: new Date() })
      .returning();
    const [member] = await db
      .insert(agencyTeamMemberTable)
      .values({ agencyId: agencyA, userId: memberUser.id, email: memberUser.email, role: "member" })
      .returning();
    await db
      .update(visaApplicationTable)
      .set({ assignedReviewerId: memberUser.id })
      .where(eq(visaApplicationTable.id, caseA));
    const [openIssue, closedIssue] = await db
      .insert(reviewIssueTable)
      .values([
        { applicationId: caseA, title: "Open", description: "Work", assignedToId: memberUser.id },
        {
          applicationId: caseA,
          title: "Closed",
          description: "Done",
          status: "resolved",
          assignedToId: memberUser.id,
        },
      ])
      .returning();
    await disableAgencyStaffAction({ staffMemberId: member.id, csrfToken: "token" });
    expect(
      await db.query.agencyTeamMemberTable.findFirst({
        where: eq(agencyTeamMemberTable.id, member.id),
      }),
    ).toMatchObject({ status: "disabled" });
    expect(
      await db.query.visaApplicationTable.findFirst({ where: eq(visaApplicationTable.id, caseA) }),
    ).toMatchObject({ assignedReviewerId: userA });
    expect(
      await db.query.reviewIssueTable.findFirst({ where: eq(reviewIssueTable.id, openIssue.id) }),
    ).toMatchObject({ assignedToId: userA });
    expect(
      await db.query.reviewIssueTable.findFirst({ where: eq(reviewIssueTable.id, closedIssue.id) }),
    ).toMatchObject({ assignedToId: memberUser.id });
  });
});
