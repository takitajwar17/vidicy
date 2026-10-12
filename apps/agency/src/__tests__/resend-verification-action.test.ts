import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), put: vi.fn(), email: vi.fn() }));
vi.mock("zsa", () => ({
  ZSAError: class extends Error {},
  createServerAction: () => {
    const chain = {
      input: () => chain,
      handler: (handler: (args: { input: unknown }) => unknown) => (input?: unknown) =>
        handler({ input }),
    };
    return chain;
  },
}));
vi.mock("@/utils/auth", () => ({ getSessionFromCookie: mocks.session }));
vi.mock("@paralleldrive/cuid2", () => ({ createId: () => "verification-token" }));
vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: () => ({ env: { NEXT_INC_CACHE_KV: { put: mocks.put } } }),
}));
vi.mock("@/utils/email", () => ({ sendVerificationEmail: mocks.email }));
vi.mock("@/infra/with-rate-limit", () => ({
  RATE_LIMITS: { EMAIL: "email" },
  withRateLimit: async (operation: () => Promise<unknown>) => operation(),
}));
import { resendVerificationAction } from "@/app/(auth)/resend-verification.action";

describe("verification resend destination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "usr_1", email: "user@example.com", firstName: "User", emailVerified: null },
    });
  });

  it("stores the invitation destination in the replacement token", async () => {
    await resendVerificationAction({ verifiedRedirectPath: "/agency-setup?code=single-use-code" });
    expect(JSON.parse(mocks.put.mock.calls[0][1])).toMatchObject({
      userId: "usr_1",
      verifiedRedirectPath: "/agency-setup?code=single-use-code",
    });
    expect(mocks.email).toHaveBeenCalledWith(
      expect.objectContaining({ verificationToken: "verification-token" }),
    );
  });

  it("keeps existing callers with no destination working", async () => {
    await resendVerificationAction(undefined);
    expect(JSON.parse(mocks.put.mock.calls[0][1])).toMatchObject({
      userId: "usr_1",
      verifiedRedirectPath: "/dashboard",
    });
  });

  it("stores a safe default for an external destination", async () => {
    await resendVerificationAction({ verifiedRedirectPath: "/\\example.com/evil" });
    expect(JSON.parse(mocks.put.mock.calls[0][1])).toMatchObject({
      verifiedRedirectPath: "/dashboard",
    });
  });
});
