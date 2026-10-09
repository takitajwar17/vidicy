import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionFromCookie, mockRequireAdmin } = vi.hoisted(() => ({
  mockGetSessionFromCookie: vi.fn(),
  mockRequireAdmin: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
  requireAdmin: mockRequireAdmin,
}));

import {
  isRequestFromSite,
  requireAdminRouteSession,
  requireRouteSession,
  requireSameOriginRequest,
} from "@/app/api/_utils/request-auth";

function makeRequest(url: string, headers: Record<string, string>) {
  return new Request(url, { headers });
}

describe("isRequestFromSite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an exact same-origin origin header", () => {
    expect(
      isRequestFromSite(
        makeRequest("https://vidicy.com/api/get-session", {
          origin: "https://vidicy.com",
        }),
      ),
    ).toBe(true);
  });

  it("accepts an exact same-origin referer when origin is absent", () => {
    expect(
      isRequestFromSite(
        makeRequest("https://vidicy.com/api/get-session", {
          referer: "https://vidicy.com/dashboard",
        }),
      ),
    ).toBe(true);
  });

  it("accepts same-origin requests on preview or staging hosts", () => {
    expect(
      isRequestFromSite(
        makeRequest("https://app.example.com/api/get-session", {
          origin: "https://app.example.com",
        }),
      ),
    ).toBe(true);
  });

  it("rejects a lookalike origin that only matches by substring", () => {
    expect(
      isRequestFromSite(
        makeRequest("https://vidicy.com/api/get-session", {
          origin: "https://vidicy.com.evil.example",
        }),
      ),
    ).toBe(false);
  });

  it("allows requests without origin headers", () => {
    expect(isRequestFromSite(makeRequest("https://vidicy.com/api/get-session", {}))).toBe(true);
  });
});

describe("route auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a 403 response for cross-origin requests", () => {
    const response = requireSameOriginRequest(
      makeRequest("https://vidicy.com/api/get-session", {
        origin: "https://vidicy.com.evil.example",
      }),
    );

    expect(response?.status).toBe(403);
  });

  it("returns a session when route session auth succeeds", async () => {
    mockGetSessionFromCookie.mockResolvedValue({
      userId: "user_123",
      user: { id: "user_123", email: "owner@example.com" },
    });

    await expect(requireRouteSession()).resolves.toEqual({
      session: {
        userId: "user_123",
        user: { id: "user_123", email: "owner@example.com" },
      },
    });
  });

  it("returns a 401 response when route session auth fails", async () => {
    mockGetSessionFromCookie.mockResolvedValue(null);

    const access = await requireRouteSession();

    expect("response" in access).toBe(true);
    if (!("response" in access)) {
      throw new Error("Expected auth failure response");
    }
    expect(access.response!.status).toBe(401);
  });

  it("returns a 404 response for non-admin health access", async () => {
    mockRequireAdmin.mockResolvedValue(null);

    const access = await requireAdminRouteSession();

    expect("response" in access).toBe(true);
    if (!("response" in access)) {
      throw new Error("Expected admin auth failure response");
    }
    expect(access.response!.status).toBe(404);
    expect(access.response!.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns an admin session when admin route auth succeeds", async () => {
    mockRequireAdmin.mockResolvedValue({
      userId: "admin_123",
      user: { id: "admin_123", role: "admin" },
    });

    await expect(requireAdminRouteSession()).resolves.toEqual({
      session: {
        userId: "admin_123",
        user: { id: "admin_123", role: "admin" },
      },
    });
  });
});
