import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireVerifiedEmail,
  mockGetSessionFromCookie,
  mockDeleteKVSession,
  mockWithRateLimit,
} = vi.hoisted(() => ({
  mockRequireVerifiedEmail: vi.fn(),
  mockGetSessionFromCookie: vi.fn(),
  mockDeleteKVSession: vi.fn(),
  mockWithRateLimit: vi.fn(),
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

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
  requireVerifiedEmail: mockRequireVerifiedEmail,
}));

vi.mock("@/infra/kv-session", () => ({
  getAllSessionIdsOfUser: vi.fn(),
  getKVSession: vi.fn(),
  deleteKVSession: mockDeleteKVSession,
}));

vi.mock("@/infra/with-rate-limit", () => ({
  RATE_LIMITS: {
    SETTINGS: "settings",
    DELETE_SESSION: "delete_session",
  },
  withRateLimit: mockWithRateLimit,
}));

mockWithRateLimit.mockImplementation(async (fn: () => Promise<unknown>) => fn());

import { deleteSessionAction } from "@/app/(settings)/settings/sessions/sessions.action";
import { ZSAError } from "zsa";

describe("deleteSessionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWithRateLimit.mockImplementation(async (fn: () => Promise<unknown>) => fn());
  });

  it("requires a verified email before deleting a session", async () => {
    mockRequireVerifiedEmail.mockRejectedValue(
      new ZSAError("FORBIDDEN", "Please verify your email first"),
    );
    mockGetSessionFromCookie.mockResolvedValue({
      user: { id: "usr_123" },
    });

    await expect(
      deleteSessionAction({
        sessionId: "sess_456",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Please verify your email first",
    });

    expect(mockRequireVerifiedEmail).toHaveBeenCalledTimes(1);
    expect(mockGetSessionFromCookie).not.toHaveBeenCalled();
    expect(mockDeleteKVSession).not.toHaveBeenCalled();
  });

  it("deletes the requested session for a verified user", async () => {
    mockRequireVerifiedEmail.mockResolvedValue({
      user: { id: "usr_123", emailVerified: true },
    });

    await expect(
      deleteSessionAction({
        sessionId: "sess_456",
      }),
    ).resolves.toEqual({ success: true });

    expect(mockRequireVerifiedEmail).toHaveBeenCalledTimes(1);
    expect(mockDeleteKVSession).toHaveBeenCalledWith("sess_456", "usr_123");
  });
});
