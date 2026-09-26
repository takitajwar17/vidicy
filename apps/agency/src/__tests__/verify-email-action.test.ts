import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCloudflareContext,
  mockRecordMarketingEvent,
  mockUpdateAllSessionsOfUser,
  mockWithRateLimit,
  mockKvGet,
  mockKvDelete,
  mockFindUser,
  mockSetUpdate,
  mockWhereUpdate,
} = vi.hoisted(() => ({
  mockGetCloudflareContext: vi.fn(),
  mockRecordMarketingEvent: vi.fn(),
  mockUpdateAllSessionsOfUser: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockKvGet: vi.fn(),
  mockKvDelete: vi.fn(),
  mockFindUser: vi.fn(),
  mockSetUpdate: vi.fn(),
  mockWhereUpdate: vi.fn(),
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

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: mockGetCloudflareContext,
}));

vi.mock("@/server/marketing/events", () => ({
  recordMarketingEvent: mockRecordMarketingEvent,
}));

vi.mock("@/infra/kv-session", () => ({
  updateAllSessionsOfUser: mockUpdateAllSessionsOfUser,
}));

vi.mock("@/infra/with-rate-limit", () => ({
  RATE_LIMITS: {
    EMAIL: "email",
  },
  withRateLimit: mockWithRateLimit,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/schemas/verify-email.schema", () => ({
  verifyEmailSchema: {},
}));

vi.mock("@/utils/auth-utils", () => ({
  getVerificationTokenKey: (token: string) => `verification:${token}`,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("@/db/schema", () => ({
  userTable: {
    id: "id",
  },
  MARKETING_EVENT_TYPE: {
    USER_VERIFIED_EMAIL: "user_verified_email",
  },
}));

vi.mock("@/db", () => ({
  getDB: () => ({
    query: {
      userTable: {
        findFirst: mockFindUser,
      },
    },
    update: () => ({
      set: mockSetUpdate,
    }),
  }),
}));

mockSetUpdate.mockImplementation(() => ({
  where: mockWhereUpdate,
}));

mockWithRateLimit.mockImplementation(async (fn: () => Promise<unknown>) => fn());

import { verifyEmailAction } from "@/app/(auth)/verify-email/verify-email.action";

describe("verifyEmailAction behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockKvGet.mockResolvedValue(JSON.stringify({
      userId: "usr_123",
      expiresAt: "2030-01-01T00:00:00.000Z",
    }));
    mockKvDelete.mockResolvedValue(undefined);

    mockGetCloudflareContext.mockReturnValue({
      env: {
        NEXT_INC_CACHE_KV: {
          get: mockKvGet,
          delete: mockKvDelete,
        },
      },
    });

    mockFindUser.mockResolvedValue({
      id: "usr_123",
      email: "tajwar@example.com",
      firstName: "Tajwar",
    });
    mockWhereUpdate.mockResolvedValue(undefined);
    mockRecordMarketingEvent.mockResolvedValue(undefined);
    mockUpdateAllSessionsOfUser.mockResolvedValue(undefined);
  });

  it("verifies email without sending marketing email", async () => {
    const result = await verifyEmailAction({
      token: "token_123",
    });

    expect(result).toEqual({ success: true });
    expect(mockRecordMarketingEvent).toHaveBeenCalledTimes(1);
    expect(mockUpdateAllSessionsOfUser).toHaveBeenCalledWith("usr_123");
  });
});
