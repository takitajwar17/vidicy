import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireVerifiedEmail, mockFindApplication, mockEnsureAgencyTeamMembership } =
  vi.hoisted(() => ({
    mockRequireVerifiedEmail: vi.fn(),
    mockFindApplication: vi.fn(),
    mockEnsureAgencyTeamMembership: vi.fn(),
  }));

vi.mock("react", () => ({
  cache: <T extends (...args: any[]) => any>(fn: T) => fn,
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: vi.fn(),
  requireVerifiedEmail: mockRequireVerifiedEmail,
}));

vi.mock("@/db", () => ({
  getDB: () => ({
    query: {
      visaApplicationTable: {
        findFirst: mockFindApplication,
      },
    },
  }),
}));

vi.mock("@/db/schema", () => ({
  visaApplicationTable: {
    id: "visa_application.id",
    agencyId: "visa_application.agencyId",
    trashedAt: "visa_application.trashedAt",
    clientId: "visa_application.clientId",
  },
  APPLICATION_PERMISSIONS: {
    ACCESS_APPLICATION: "access_application",
    INVITE_MEMBERS: "invite_members",
    REMOVE_MEMBERS: "remove_members",
    CHANGE_MEMBER_ROLES: "change_member_roles",
    EDIT_APPLICATION_SETTINGS: "edit_application_settings",
    DELETE_APPLICATION: "delete_application",
    CREATE_COMPONENTS: "create_components",
    EDIT_COMPONENTS: "edit_components",
    DELETE_COMPONENTS: "delete_components",
  },
  AGENCY_STAFF_ROLE: {
    ADMIN: "admin",
    MEMBER: "member",
  },
}));

vi.mock("@/server/agency-team", () => ({
  ensureAgencyTeamMembership: mockEnsureAgencyTeamMembership,
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ type: "and", conditions }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
  isNotNull: (column: unknown) => ({ type: "isNotNull", column }),
  isNull: (column: unknown) => ({ type: "isNull", column }),
}));

import { hasApplicationPermission } from "@/utils/application-auth";

describe("application auth with agency staff", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireVerifiedEmail.mockResolvedValue({
      userId: "usr_member",
      user: {
        id: "usr_member",
        emailVerified: new Date(),
      },
    });

    mockFindApplication.mockResolvedValue({
      id: "vapp_123",
      agencyId: "agency_1",
    });
  });

  it("grants agency members access to application cases", async () => {
    mockEnsureAgencyTeamMembership.mockResolvedValue({
      agencyId: "agency_1",
      role: "member",
      isAdmin: false,
    });

    await expect(hasApplicationPermission("vapp_123", "access_application")).resolves.toBe(true);
  });

  it("does not grant staff management permissions to agency members", async () => {
    mockEnsureAgencyTeamMembership.mockResolvedValue({
      agencyId: "agency_1",
      role: "member",
      isAdmin: false,
    });

    await expect(hasApplicationPermission("vapp_123", "invite_members")).resolves.toBe(false);
  });

  it("grants staff management permissions to agency admins", async () => {
    mockEnsureAgencyTeamMembership.mockResolvedValue({
      agencyId: "agency_1",
      role: "admin",
      isAdmin: true,
    });

    await expect(hasApplicationPermission("vapp_123", "invite_members")).resolves.toBe(true);
  });

  it("does not grant access through the creator row alone", async () => {
    mockRequireVerifiedEmail.mockResolvedValue({
      userId: "usr_owner",
      user: {
        id: "usr_owner",
        emailVerified: new Date(),
      },
    });
    mockEnsureAgencyTeamMembership.mockResolvedValue(null);
    mockFindApplication.mockResolvedValue({
      id: "vapp_123",
    });

    await expect(hasApplicationPermission("vapp_123", "access_application")).resolves.toBe(false);
  });

  it("denies a case from another agency even for an agency admin", async () => {
    mockEnsureAgencyTeamMembership.mockResolvedValue({
      agencyId: "agency_2",
      role: "admin",
      isAdmin: true,
    });
    await expect(hasApplicationPermission("vapp_123", "access_application")).resolves.toBe(false);
  });
});
