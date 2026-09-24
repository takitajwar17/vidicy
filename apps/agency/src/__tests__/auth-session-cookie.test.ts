import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCookies, mockGet, mockSet } = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockGet: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

// Keep auth import lightweight for cookie option tests.
vi.mock("@/infra/kv-session", () => ({
  createKVSession: vi.fn(),
  deleteKVSession: vi.fn(),
  getKVSession: vi.fn(),
  updateKVSession: vi.fn(),
  CURRENT_SESSION_VERSION: 11,
}));

vi.mock("@/server/unread-counts", () => ({
  getCachedUnreadCount: vi.fn(async () => 0),
  getCachedAdminUnreadCount: vi.fn(async () => 0),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  setSessionTokenCookie,
  refreshSessionCookieForCrossSiteRedirect,
} from "@/utils/auth";

describe("session cookie settings", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSet.mockReset();
    mockCookies.mockReset();
    mockCookies.mockResolvedValue({
      get: mockGet,
      set: mockSet,
    });
  });

  it("writes session cookie with SameSite=Lax", async () => {
    await setSessionTokenCookie({
      token: "token_123",
      userId: "usr_abc",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });

    expect(mockSet).toHaveBeenCalledWith(
      "session",
      "usr_abc:token_123",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      }),
    );
  });

  it("re-sets existing session cookie to SameSite=Lax before cross-site redirects", async () => {
    mockGet.mockReturnValue({ value: "usr_abc:token_123" });

    const refreshed = await refreshSessionCookieForCrossSiteRedirect();

    expect(refreshed).toBe(true);
    expect(mockGet).toHaveBeenCalledWith("session");
    expect(mockSet).toHaveBeenCalledWith(
      "session",
      "usr_abc:token_123",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      }),
    );
  });

  it("does nothing when there is no existing session cookie", async () => {
    mockGet.mockReturnValue(undefined);

    const refreshed = await refreshSessionCookieForCrossSiteRedirect();

    expect(refreshed).toBe(false);
    expect(mockSet).not.toHaveBeenCalled();
  });
});
