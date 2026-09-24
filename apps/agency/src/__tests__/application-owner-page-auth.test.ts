import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindApplication,
  mockNotFound,
  mockRequireVerifiedPageSession,
} = vi.hoisted(() => ({
  mockFindApplication: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  mockRequireVerifiedPageSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

vi.mock("@/utils/auth-page", () => ({
  requireVerifiedPageSession: mockRequireVerifiedPageSession,
}));

vi.mock("@/db", () => ({
  getDB: () => ({
    query: {
      visaApplicationTable: {
        findFirst: mockFindApplication,
      },
    },
  }),
}));

import { requireApplicationOwnerPage } from "@/utils/application-page-auth";

describe("requireApplicationOwnerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the verified session when the current user owns the application", async () => {
    const session = {
      userId: "user_owner",
      user: {
        id: "user_owner",
        email: "owner@example.com",
        emailVerified: new Date(),
      },
    };
    mockRequireVerifiedPageSession.mockResolvedValue(session);
    mockFindApplication.mockResolvedValue({ userId: "user_owner" });

    await expect(requireApplicationOwnerPage("app_owner")).resolves.toEqual(session);
  });

  it("redirects anonymous users to sign-in via the shared page-session helper", async () => {
    mockRequireVerifiedPageSession.mockRejectedValue(new Error("REDIRECT:/sign-in"));

    await expect(requireApplicationOwnerPage("app_owner")).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("redirects unverified users to pending-verification via the shared page-session helper", async () => {
    mockRequireVerifiedPageSession.mockRejectedValue(
      new Error("REDIRECT:/pending-verification"),
    );

    await expect(requireApplicationOwnerPage("app_owner")).rejects.toThrow(
      "REDIRECT:/pending-verification",
    );
  });

  it("renders a 404 when the application does not exist", async () => {
    mockRequireVerifiedPageSession.mockResolvedValue({
      userId: "user_owner",
      user: {
        id: "user_owner",
        email: "owner@example.com",
        emailVerified: new Date(),
      },
    });
    mockFindApplication.mockResolvedValue(null);

    await expect(requireApplicationOwnerPage("app_missing")).rejects.toThrow("NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it("renders a 404 when the current user is not the application owner", async () => {
    mockRequireVerifiedPageSession.mockResolvedValue({
      userId: "user_member",
      user: {
        id: "user_member",
        email: "member@example.com",
        emailVerified: new Date(),
      },
    });
    mockFindApplication.mockResolvedValue({ userId: "user_owner" });

    await expect(requireApplicationOwnerPage("app_forbidden")).rejects.toThrow("NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });
});
