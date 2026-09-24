import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionFromCookie, mockRequireAdmin, mockRedirect } = vi.hoisted(() => ({
  mockGetSessionFromCookie: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
  requireAdmin: mockRequireAdmin,
}));

import {
  requireAdminPageSession,
  requirePageSession,
  requireVerifiedPageSession,
} from "@/utils/auth-page";

describe("requireVerifiedPageSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session when the user is verified", async () => {
    const session = {
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
        emailVerified: new Date(),
      },
    };
    mockGetSessionFromCookie.mockResolvedValue(session);

    await expect(requireVerifiedPageSession()).resolves.toEqual(session);
  });

  it("redirects anonymous users to sign-in", async () => {
    mockGetSessionFromCookie.mockResolvedValue(null);

    await expect(requireVerifiedPageSession()).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("redirects unverified users to pending-verification", async () => {
    mockGetSessionFromCookie.mockResolvedValue({
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
        emailVerified: null,
      },
    });

    await expect(requireVerifiedPageSession()).rejects.toThrow("REDIRECT:/pending-verification");
  });
});

describe("requirePageSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session for anonymous-or-verified-agnostic pages", async () => {
    const session = {
      userId: "user_456",
      user: {
        id: "user_456",
        email: "member@example.com",
        emailVerified: null,
      },
    };
    mockGetSessionFromCookie.mockResolvedValue(session);

    await expect(requirePageSession()).resolves.toEqual(session);
  });

  it("redirects anonymous users to sign-in", async () => {
    mockGetSessionFromCookie.mockResolvedValue(null);

    await expect(requirePageSession()).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("preserves the return target for anonymous page requests when provided", async () => {
    mockGetSessionFromCookie.mockResolvedValue(null);

    await expect(requirePageSession("/dashboard/vapp_123")).rejects.toThrow(
      "REDIRECT:/sign-in?redirect=%2Fdashboard%2Fvapp_123",
    );
  });
});

describe("requireAdminPageSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the admin session when present", async () => {
    const session = {
      userId: "admin_123",
      user: {
        id: "admin_123",
        email: "admin@example.com",
        role: "admin",
      },
    };
    mockRequireAdmin.mockResolvedValue(session);

    await expect(requireAdminPageSession()).resolves.toEqual(session);
  });

  it("redirects anonymous or non-admin page requests to the home page", async () => {
    mockRequireAdmin.mockResolvedValue(null);

    await expect(requireAdminPageSession()).rejects.toThrow("REDIRECT:/");
  });
});
