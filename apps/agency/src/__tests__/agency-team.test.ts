import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionValidationResult } from "@/types";

const { findFirst, provision } = vi.hoisted(() => ({ findFirst: vi.fn(), provision: vi.fn() }));
vi.mock("@/db", () => ({ getDB: () => ({ query: { agencyTeamMemberTable: { findFirst } } }) }));
vi.mock("@/utils/auth", () => ({ requireVerifiedEmail: vi.fn() }));
vi.mock("@/server/agency-provisioning", () => ({ provisionAgencyMembership: provision }));
import { ensureAgencyTeamMembership } from "@/server/agency-team";

function createSession(role = "user") {
  return {
    user: {
      id: "user_1",
      firstName: "New",
      lastName: "Owner",
      email: " User@Example.com ",
      role,
      emailVerified: new Date(),
    },
  } as NonNullable<SessionValidationResult>;
}

describe("agency team access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    findFirst.mockResolvedValue(null);
  });

  it("returns the existing agency without creating another one", async () => {
    findFirst.mockResolvedValue({
      id: "member",
      agencyId: "agency_1",
      role: "member",
      status: "active",
    });
    expect(await ensureAgencyTeamMembership(createSession())).toEqual({
      agencyId: "agency_1",
      role: "member",
      isAdmin: false,
    });
    expect(provision).not.toHaveBeenCalled();
  });

  it("does not elevate a platform admin inside another agency", async () => {
    findFirst.mockResolvedValue({
      id: "member",
      agencyId: "agency_1",
      role: "member",
      status: "active",
    });
    expect(await ensureAgencyTeamMembership(createSession("admin"))).toEqual({
      agencyId: "agency_1",
      role: "member",
      isAdmin: false,
    });
  });

  it("does not enroll an unverified account", async () => {
    const session = createSession();
    session.user.emailVerified = null;
    expect(await ensureAgencyTeamMembership(session)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
    expect(provision).not.toHaveBeenCalled();
  });

  it("keeps disabled members blocked", async () => {
    findFirst.mockResolvedValue({
      id: "member",
      agencyId: "agency_1",
      role: "admin",
      status: "disabled",
    });
    expect(await ensureAgencyTeamMembership(createSession())).toBeNull();
    expect(provision).not.toHaveBeenCalled();
  });

  it("requires a new account to choose Create or Join", async () => {
    expect(await ensureAgencyTeamMembership(createSession())).toBeNull();
    expect(provision).not.toHaveBeenCalled();
  });

  it("repairs an old membership without an agency", async () => {
    findFirst.mockResolvedValue({ id: "member", agencyId: null, role: "member", status: "active" });
    provision.mockResolvedValue({ agencyId: "own_agency", role: "admin", isAdmin: true });
    expect(await ensureAgencyTeamMembership(createSession())).toMatchObject({
      agencyId: "own_agency",
    });
    expect(provision).toHaveBeenCalledOnce();
  });
});
