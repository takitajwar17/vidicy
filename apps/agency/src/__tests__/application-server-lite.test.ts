import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireVerifiedEmail,
  mockDbSelect,
  mockOwnedOrderBy,
  mockApplicantWhere,
  mockMembershipWhere,
  mockExtraOrderBy,
} = vi.hoisted(() => ({
  mockRequireVerifiedEmail: vi.fn(),
  mockDbSelect: vi.fn(),
  mockOwnedOrderBy: vi.fn(),
  mockApplicantWhere: vi.fn(),
  mockMembershipWhere: vi.fn(),
  mockExtraOrderBy: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({
  requireVerifiedEmail: mockRequireVerifiedEmail,
}));

vi.mock("@/db", () => ({
  getDB: () => ({
    select: mockDbSelect,
  }),
}));

vi.mock("@/db/schema", () => ({
  visaApplicationTable: {
    id: "visa_application.id",
    name: "visa_application.name",
    destinationCountry: "visa_application.destinationCountry",
    visaType: "visa_application.visaType",
    createdAt: "visa_application.createdAt",
    userId: "visa_application.userId",
    trashedAt: "visa_application.trashedAt",
  },
  applicantTable: {
    applicationId: "applicant.applicationId",
    userId: "applicant.userId",
  },
  applicationMembershipTable: {
    applicationId: "application_membership.applicationId",
    userId: "application_membership.userId",
    isActive: "application_membership.isActive",
  },
  uploadedDocumentTable: {},
  documentEvaluationTable: {},
  applicationInvitationTable: {},
  supportTicketTable: {},
  supportMessageTable: {},
  userTable: {},
  APPLICATION_PERMISSIONS: {},
  APPLICANT_ROLE: {
    OWNER: "owner",
    ADMIN: "admin",
    MEMBER: "member",
    GUEST: "guest",
  },
  MARKETING_EVENT_TYPE: {},
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ type: "and", args }),
  asc: (value: unknown) => ({ type: "asc", value }),
  count: (value?: unknown) => ({ type: "count", value }),
  desc: (value: unknown) => ({ type: "desc", value }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
  inArray: (left: unknown, right: unknown[]) => ({ type: "inArray", left, right }),
  isNull: (value: unknown) => ({ type: "isNull", value }),
}));

import { getUserApplicationsLite } from "@/server/application-server";

describe("getUserApplicationsLite", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireVerifiedEmail.mockResolvedValue({
      userId: "usr_123",
    });

    mockOwnedOrderBy.mockResolvedValue([
      {
        id: "vapp_owned",
        name: "Owned app",
        destinationCountry: "Canada",
        visaType: "Tourist",
        createdAt: new Date("2025-01-01"),
      },
    ]);

    mockApplicantWhere.mockResolvedValue([{ applicationId: "vapp_linked" }]);

    mockMembershipWhere.mockResolvedValue([
      { applicationId: "vapp_member" },
      { applicationId: "vapp_linked" },
    ]);

    mockExtraOrderBy.mockResolvedValue([
      {
        id: "vapp_linked",
        name: "Linked app",
        destinationCountry: "UK",
        visaType: "Visitor",
        createdAt: new Date("2025-01-02"),
      },
      {
        id: "vapp_member",
        name: "Member app",
        destinationCountry: "USA",
        visaType: "B1/B2",
        createdAt: new Date("2025-01-03"),
      },
    ]);

    mockDbSelect
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            orderBy: mockOwnedOrderBy,
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({
          where: mockApplicantWhere,
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({
          where: mockMembershipWhere,
        }),
      }))
      .mockImplementationOnce(() => ({
        from: () => ({
          where: () => ({
            orderBy: mockExtraOrderBy,
          }),
        }),
      }));
  });

  it("includes both linked-applicant apps and membership apps without duplicates", async () => {
    const apps = await getUserApplicationsLite();

    expect(apps.map((app) => app.id)).toEqual(["vapp_owned", "vapp_linked", "vapp_member"]);
  });
});
