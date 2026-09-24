import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireVerifiedEmail,
  mockWithRateLimit,
  mockValidateCsrfToken,
  mockUpdateAllSessionsOfUser,
  mockRevalidatePath,
  mockDbUpdate,
  mockUserSetUpdate,
  mockUserWhereUpdate,
  mockApplicantSetUpdate,
  mockApplicantWhereUpdate,
  mockUserTable,
  mockApplicantTable,
} = vi.hoisted(() => ({
  mockRequireVerifiedEmail: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockValidateCsrfToken: vi.fn(),
  mockUpdateAllSessionsOfUser: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockUserSetUpdate: vi.fn(),
  mockUserWhereUpdate: vi.fn(),
  mockApplicantSetUpdate: vi.fn(),
  mockApplicantWhereUpdate: vi.fn(),
  mockUserTable: {
    id: "user.id",
  },
  mockApplicantTable: {
    userId: "applicant.userId",
    name: "applicant.name",
  },
}));

vi.mock("zsa", () => {
  class ZSAError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    ZSAError,
    createServerAction: () => {
      const chain = {
        input: () => chain,
        handler: (fn: (args: { input: unknown }) => unknown) => (input: unknown) =>
          fn({ input }),
      };

      return chain;
    },
  };
});

vi.mock("@/db", () => ({
  getDB: () => ({
    update: mockDbUpdate,
  }),
}));

vi.mock("@/db/schema", () => ({
  userTable: mockUserTable,
  applicantTable: mockApplicantTable,
}));

vi.mock("@/utils/auth", () => ({
  requireVerifiedEmail: mockRequireVerifiedEmail,
}));

vi.mock("@/infra/with-rate-limit", () => ({
  RATE_LIMITS: {
    SETTINGS: "settings",
  },
  withRateLimit: mockWithRateLimit,
}));

vi.mock("@/infra/csrf", () => ({
  validateCsrfToken: mockValidateCsrfToken,
}));

vi.mock("@/infra/kv-session", () => ({
  updateAllSessionsOfUser: mockUpdateAllSessionsOfUser,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("@/schemas/settings.schema", () => ({
  userSettingsSchema: {},
}));

mockWithRateLimit.mockImplementation(async (fn: () => Promise<unknown>) => fn());

import { updateUserProfileAction } from "@/app/(settings)/settings/settings.action";

describe("updateUserProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockWithRateLimit.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    mockValidateCsrfToken.mockResolvedValue(true);
    mockRequireVerifiedEmail.mockResolvedValue({
      user: {
        id: "usr_123",
      },
    });
    mockUpdateAllSessionsOfUser.mockResolvedValue(undefined);
    mockUserWhereUpdate.mockResolvedValue(undefined);
    mockApplicantWhereUpdate.mockResolvedValue(undefined);

    mockUserSetUpdate.mockImplementation(() => ({
      where: mockUserWhereUpdate,
    }));
    mockApplicantSetUpdate.mockImplementation(() => ({
      where: mockApplicantWhereUpdate,
    }));

    mockDbUpdate.mockImplementation((table: unknown) => {
      if (table === mockUserTable) {
        return { set: mockUserSetUpdate };
      }

      if (table === mockApplicantTable) {
        return { set: mockApplicantSetUpdate };
      }

      throw new Error(`Unexpected table update: ${String(table)}`);
    });
  });

  it("syncs linked applicant names when the profile name changes", async () => {
    await expect(
      updateUserProfileAction({
        firstName: "Amina",
        lastName: "Rahman",
        csrfToken: "csrf_123",
      }),
    ).resolves.toEqual({ success: true });

    expect(mockDbUpdate).toHaveBeenNthCalledWith(1, mockUserTable);
    expect(mockUserSetUpdate).toHaveBeenCalledWith({
      firstName: "Amina",
      lastName: "Rahman",
    });
    expect(mockUserWhereUpdate).toHaveBeenCalledWith({
      left: "user.id",
      right: "usr_123",
    });

    expect(mockDbUpdate).toHaveBeenNthCalledWith(2, mockApplicantTable);
    expect(mockApplicantSetUpdate).toHaveBeenCalledWith({
      name: "Amina Rahman",
    });
    expect(mockApplicantWhereUpdate).toHaveBeenCalledWith({
      left: "applicant.userId",
      right: "usr_123",
    });

    expect(mockUpdateAllSessionsOfUser).toHaveBeenCalledWith("usr_123");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "layout");
  });
});
