import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireVerifiedEmail,
  mockFindApplication,
  mockFindApplicant,
  mockFindMembership,
  mockFindRole,
} = vi.hoisted(() => ({
  mockRequireVerifiedEmail: vi.fn(),
  mockFindApplication: vi.fn(),
  mockFindApplicant: vi.fn(),
  mockFindMembership: vi.fn(),
  mockFindRole: vi.fn(),
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
      applicantTable: {
        findFirst: mockFindApplicant,
      },
      applicationMembershipTable: {
        findFirst: mockFindMembership,
      },
      applicationRoleTable: {
        findFirst: mockFindRole,
      },
    },
  }),
}));

vi.mock("@/db/schema", () => ({
  visaApplicationTable: {
    id: "visa_application.id",
    userId: "visa_application.userId",
  },
  applicantTable: {
    applicationId: "applicant.applicationId",
    userId: "applicant.userId",
  },
  applicationMembershipTable: {
    applicationId: "application_membership.applicationId",
    userId: "application_membership.userId",
    isActive: "application_membership.isActive",
    roleId: "application_membership.roleId",
  },
  applicationRoleTable: {
    id: "application_role.id",
    applicationId: "application_role.applicationId",
    permissions: "application_role.permissions",
  },
  APPLICATION_PERMISSIONS: {
    ACCESS_APPLICATION: "access_application",
    INVITE_MEMBERS: "invite_members",
    REMOVE_MEMBERS: "remove_members",
    CHANGE_MEMBER_ROLES: "change_member_roles",
    EDIT_APPLICATION_SETTINGS: "edit_application_settings",
    DELETE_APPLICATION: "delete_application",
    CREATE_ROLES: "create_roles",
    EDIT_ROLES: "edit_roles",
    DELETE_ROLES: "delete_roles",
    ASSIGN_ROLES: "assign_roles",
    CREATE_COMPONENTS: "create_components",
    EDIT_COMPONENTS: "edit_components",
    DELETE_COMPONENTS: "delete_components",
  },
  APPLICANT_ROLE: {
    OWNER: "owner",
    ADMIN: "admin",
    MEMBER: "member",
    GUEST: "guest",
  },
  PAYMENT_STATUS: {
    PAID: "paid",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ type: "and", args }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
}));

import { hasApplicationPermission } from "@/utils/application-auth";

describe("application auth with linked applicants", () => {
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
      userId: "usr_owner",
    });
    mockFindMembership.mockResolvedValue(null);
    mockFindRole.mockResolvedValue(null);
  });

  it("grants application access to a linked applicant with member role", async () => {
    mockFindApplicant.mockResolvedValue({
      role: "member",
    });

    await expect(hasApplicationPermission("vapp_123", "access_application")).resolves.toBe(true);
  });

  it("grants admin permissions to a linked applicant with admin role", async () => {
    mockFindApplicant.mockResolvedValue({
      role: "admin",
    });

    await expect(hasApplicationPermission("vapp_123", "invite_members")).resolves.toBe(true);
  });
});
