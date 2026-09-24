import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionFromCookie, mockGetConfig } = vi.hoisted(() => ({
  mockGetSessionFromCookie: vi.fn(),
  mockGetConfig: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

vi.mock("@/flags", () => ({
  getConfig: mockGetConfig,
}));

vi.mock("@/infra/with-rate-limit", () => ({
  withRateLimit: async <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@/utils/is-prod", () => ({
  default: true,
}));

import { GET } from "@/app/api/get-session/route";

describe("GET /api/get-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionFromCookie.mockResolvedValue({
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
        emailVerified: true,
      },
    });
    mockGetConfig.mockResolvedValue({
      featureFlags: {},
    });
  });

  it("returns the session and config for an exact same-origin request", async () => {
    const response = await GET(
      new Request("https://vidicy.com/api/get-session", {
        headers: {
          origin: "https://vidicy.com",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      session: {
        userId: "user_123",
        user: {
          id: "user_123",
          email: "owner@example.com",
          emailVerified: true,
        },
      },
      config: {
        featureFlags: {},
      },
    });
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    );
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("rejects a substring-only origin match", async () => {
    const response = await GET(
      new Request("https://vidicy.com/api/get-session", {
        headers: {
          origin: "https://vidicy.com.evil.example",
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Unauthorized origin" });
    expect(mockGetSessionFromCookie).not.toHaveBeenCalled();
    expect(mockGetConfig).not.toHaveBeenCalled();
  });

  it("accepts exact same-origin requests on preview hosts", async () => {
    const response = await GET(
      new Request("https://app.example.com/api/get-session", {
        headers: {
          origin: "https://app.example.com",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockGetSessionFromCookie).toHaveBeenCalledTimes(1);
    expect(mockGetConfig).toHaveBeenCalledTimes(1);
  });
});
