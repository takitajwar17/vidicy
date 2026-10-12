import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionFromCookie, mockRequireAdmin, mockRedirect, mockMembership } = vi.hoisted(
  () => ({
    mockGetSessionFromCookie: vi.fn(),
    mockRequireAdmin: vi.fn(),
    mockMembership: vi.fn(),
    mockRedirect: vi.fn((href: string) => {
      throw new Error(`REDIRECT:${href}`);
    }),
  }),
);

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/server/agency-team", () => ({ ensureAgencyTeamMembership: mockMembership }));

import {
  requireAgencyPageSession,
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

  it("preserves the agency invitation through email verification", async () => {
    mockGetSessionFromCookie.mockResolvedValue({
      userId: "user_123",
      user: { id: "user_123", email: "owner@example.com", emailVerified: null },
    });
    const target = "/agency-setup?code=single-use-code&redirect=%2Fdashboard%2Fvapp_123";

    await expect(requireVerifiedPageSession(target)).rejects.toThrow(
      `REDIRECT:/pending-verification?redirect=${encodeURIComponent(target)}`,
    );
  });

  it("preserves the case destination through email verification", async () => {
    mockGetSessionFromCookie.mockResolvedValue({
      userId: "user_123",
      user: { id: "user_123", email: "owner@example.com", emailVerified: null },
    });

    await expect(requireVerifiedPageSession("/dashboard/vapp_123")).rejects.toThrow(
      "REDIRECT:/pending-verification?redirect=%2Fdashboard%2Fvapp_123",
    );
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

describe("requireAgencyPageSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionFromCookie.mockResolvedValue({
      user: { id: "user_1", emailVerified: new Date() },
    });
  });
  it("redirects verified users without membership before loading agency data", async () => {
    mockMembership.mockResolvedValue(null);
    await expect(requireAgencyPageSession("/dashboard")).rejects.toThrow(
      "REDIRECT:/agency-setup?redirect=%2Fdashboard",
    );
  });
  it("preserves the requested agency page through setup", async () => {
    mockMembership.mockResolvedValue(null);
    await expect(requireAgencyPageSession("/dashboard/reports/one")).rejects.toThrow(
      "REDIRECT:/agency-setup?redirect=%2Fdashboard%2Freports%2Fone",
    );
  });
  it("returns a verified agency member session", async () => {
    mockMembership.mockResolvedValue({ agencyId: "agency_1", role: "member", isAdmin: false });
    await expect(requireAgencyPageSession()).resolves.toMatchObject({ user: { id: "user_1" } });
  });
});
