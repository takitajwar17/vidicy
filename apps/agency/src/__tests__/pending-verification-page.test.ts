import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionFromCookie, mockRedirect } = vi.hoisted(() => ({
  mockGetSessionFromCookie: vi.fn(),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

vi.mock("@/app/(auth)/pending-verification/pending-verification.client", () => ({
  default: ({ email }: { email: string }) => ({ type: "pending-client", props: { email } }),
}));

import PendingVerificationPage from "@/app/(auth)/pending-verification/page";

describe("PendingVerificationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects anonymous users to sign-in", async () => {
    mockGetSessionFromCookie.mockResolvedValue(null);

    await expect(
      PendingVerificationPage({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("redirects verified users to the dashboard", async () => {
    mockGetSessionFromCookie.mockResolvedValue({
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
        emailVerified: true,
      },
    });

    await expect(
      PendingVerificationPage({
        searchParams: Promise.resolve({ redirect: "/dashboard/applications/new" }),
      }),
    ).rejects.toThrow("REDIRECT:/dashboard/applications/new");
  });

  it("renders the pending-verification client for unverified users", async () => {
    mockGetSessionFromCookie.mockResolvedValue({
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
        emailVerified: false,
      },
    });

    await expect(
      PendingVerificationPage({
        searchParams: Promise.resolve({ redirect: "/dashboard/applications/new" }),
      }),
    ).resolves.toMatchObject({
      props: { email: "owner@example.com", redirectPath: "/dashboard/applications/new" },
    });
  });

  it("passes the agency invitation to the resend client", async () => {
    mockGetSessionFromCookie.mockResolvedValue({
      user: { email: "owner@example.com", emailVerified: null },
    });
    await expect(
      PendingVerificationPage({
        searchParams: Promise.resolve({ redirect: "/agency-setup?code=single-use-code" }),
      }),
    ).resolves.toMatchObject({
      props: { email: "owner@example.com", redirectPath: "/agency-setup?code=single-use-code" },
    });
  });
});
