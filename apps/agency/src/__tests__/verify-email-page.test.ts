import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/utils/auth", () => ({ getSessionFromCookie: mocks.session }));
vi.mock("@/app/(auth)/verify-email/verify-email.client", () => ({ default: () => null }));
import VerifyEmailPage from "@/app/(auth)/verify-email/page";

describe("verification page destination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an already verified account to the invitation", async () => {
    mocks.session.mockResolvedValue({ user: { emailVerified: new Date() } });
    await expect(
      VerifyEmailPage({
        searchParams: Promise.resolve({ redirect: "/agency-setup?code=single-use-code" }),
      }),
    ).rejects.toThrow("REDIRECT:/agency-setup?code=single-use-code");
  });

  it.each(["https://example.com/evil", "//example.com/evil", "/\\example.com/evil"])(
    "rejects unsafe already verified destination %s",
    async (redirect) => {
      mocks.session.mockResolvedValue({ user: { emailVerified: new Date() } });
      await expect(
        VerifyEmailPage({ searchParams: Promise.resolve({ redirect }) }),
      ).rejects.toThrow("REDIRECT:/dashboard");
    },
  );

  it("preserves the invitation when an unverified account has no token", async () => {
    mocks.session.mockResolvedValue({ user: { emailVerified: null } });
    await expect(
      VerifyEmailPage({
        searchParams: Promise.resolve({ redirect: "/agency-setup?code=single-use-code" }),
      }),
    ).rejects.toThrow(
      "REDIRECT:/pending-verification?redirect=%2Fagency-setup%3Fcode%3Dsingle-use-code",
    );
  });
});
