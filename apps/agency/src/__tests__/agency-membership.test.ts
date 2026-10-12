import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { startTestPostgres } from "./helpers/postgres";
import { createWorkflowDatabase, seedWorkflowCase } from "./helpers/workflow-fixture";
import * as schema from "@/db/schema";
import type { SessionValidationResult } from "@/types";

const mocks = vi.hoisted(() => ({ db: vi.fn(), session: vi.fn(), limit: vi.fn() }));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: mocks.db,
}));
vi.mock("@/utils/auth", () => ({
  requireVerifiedEmail: mocks.session,
  getSessionFromCookie: mocks.session,
}));
vi.mock("@/infra/action-rate-limit", () => ({ checkActionRateLimit: mocks.limit }));
import { ensureAgencyTeamMembership } from "@/server/agency-team";
import {
  createAgency,
  previewAgencyInvite,
  joinAgency,
  leaveAgency,
  transferAgencyOwnership,
  updateAgencySettings,
  getAgencySettingsData,
  deleteEmptyAgency,
} from "@/server/agency-membership";
import { hashAgencyInviteCode, generateAgencyInviteCode } from "@/lib/agency-invite-code";
import { hasApplicationPermission } from "@/utils/application-auth";

let cluster: ReturnType<typeof startTestPostgres>;
let fixture: Awaited<ReturnType<typeof createWorkflowDatabase>>;
type Session = NonNullable<SessionValidationResult>;
beforeAll(() => {
  vi.stubEnv("DB_SQL_LOG", "false");
  cluster = startTestPostgres();
}, 30000);
beforeEach(async () => {
  vi.resetAllMocks();
  fixture = await createWorkflowDatabase(cluster);
  mocks.db.mockReturnValue(fixture.db);
});
afterEach(async () => fixture?.close());
afterAll(() => {
  cluster?.stop();
  vi.unstubAllEnvs();
});

async function newSession(email: string) {
  const [user] = await fixture.db
    .insert(schema.userTable)
    .values({ email, emailVerified: new Date() })
    .returning();
  return { userId: user.id, user } as unknown as Session;
}
async function owner() {
  const session = await newSession("owner@example.test");
  mocks.session.mockResolvedValue(session);
  const result = await createAgency({ name: "Test agency" });
  return { session, agencyId: result.agencyId };
}
async function invitation(
  agencyId: string,
  values: Partial<typeof schema.agencyInvitationTable.$inferInsert> = {},
) {
  const code = generateAgencyInviteCode();
  const [row] = await fixture.db
    .insert(schema.agencyInvitationTable)
    .values({
      agencyId,
      codeHash: hashAgencyInviteCode(code),
      expiresAt: new Date(Date.now() + 86400000),
      ...values,
    })
    .returning();
  return { code, row };
}
async function addMember(agencyId: string, role: "admin" | "member" = "member") {
  const session = await newSession("member@example.test");
  const [member] = await fixture.db
    .insert(schema.agencyTeamMemberTable)
    .values({
      agencyId,
      userId: session.user.id,
      email: session.user.email,
      role,
      status: "active",
    })
    .returning();
  return { session, member };
}

describe("explicit agency setup", () => {
  it("does not create or join an agency before the user chooses", async () => {
    const session = await newSession("new@example.test");
    expect(await ensureAgencyTeamMembership(session)).toBeNull();
    expect(await fixture.db.query.agencyTable.findMany()).toHaveLength(0);
    expect(await fixture.db.query.agencyTeamMemberTable.findMany()).toHaveLength(0);
  });
  it("requires a verified email", async () => {
    const session = await newSession("new@example.test");
    session.user.emailVerified = null;
    mocks.session.mockResolvedValue(session);
    await expect(createAgency({ name: "Agency" })).rejects.toThrow("Verify your email");
    expect(await fixture.db.query.agencyTable.findMany()).toHaveLength(0);
  });
  it("creates an owner and agency admin without changing the platform role", async () => {
    const { session, agencyId } = await owner();
    expect(await ensureAgencyTeamMembership(session)).toEqual({
      agencyId,
      role: "admin",
      isAdmin: true,
    });
    expect((await fixture.db.query.agencyTable.findFirst())?.ownerUserId).toBe(session.user.id);
    expect(session.user.role).toBe("user");
    await expect(createAgency({ name: "Second agency" })).rejects.toThrow("already belong");
  });
  it("allows only one agency when creation requests arrive together", async () => {
    mocks.session.mockResolvedValue(await newSession("new@example.test"));
    const results = await Promise.allSettled([
      createAgency({ name: "First" }),
      createAgency({ name: "Second" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await fixture.db.query.agencyTable.findMany()).toHaveLength(1);
  });
  it("previews the agency without enrolling the user and joins as a member", async () => {
    const { agencyId } = await owner();
    const { code } = await invitation(agencyId);
    const session = await newSession("new@example.test");
    mocks.session.mockResolvedValue(session);
    expect(await previewAgencyInvite({ code })).toMatchObject({
      agencyName: "Test agency",
      expiresAt: expect.any(String),
    });
    expect(await ensureAgencyTeamMembership(session)).toBeNull();
    await joinAgency({ code });
    expect(await ensureAgencyTeamMembership(session)).toEqual({
      agencyId,
      role: "member",
      isAdmin: false,
    });
    await expect(createAgency({ name: "Another" })).rejects.toThrow("already belong");
  });
  it.each(["expired", "revoked", "used", "wrong email"])(
    "rejects an invitation that is %s",
    async (kind) => {
      const { agencyId, session: creator } = await owner();
      const { code } = await invitation(
        agencyId,
        kind === "expired"
          ? { expiresAt: new Date(0) }
          : kind === "revoked"
            ? { revokedAt: new Date() }
            : kind === "used"
              ? { redeemedAt: new Date(), redeemedById: creator.user.id }
              : { recipientEmail: "other@example.test" },
      );
      mocks.session.mockResolvedValue(await newSession("new@example.test"));
      await expect(joinAgency({ code })).rejects.toThrow("invite code");
      expect(await fixture.db.query.agencyTeamMemberTable.findMany()).toHaveLength(1);
    },
  );
  it("allows one redemption when two users redeem the same code together", async () => {
    const { agencyId } = await owner();
    const { code } = await invitation(agencyId);
    const first = await newSession("first@example.test"),
      second = await newSession("second@example.test");
    mocks.session.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const results = await Promise.allSettled([joinAgency({ code }), joinAgency({ code })]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await fixture.db.query.agencyTeamMemberTable.findMany()).toHaveLength(2);
  });
  it("prevents a create and join race from adding a user to two agencies", async () => {
    const { agencyId } = await owner();
    const { code } = await invitation(agencyId);
    mocks.session.mockResolvedValue(await newSession("new@example.test"));
    const results = await Promise.allSettled([
      createAgency({ name: "Other" }),
      joinAgency({ code }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await fixture.db.query.agencyTeamMemberTable.findMany()).toHaveLength(2);
  });
  it("does not silently accept an old email invitation", async () => {
    const { agencyId } = await owner();
    const session = await newSession("new@example.test");
    await fixture.db
      .insert(schema.agencyTeamMemberTable)
      .values({ agencyId, email: session.user.email, role: "member" });
    expect(await ensureAgencyTeamMembership(session)).toBeNull();
    mocks.session.mockResolvedValue(session);
    const created = await createAgency({ name: "My choice" });
    expect(created.agencyId).not.toBe(agencyId);
  });
});

describe("agency settings and leaving", () => {
  it("allows members to read settings and denies changes", async () => {
    const { agencyId } = await owner();
    const { session } = await addMember(agencyId);
    mocks.session.mockResolvedValue(session);
    expect((await getAgencySettingsData()).agency.name).toBe("Test agency");
    await expect(updateAgencySettings({ name: "Changed" })).rejects.toThrow("Only agency admins");
  });
  it("requires ownership transfer before an owner leaves", async () => {
    await owner();
    await expect(leaveAgency()).rejects.toThrow("Transfer agency ownership");
  });
  it("transfers ownership only to an active member of the same agency", async () => {
    const { agencyId, session: previousOwner } = await owner();
    const { session, member } = await addMember(agencyId);
    await expect(transferAgencyOwnership({ memberId: "missing" })).rejects.toThrow(
      "Choose another active member",
    );
    await transferAgencyOwnership({ memberId: member.id });
    expect((await fixture.db.query.agencyTable.findFirst())?.ownerUserId).toBe(session.user.id);
    expect(await ensureAgencyTeamMembership(session)).toMatchObject({ role: "admin" });
    mocks.session.mockResolvedValue(previousOwner);
    await leaveAgency();
    expect(await ensureAgencyTeamMembership(previousOwner)).toBeNull();
    await createAgency({ name: "New agency after leaving" });
  });
  it("ends access on leave, retains records, and reassigns unfinished work", async () => {
    const seeded = await seedWorkflowCase({ db: fixture.db });
    const { session } = await addMember(seeded.agencyId);
    await fixture.db
      .update(schema.visaApplicationTable)
      .set({ assignedReviewerId: session.user.id })
      .where(eq(schema.visaApplicationTable.id, seeded.applicationId));
    const [issue] = await fixture.db
      .insert(schema.reviewIssueTable)
      .values({
        applicationId: seeded.applicationId,
        applicantId: seeded.applicantId,
        title: "Check passport",
        description: "Review",
        assignedToId: session.user.id,
        severity: "medium",
        source: "reviewer",
        status: "open",
      })
      .returning();
    mocks.session.mockResolvedValue(session);
    expect(await hasApplicationPermission(seeded.applicationId)).toBe(true);
    await leaveAgency();
    expect(await hasApplicationPermission(seeded.applicationId)).toBe(false);
    expect(await fixture.db.query.visaApplicationTable.findFirst()).toMatchObject({
      agencyId: seeded.agencyId,
      assignedReviewerId: seeded.userId,
    });
    expect(
      await fixture.db.query.reviewIssueTable.findFirst({
        where: eq(schema.reviewIssueTable.id, issue.id),
      }),
    ).toMatchObject({ assignedToId: seeded.userId });
    expect(await fixture.db.query.agencyClientTable.findMany()).toHaveLength(1);
    expect(await ensureAgencyTeamMembership(session)).toBeNull();
  });
  it("lets disabled members release their own membership without granting workspace access", async () => {
    const { agencyId } = await owner();
    const { session, member } = await addMember(agencyId);
    await fixture.db
      .update(schema.agencyTeamMemberTable)
      .set({ status: "disabled" })
      .where(eq(schema.agencyTeamMemberTable.id, member.id));
    mocks.session.mockResolvedValue(session);
    await expect(createAgency({ name: "Other" })).rejects.toThrow("disabled");
    await expect(getAgencySettingsData()).rejects.toThrow("not a member");
    await leaveAgency();
    expect(await ensureAgencyTeamMembership(session)).toBeNull();
    await expect(createAgency({ name: "Other" })).resolves.toMatchObject({ success: true });
  });
  it("preserves an agency with case records when deletion is requested", async () => {
    const seeded = await seedWorkflowCase({ db: fixture.db });
    const user = await fixture.db.query.userTable.findFirst({
      where: eq(schema.userTable.id, seeded.userId),
    });
    mocks.session.mockResolvedValue({ userId: user!.id, user });
    await expect(deleteEmptyAgency()).rejects.toThrow("Only an empty agency");
    expect(await fixture.db.query.visaApplicationTable.findMany()).toHaveLength(1);
  });
});
