import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDbUpdate,
  mockApplicantSet,
  mockApplicantWhere,
  mockFindUser,
  mockFindMember,
  mockFindCases,
} = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockApplicantSet: vi.fn(),
  mockApplicantWhere: vi.fn(),
  mockFindUser: vi.fn(),
  mockFindMember: vi.fn(),
  mockFindCases: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDB: () => ({
    query: {
      userTable: {
        findFirst: mockFindUser,
      },
      agencyTeamMemberTable: { findFirst: mockFindMember },
      visaApplicationTable: { findMany: mockFindCases },
    },
    update: mockDbUpdate,
  }),
}));

vi.mock("@/db/schema", () => ({
  applicantTable: {
    email: "applicant.email",
    userId: "applicant.userId",
    name: "applicant.name",
    applicationId: "applicant.applicationId",
  },
  userTable: {
    id: "user.id",
  },
  agencyTeamMemberTable: { userId: "member.userId", status: "member.status" },
  visaApplicationTable: { agencyId: "application.agencyId" },
  AGENCY_STAFF_STATUS: { ACTIVE: "active" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ type: "and", args }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
  isNull: (value: unknown) => ({ type: "isNull", value }),
  inArray: (value: unknown, values: unknown[]) => ({ type: "inArray", value, values }),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

import { linkApplicantRecordsByEmail } from "@/server/applicant-server";

describe("linkApplicantRecordsByEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFindUser.mockResolvedValue({
      firstName: "Amina",
      lastName: "Rahman",
      email: "amina@example.com",
      emailVerified: new Date(),
    });
    mockFindMember.mockResolvedValue({ agencyId: "agency_1" });
    mockFindCases.mockResolvedValue([{ id: "case_1" }]);

    mockApplicantSet.mockImplementation(() => ({
      where: mockApplicantWhere,
    }));

    mockDbUpdate.mockReturnValue({
      set: mockApplicantSet,
    });
  });

  it("syncs the linked applicant name from the user profile", async () => {
    await linkApplicantRecordsByEmail({
      userId: "usr_123",
      email: "Amina@example.com",
    });

    expect(mockFindUser).toHaveBeenCalledTimes(1);
    expect(mockApplicantSet).toHaveBeenCalledWith({
      userId: "usr_123",
      name: "Amina Rahman",
    });
    expect(mockFindCases).toHaveBeenCalledWith({
      where: { type: "eq", left: "application.agencyId", right: "agency_1" },
      columns: { id: true },
    });
    expect(mockApplicantWhere).toHaveBeenCalledWith({
      type: "and",
      args: [
        { type: "eq", left: "applicant.email", right: "amina@example.com" },
        { type: "isNull", value: "applicant.userId" },
        { type: "inArray", value: "applicant.applicationId", values: ["case_1"] },
      ],
    });
  });

  it("does not link an unverified signup to existing applicants", async () => {
    mockFindUser.mockResolvedValue({ email: "amina@example.com", emailVerified: null });
    await linkApplicantRecordsByEmail({ userId: "usr_123", email: "amina@example.com" });
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockFindMember).not.toHaveBeenCalled();
  });

  it("does not link another email even when the account is verified", async () => {
    await linkApplicantRecordsByEmail({ userId: "usr_123", email: "other@example.com" });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("does not link applicants before an agency exists", async () => {
    mockFindMember.mockResolvedValue(null);
    await linkApplicantRecordsByEmail({ userId: "usr_123", email: "amina@example.com" });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("does not link legacy membership without an agency", async () => {
    mockFindMember.mockResolvedValue({ agencyId: null });
    await linkApplicantRecordsByEmail({ userId: "usr_123", email: "amina@example.com" });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("does not link another agency's applicants when this agency has no cases", async () => {
    mockFindCases.mockResolvedValue([]);
    await linkApplicantRecordsByEmail({ userId: "usr_123", email: "amina@example.com" });
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
