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

  it("returns a service error when a session read fails", async () => {
    mockGetSessionFromCookie.mockRejectedValue(new Error("Private cache connection details"));
    const response = await GET(new Request("http://localhost:3000/api/get-session"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({ session: null, config: { featureFlags: {} } });
  });

  it("returns a successful empty session after sign-out or expiry", async () => {
    mockGetSessionFromCookie.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost:3000/api/get-session"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ session: null, config: { featureFlags: {} } });
  });

  it.each(["https://app.example.com", "http://localhost:3000"])(
    "accepts exact same-origin requests on %s",
    async (origin) => {
      const response = await GET(
        new Request(`${origin}/api/get-session`, {
          headers: {
            origin,
          },
        }),
      );

      expect(response.status).toBe(200);
      expect(mockGetSessionFromCookie).toHaveBeenCalledTimes(1);
      expect(mockGetConfig).toHaveBeenCalledTimes(1);
    },
  );
});
