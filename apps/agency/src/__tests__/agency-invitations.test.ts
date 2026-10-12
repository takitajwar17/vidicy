import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ZSAError } from "zsa";
import { startTestPostgres } from "./helpers/postgres";
import { createWorkflowDatabase } from "./helpers/workflow-fixture";
import * as schema from "@/db/schema";
import { hashAgencyInviteCode } from "@/lib/agency-invite-code";

const mocks = vi.hoisted(() => ({ db: vi.fn(), admin: vi.fn(), send: vi.fn() }));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: mocks.db,
}));
vi.mock("@/server/agency-team", () => ({ requireAgencyAdmin: mocks.admin }));
vi.mock("@/lib/agency-invitation-email", async (original) => ({
  ...(await original<typeof import("@/lib/agency-invitation-email")>()),
  sendAgencyInvitationEmail: mocks.send,
}));
import {
  createAgencyInvitation,
  getAgencyInvitations,
  resendAgencyInvitation,
  revokeAgencyInvitation,
} from "@/server/agency-invitations";

let cluster: ReturnType<typeof startTestPostgres>;
let fixture: Awaited<ReturnType<typeof createWorkflowDatabase>>;
let agencyId: string;
let userId: string;

beforeAll(() => {
  vi.stubEnv("DB_SQL_LOG", "false");
  cluster = startTestPostgres();
}, 30_000);
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "test-provider-key");
  vi.stubEnv("EMAIL_FROM", "invites@example.test");
  vi.stubEnv("EMAIL_FROM_NAME", "Vidicy");
  vi.stubEnv("EMAIL_REPLY_TO", "");
  vi.clearAllMocks();
  mocks.send.mockReset().mockResolvedValue({ id: "provider-message" });
  fixture = await createWorkflowDatabase(cluster);
  mocks.db.mockReturnValue(fixture.db);
  const [user] = await fixture.db
    .insert(schema.userTable)
    .values({ email: "owner@example.test", firstName: "Agency", lastName: "Owner" })
    .returning();
  const [agency] = await fixture.db
    .insert(schema.agencyTable)
    .values({ ownerUserId: user.id, name: "Agency A" })
    .returning();
  agencyId = agency.id;
  userId = user.id;
  await fixture.db.insert(schema.agencyTeamMemberTable).values({
    agencyId,
    userId,
    email: user.email,
    role: "admin",
    status: "active",
  });
  mocks.admin.mockResolvedValue({
    session: { userId: user.id, user },
    staff: { agencyId, role: "admin", isAdmin: true },
  });
});
afterEach(async () => fixture?.close());
afterAll(() => {
  cluster?.stop();
  vi.unstubAllEnvs();
});

async function readInvitation(invitationId: string) {
  const invitation = await fixture.db.query.agencyInvitationTable.findFirst({
    where: eq(schema.agencyInvitationTable.id, invitationId),
  });
  if (!invitation) throw new Error("Missing test invitation");
  return invitation;
}

async function endCooldown(invitationId: string) {
  await fixture.db
    .update(schema.agencyInvitationTable)
    .set({ updatedAt: new Date(Date.now() - 121_000) })
    .where(eq(schema.agencyInvitationTable.id, invitationId));
}

describe("agency invitation storage and delivery", () => {
  it("creates a shareable seven-day code without sending email", async () => {
    const before = Date.now();
    const result = await createAgencyInvitation();
    const invitation = await readInvitation(result.invitationId);
    expect(invitation.codeHash).toBe(hashAgencyInviteCode(result.code));
    expect(invitation.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 604_800_000);
    expect(invitation.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 604_800_000);
    expect(invitation).toMatchObject({
      agencyId,
      deliveryStatus: "not_sent",
      recipientEmail: null,
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(result.emailSent).toBe(false);
  });

  it("saves the exact recipient, message, provider receipt, and delivery status", async () => {
    const result = await createAgencyInvitation({ email: " MEMBER@Example.Test " });
    const invitation = await readInvitation(result.invitationId);
    expect(result.emailSent).toBe(true);
    expect(invitation).toMatchObject({
      recipientEmail: "member@example.test",
      deliveryStatus: "sent",
      deliveryAttempts: 1,
      providerMessageId: "provider-message",
      lastDeliveryError: null,
    });
    expect(mocks.send).toHaveBeenCalledWith({
      request: invitation.deliveryRequest,
      idempotencyKey: invitation.deliveryKey,
    });
    const [listed] = await getAgencyInvitations();
    expect(listed).toMatchObject({ id: result.invitationId, deliveryStatus: "sent" });
    expect(listed).not.toHaveProperty("deliveryRequest");
    expect(listed).not.toHaveProperty("codeHash");
    expect(new Date(listed.retryAvailableAt!).getTime()).toBe(
      invitation.updatedAt.getTime() + 120_000,
    );
  });

  it("limits automatic retries and uses the same request and key on each attempt", async () => {
    mocks.send.mockRejectedValue({ retryable: true, attempted: true, retryAfterMs: 0 });
    const result = await createAgencyInvitation({ email: "member@example.test" });
    const invitation = await readInvitation(result.invitationId);
    expect(result.emailSent).toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(
      mocks.send.mock.calls.every(
        ([input]) =>
          input.idempotencyKey === invitation.deliveryKey &&
          JSON.stringify(input.request) === JSON.stringify(invitation.deliveryRequest),
      ),
    ).toBe(true);
    expect(invitation).toMatchObject({ deliveryStatus: "failed", deliveryAttempts: 3 });
    await expect(resendAgencyInvitation({ invitationId: invitation.id })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });

  it("does not repeat permanent failures or a provider retry delay over five seconds", async () => {
    for (const failure of [
      { retryable: false, attempted: true },
      { retryable: true, attempted: true, retryAfterMs: 60_000 },
    ]) {
      mocks.send.mockRejectedValueOnce(failure);
      const result = await createAgencyInvitation({ email: "member@example.test" });
      expect((await readInvitation(result.invitationId)).deliveryAttempts).toBe(1);
    }
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("uses the same idempotency key for a manual retry of an uncertain delivery", async () => {
    mocks.send.mockRejectedValueOnce({ retryable: false, attempted: true });
    const result = await createAgencyInvitation({ email: "member@example.test" });
    const first = await readInvitation(result.invitationId);
    await endCooldown(first.id);
    await resendAgencyInvitation({ invitationId: first.id });
    const retried = await readInvitation(first.id);
    expect(retried.deliveryKey).toBe(first.deliveryKey);
    expect(retried.deliveryRequest).toEqual(first.deliveryRequest);
    expect(retried).toMatchObject({ deliveryStatus: "sent", deliveryAttempts: 2 });
  });

  it("uses a new delivery key for an explicit resend after a confirmed delivery", async () => {
    const result = await createAgencyInvitation({ email: "member@example.test" });
    const first = await readInvitation(result.invitationId);
    await endCooldown(first.id);
    expect(await resendAgencyInvitation({ invitationId: first.id })).toEqual({ emailSent: true });
    const resent = await readInvitation(first.id);
    expect(resent.deliveryKey).not.toBe(first.deliveryKey);
    expect(resent.deliveryRequest).toEqual(first.deliveryRequest);
  });

  it("claims concurrent resends once before the provider call", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const result = await createAgencyInvitation({ email: "member@example.test" });
    vi.stubEnv("RESEND_API_KEY", "test-provider-key");
    await endCooldown(result.invitationId);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.send.mockImplementationOnce(async () => {
      started();
      await gate;
      return { id: "single-message" };
    });
    const first = resendAgencyInvitation({ invitationId: result.invitationId });
    await providerStarted;
    try {
      await expect(
        resendAgencyInvitation({ invitationId: result.invitationId }),
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    } finally {
      release();
      await first;
    }
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((await readInvitation(result.invitationId)).deliveryStatus).toBe("sent");
  });

  it("can recover a missing sender before any provider request starts", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    const result = await createAgencyInvitation({ email: "member@example.test" });
    const failed = await readInvitation(result.invitationId);
    expect(failed.deliveryStartedAt).toBeNull();
    expect(mocks.send).not.toHaveBeenCalled();
    vi.stubEnv("EMAIL_FROM", "fixed@example.test");
    await endCooldown(failed.id);
    await resendAgencyInvitation({ invitationId: failed.id });
    expect((await readInvitation(failed.id)).deliveryRequest?.from).toContain("fixed@example.test");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("can retry a new resend after a preflight failure even when the first send is old", async () => {
    const result = await createAgencyInvitation({ email: "member@example.test" });
    await fixture.db
      .update(schema.agencyInvitationTable)
      .set({
        deliveryStartedAt: new Date(Date.now() - 24 * 60 * 60_000),
        updatedAt: new Date(Date.now() - 121_000),
      })
      .where(eq(schema.agencyInvitationTable.id, result.invitationId));
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await resendAgencyInvitation({ invitationId: result.invitationId })).toEqual({
      emailSent: false,
    });
    expect((await readInvitation(result.invitationId)).deliveryStartedAt).toBeNull();
    vi.stubEnv("RESEND_API_KEY", "test-provider-key");
    await endCooldown(result.invitationId);
    expect(await resendAgencyInvitation({ invitationId: result.invitationId })).toEqual({
      emailSent: true,
    });
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it("blocks an uncertain delivery after the provider idempotency window", async () => {
    mocks.send.mockRejectedValueOnce({ retryable: false, attempted: true });
    const result = await createAgencyInvitation({ email: "member@example.test" });
    await fixture.db
      .update(schema.agencyInvitationTable)
      .set({
        deliveryStartedAt: new Date(Date.now() - 24 * 60 * 60_000),
        updatedAt: new Date(Date.now() - 121_000),
      })
      .where(eq(schema.agencyInvitationTable.id, result.invitationId));
    await expect(
      resendAgencyInvitation({ invitationId: result.invitationId }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("prevents delivery or revocation from a different agency", async () => {
    const result = await createAgencyInvitation({ email: "member@example.test" });
    const [otherUser] = await fixture.db
      .insert(schema.userTable)
      .values({ email: "other@example.test" })
      .returning();
    const [otherAgency] = await fixture.db
      .insert(schema.agencyTable)
      .values({ ownerUserId: otherUser.id, name: "Agency B" })
      .returning();
    await fixture.db.insert(schema.agencyTeamMemberTable).values({
      agencyId: otherAgency.id,
      userId: otherUser.id,
      email: otherUser.email,
      role: "admin",
      status: "active",
    });
    mocks.admin.mockResolvedValue({
      session: { userId: otherUser.id, user: otherUser },
      staff: { agencyId: otherAgency.id, role: "admin", isAdmin: true },
    });
    expect(await getAgencyInvitations()).toEqual([]);
    await expect(
      resendAgencyInvitation({ invitationId: result.invitationId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      revokeAgencyInvitation({ invitationId: result.invitationId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await readInvitation(result.invitationId)).revokedAt).toBeNull();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it.each(["member", "disabled", "left"])(
    "rejects cached admin access after the caller becomes %s",
    async (state) => {
      const result = await createAgencyInvitation({ email: "member@example.test" });
      await endCooldown(result.invitationId);
      if (state === "left") {
        await fixture.db
          .delete(schema.agencyTeamMemberTable)
          .where(eq(schema.agencyTeamMemberTable.userId, userId));
      } else {
        await fixture.db
          .update(schema.agencyTeamMemberTable)
          .set(state === "member" ? { role: "member" } : { status: "disabled" })
          .where(eq(schema.agencyTeamMemberTable.userId, userId));
      }
      for (const operation of [
        () => createAgencyInvitation(),
        () => resendAgencyInvitation({ invitationId: result.invitationId }),
        () => revokeAgencyInvitation({ invitationId: result.invitationId }),
      ])
        await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await fixture.db.query.agencyInvitationTable.findMany()).toHaveLength(1);
      expect((await readInvitation(result.invitationId)).revokedAt).toBeNull();
      expect(mocks.send).toHaveBeenCalledTimes(1);
    },
  );

  it("rechecks admin access after a concurrent membership change releases the agency lock", async () => {
    const connection = await fixture.pool.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await connection.query("BEGIN");
      await connection.query("SELECT id FROM agency WHERE id = $1 FOR UPDATE", [agencyId]);
      pending = createAgencyInvitation().catch((error: unknown) => error);
      let waiting = false;
      for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
        const result = await fixture.pool.query<{ count: string }>(
          "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
        );
        waiting = Number(result.rows[0].count) > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await connection.query('UPDATE agency_team_member SET role = $1 WHERE "userId" = $2', [
        "member",
        userId,
      ]);
      await connection.query("COMMIT");
      expect(await pending).toMatchObject({ code: "FORBIDDEN" });
      expect(await fixture.db.query.agencyInvitationTable.findMany()).toEqual([]);
      expect(mocks.send).not.toHaveBeenCalled();
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
      await pending;
    }
  });

  it("rejects expired, redeemed, revoked, and code-only invitations for email delivery", async () => {
    for (const change of [
      { expiresAt: new Date(Date.now() - 1) },
      { redeemedAt: new Date() },
      { revokedAt: new Date() },
      {},
    ]) {
      const result = await createAgencyInvitation();
      if (Object.keys(change).length)
        await fixture.db
          .update(schema.agencyInvitationTable)
          .set(change)
          .where(eq(schema.agencyInvitationTable.id, result.invitationId));
      await expect(
        resendAgencyInvitation({ invitationId: result.invitationId }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("checks admin access before every invitation operation", async () => {
    mocks.admin.mockRejectedValue(new ZSAError("FORBIDDEN", "Admins only."));
    for (const operation of [
      () => createAgencyInvitation(),
      () => getAgencyInvitations(),
      () => resendAgencyInvitation({ invitationId: "any-invitation" }),
      () => revokeAgencyInvitation({ invitationId: "any-invitation" }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await fixture.db.query.agencyInvitationTable.findMany()).toEqual([]);
  });
});
