import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { startTestPostgres } from "./helpers/postgres";
import { createWorkflowDatabase } from "./helpers/workflow-fixture";
import * as schema from "@/db/schema";
import type { SessionValidationResult } from "@/types";

const { mockGetDB, mockRequireVerifiedEmail } = vi.hoisted(() => ({
  mockGetDB: vi.fn(),
  mockRequireVerifiedEmail: vi.fn(),
}));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: mockGetDB,
}));
vi.mock("@/utils/auth", () => ({
  requireVerifiedEmail: mockRequireVerifiedEmail,
  getSessionFromCookie: mockRequireVerifiedEmail,
}));

import { provisionAgencyMembership } from "@/server/agency-provisioning";
import { ensureAgencyTeamMembership, getAgencyNameForSession } from "@/server/agency-team";
import { hasApplicationPermission } from "@/utils/application-auth";

let cluster: ReturnType<typeof startTestPostgres>;
let database: Awaited<ReturnType<typeof createWorkflowDatabase>>;

beforeAll(() => {
  vi.stubEnv("DB_SQL_LOG", "false");
  cluster = startTestPostgres();
}, 30_000);
afterAll(() => cluster?.stop());
beforeEach(async () => {
  database = await createWorkflowDatabase(cluster);
  mockGetDB.mockReturnValue(database.db);
});
afterEach(async () => {
  await database?.close();
});

async function newSession(email: string) {
  const [user] = await database.db
    .insert(schema.userTable)
    .values({ email, emailVerified: new Date() })
    .returning();
  return { userId: user.id, user } as unknown as NonNullable<SessionValidationResult>;
}

async function chooseAgency(session: NonNullable<SessionValidationResult>) {
  return provisionAgencyMembership({
    userId: session.user.id,
    email: session.user.email,
    name: "Chosen agency",
  });
}

describe("separate agencies for new accounts", () => {
  it("loads only the signed-in user's agency name and reflects a name change", async () => {
    const first = await newSession("sidebar-first@example.test");
    const second = await newSession("sidebar-second@example.test");
    const firstStaff = await chooseAgency(first);
    await chooseAgency(second);
    await database.db
      .update(schema.agencyTable)
      .set({ name: "First agency" })
      .where(eq(schema.agencyTable.id, firstStaff!.agencyId));
    expect(await getAgencyNameForSession(first)).toBe("First agency");
    expect(await getAgencyNameForSession(second)).toBe("Chosen agency");
    await database.db
      .update(schema.agencyTable)
      .set({ name: "Renamed agency" })
      .where(eq(schema.agencyTable.id, firstStaff!.agencyId));
    expect(await getAgencyNameForSession(first)).toBe("Renamed agency");
  });

  it("hides agency identity without active membership and does not create membership", async () => {
    const owner = await newSession("sidebar-owner@example.test");
    const newcomer = await newSession("sidebar-new@example.test");
    await chooseAgency(owner);
    expect(await getAgencyNameForSession(newcomer)).toBeNull();
    expect(
      await getAgencyNameForSession({ ...owner, user: { ...owner.user, emailVerified: null } }),
    ).toBeNull();
    await database.db
      .update(schema.agencyTeamMemberTable)
      .set({ status: "disabled" })
      .where(eq(schema.agencyTeamMemberTable.userId, owner.user.id));
    expect(await getAgencyNameForSession(owner)).toBeNull();
    expect(await database.db.query.agencyTable.findMany()).toHaveLength(1);
    expect(await database.db.query.agencyTeamMemberTable.findMany()).toHaveLength(1);
  });

  it("creates separate owner agencies and reuses each agency on later sign-ins", async () => {
    const first = await newSession("first@example.test");
    const second = await newSession("second@example.test");
    const firstStaff = await chooseAgency(first);
    const secondStaff = await chooseAgency(second);
    expect(firstStaff).toMatchObject({
      role: "admin",
      isAdmin: true,
      agencyId: expect.any(String),
    });
    expect(secondStaff).toMatchObject({
      role: "admin",
      isAdmin: true,
      agencyId: expect.any(String),
    });
    expect(firstStaff?.agencyId).not.toBe(secondStaff?.agencyId);
    expect(await ensureAgencyTeamMembership(first)).toEqual(firstStaff);
    expect(await ensureAgencyTeamMembership(second)).toEqual(secondStaff);
    const agencies = await database.db.query.agencyTable.findMany();
    expect(agencies).toHaveLength(2);
    expect(first.user.role).toBe("user");
  });

  it("creates only one agency during simultaneous requests", async () => {
    const session = await newSession("concurrent@example.test");
    const results = await Promise.all(Array.from({ length: 4 }, () => chooseAgency(session)));
    expect(new Set(results.map((staff) => staff?.agencyId)).size).toBe(1);
    expect(await database.db.query.agencyTable.findMany()).toHaveLength(1);
    expect(await database.db.query.agencyTeamMemberTable.findMany()).toHaveLength(1);
  });

  it("splits legacy shared memberships, cases, and mutable clients by recorded creator", async () => {
    const first = await newSession("legacy-first@example.test");
    const second = await newSession("legacy-second@example.test");
    const [client] = await database.db
      .insert(schema.agencyClientTable)
      .values({ name: "Legacy client" })
      .returning();
    for (const session of [first, second]) {
      await database.db.insert(schema.agencyTeamMemberTable).values({
        userId: session.user.id,
        email: session.user.email,
        role: "member",
        status: "active",
      });
      await database.db.insert(schema.visaApplicationTable).values({
        userId: session.user.id,
        clientId: client.id,
        assignedReviewerId: second.user.id,
        homeCountry: "Bangladesh",
        currentCountry: "Bangladesh",
        destinationCountry: "Japan",
        visaType: "Tourist",
        embassy: "Dhaka",
      });
    }
    const firstStaff = await ensureAgencyTeamMembership(first);
    const secondStaff = await ensureAgencyTeamMembership(second);
    const applications = await database.db.query.visaApplicationTable.findMany();
    const firstCase = applications.find((item) => item.userId === first.user.id)!;
    const secondCase = applications.find((item) => item.userId === second.user.id)!;
    expect(firstCase.agencyId).toBe(firstStaff?.agencyId);
    expect(secondCase.agencyId).toBe(secondStaff?.agencyId);
    expect(firstCase.clientId).not.toBe(secondCase.clientId);
    expect(firstCase.assignedReviewerId).toBeNull();
    expect(secondCase.assignedReviewerId).toBe(second.user.id);
    expect(
      (
        await database.db.query.agencyClientTable.findFirst({
          where: eq(schema.agencyClientTable.id, client.id),
        })
      )?.agencyId,
    ).toBeNull();
  });

  it("does not silently accept an email-matched staff record", async () => {
    const owner = await newSession("owner@example.test");
    const staff = await chooseAgency(owner);
    const invited = await newSession("invited@example.test");
    invited.user.role = "admin";
    await database.db.insert(schema.agencyTeamMemberTable).values({
      agencyId: staff!.agencyId,
      email: invited.user.email,
      role: "member",
      status: "active",
      invitedBy: owner.user.id,
    });
    expect(await ensureAgencyTeamMembership(invited)).toBeNull();
    expect(await database.db.query.agencyTable.findMany()).toHaveLength(1);
  });

  it("keeps disabled membership blocked", async () => {
    const session = await newSession("disabled@example.test");
    await database.db.insert(schema.agencyTeamMemberTable).values({
      userId: session.user.id,
      email: session.user.email,
      role: "member",
      status: "disabled",
    });
    expect(await ensureAgencyTeamMembership(session)).toBeNull();
    expect(await database.db.query.agencyTable.findMany()).toHaveLength(0);
  });

  it("denies another new account's case through the real permission resolver", async () => {
    const first = await newSession("case-owner@example.test");
    const second = await newSession("case-outsider@example.test");
    const firstStaff = await chooseAgency(first);
    await chooseAgency(second);
    const [client] = await database.db
      .insert(schema.agencyClientTable)
      .values({ agencyId: firstStaff!.agencyId, name: "Private client" })
      .returning();
    const [application] = await database.db
      .insert(schema.visaApplicationTable)
      .values({
        userId: first.user.id,
        agencyId: firstStaff!.agencyId,
        clientId: client.id,
        homeCountry: "Bangladesh",
        currentCountry: "Bangladesh",
        destinationCountry: "Japan",
        visaType: "Tourist",
        embassy: "Dhaka",
      })
      .returning();
    mockRequireVerifiedEmail.mockResolvedValue(first);
    expect(await hasApplicationPermission(application.id)).toBe(true);
    mockRequireVerifiedEmail.mockResolvedValue(second);
    expect(await hasApplicationPermission(application.id)).toBe(false);
  });
});
