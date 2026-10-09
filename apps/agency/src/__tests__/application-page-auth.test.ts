import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetApplicationAccessForCurrentSession, mockNotFound, mockRedirect } = vi.hoisted(
  () => ({
    mockGetApplicationAccessForCurrentSession: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("NOT_FOUND");
    }),
    mockRedirect: vi.fn((href: string) => {
      throw new Error(`REDIRECT:${href}`);
    }),
  }),
);

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}));

vi.mock("@/utils/application-auth", () => ({
  getApplicationAccessForCurrentSession: mockGetApplicationAccessForCurrentSession,
}));

import { requireApplicationPagePermission } from "@/utils/application-page-auth";

describe("requireApplicationPagePermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session when the current user has page access", async () => {
    const session = {
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
        emailVerified: new Date(),
      },
    };
    mockGetApplicationAccessForCurrentSession.mockResolvedValue({
      hasAccess: true,
      session,
    });

    await expect(
      requireApplicationPagePermission("app_success", "access_application"),
    ).resolves.toEqual(session);
    expect(mockGetApplicationAccessForCurrentSession).toHaveBeenCalledWith(
      "app_success",
      "access_application",
    );
  });

  it("redirects to sign-in when there is no current session", async () => {
    mockGetApplicationAccessForCurrentSession.mockResolvedValue({
      hasAccess: false,
      session: null,
    });

    await expect(
      requireApplicationPagePermission("app_redirect", "access_application"),
    ).rejects.toThrow("REDIRECT:/sign-in");
    expect(mockRedirect).toHaveBeenCalledWith("/sign-in");
  });

  it("redirects unverified users to pending-verification before rendering the page", async () => {
    mockGetApplicationAccessForCurrentSession.mockResolvedValue({
      hasAccess: true,
      session: {
        userId: "user_123",
        user: {
          id: "user_123",
          email: "owner@example.com",
          emailVerified: null,
        },
      },
    });

    await expect(
      requireApplicationPagePermission("app_pending", "access_application"),
    ).rejects.toThrow("REDIRECT:/pending-verification");
    expect(mockRedirect).toHaveBeenCalledWith("/pending-verification");
  });

  it("renders a 404 when the current session lacks application access", async () => {
    mockGetApplicationAccessForCurrentSession.mockResolvedValue({
      hasAccess: false,
      session: {
        userId: "user_456",
        user: {
          id: "user_456",
          email: "collaborator@example.com",
          emailVerified: new Date(),
        },
      },
    });

    await expect(
      requireApplicationPagePermission("app_denied", "access_application"),
    ).rejects.toThrow("NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });
});
