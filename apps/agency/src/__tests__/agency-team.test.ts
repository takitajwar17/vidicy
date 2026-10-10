import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, values, onConflictDoNothing, set, where } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
}));
vi.mock("@/db", () => ({
  getDB: () => ({
    query: { agencyTeamMemberTable: { findFirst } },
    select: () => ({ from: async () => [{ total: 0 }] }),
    insert: () => ({ values }),
    update: () => ({ set }),
  }),
}));
vi.mock("@/utils/auth", () => ({ requireVerifiedEmail: vi.fn() }));
import { ensureAgencyTeamMembership } from "@/server/agency-team";
import type { SessionValidationResult } from "@/types";

function createSession(role = "user") {
  return {
    user: { id: "user_1", email: "user@example.com", role, emailVerified: new Date() },
  } as NonNullable<SessionValidationResult>;
}

describe("agency team access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findFirst.mockResolvedValue(null);
    values.mockReturnValue({ onConflictDoNothing });
    onConflictDoNothing.mockResolvedValue([]);
    set.mockReturnValue({ where });
    where.mockResolvedValue([]);
  });

  it("lets a verified new account join as a regular member", async () => {
    await expect(ensureAgencyTeamMembership(createSession())).resolves.toEqual({
      role: "member",
      isAdmin: false,
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        email: "user@example.com",
        role: "member",
        status: "active",
      }),
    );
    expect(onConflictDoNothing).toHaveBeenCalledWith({ target: expect.anything() });
  });

  it("does not enroll an unverified account", async () => {
    const session = createSession();
    session.user.emailVerified = null;

    await expect(ensureAgencyTeamMembership(session)).resolves.toBeNull();
    expect(values).not.toHaveBeenCalled();
  });

  it("allows an existing global admin to join the agency", async () => {
    await expect(ensureAgencyTeamMembership(createSession("admin"))).resolves.toEqual({
      role: "admin",
      isAdmin: true,
    });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", role: "admin" }),
    );
  });

  it("links an active email invitation without granting admin access", async () => {
    findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "invitation", userId: null, role: "member", status: "active" });
    await expect(ensureAgencyTeamMembership(createSession())).resolves.toEqual({
      role: "member",
      isAdmin: false,
    });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", joinedAt: expect.any(Date) }),
    );
    expect(where).toHaveBeenCalledOnce();
    expect(values).not.toHaveBeenCalled();
  });

  it("keeps a suspended member out of the workspace", async () => {
    findFirst.mockResolvedValueOnce({ id: "member_1", role: "admin", status: "suspended" });
    await expect(ensureAgencyTeamMembership(createSession())).resolves.toBeNull();
    expect(values).not.toHaveBeenCalled();
  });

  it("keeps a suspended email invitation out of the workspace", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "invitation",
      userId: null,
      role: "member",
      status: "suspended",
    });

    await expect(ensureAgencyTeamMembership(createSession())).resolves.toBeNull();
    expect(values).not.toHaveBeenCalled();
  });
});
