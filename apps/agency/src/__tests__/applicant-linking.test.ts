import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDbUpdate, mockApplicantSet, mockApplicantWhere, mockFindUser } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockApplicantSet: vi.fn(),
  mockApplicantWhere: vi.fn(),
  mockFindUser: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDB: () => ({
    query: {
      userTable: {
        findFirst: mockFindUser,
      },
    },
    update: mockDbUpdate,
  }),
}));

vi.mock("@/db/schema", () => ({
  applicantTable: {
    email: "applicant.email",
    userId: "applicant.userId",
    name: "applicant.name",
  },
  userTable: {
    id: "user.id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ type: "and", args }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
  isNull: (value: unknown) => ({ type: "isNull", value }),
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
    });

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
  });
});
