import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  take: vi.fn(),
  write: vi.fn(),
  sessions: vi.fn(),
}));
vi.mock("zsa", () => ({
  ZSAError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  createServerAction: () => {
    const chain = {
      input: () => chain,
      handler: (fn: (args: { input: unknown }) => unknown) => (input: unknown) => fn({ input }),
    };
    return chain;
  },
}));
vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: () => ({
    env: { NEXT_INC_CACHE_KV: { get: mocks.get, put: mocks.put, delete: vi.fn() } },
  }),
}));
vi.mock("@/infra/google/kv", () => ({ cacheKV: { take: mocks.take } }));
vi.mock("@/db", () => ({
  getDB: () => ({
    query: { userTable: { findFirst: async () => ({ id: "user" }) } },
    update: () => ({ set: (values: unknown) => ({ where: () => mocks.write(values) }) }),
  }),
}));
vi.mock("@/infra/password-hasher", () => ({
  hashPassword: async ({ password }: { password: string }) => password,
}));
vi.mock("@/infra/with-rate-limit", () => ({
  withRateLimit: (fn: () => Promise<unknown>) => fn(),
  RATE_LIMITS: { RESET_PASSWORD: {} },
}));
vi.mock("@/infra/csrf", () => ({ validateCsrfToken: async () => true }));
vi.mock("@/infra/kv-session", () => ({ deleteAllSessionsOfUser: mocks.sessions }));
vi.mock("@/infra/logger", () => ({ logger: { error: vi.fn() } }));
import { resetPasswordAction } from "@/app/(auth)/reset-password/reset-password.action";

describe("single-use password reset", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it.each([
    { userId: "user", expiresAt: new Date(0).toISOString() },
    { userId: "user", expiresAt: new Date(Date.now() + 60000).toISOString(), used: true },
  ])("does not change the password with an expired or previously used token", async (token) => {
    mocks.take.mockResolvedValue(JSON.stringify(token));
    await expect(
      resetPasswordAction({
        token: "token",
        password: "new-password",
        confirmPassword: "new-password",
        csrfToken: "csrf",
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.sessions).not.toHaveBeenCalled();
  });

  it("changes the password once for concurrent uses of one token", async () => {
    const token = JSON.stringify({
      userId: "user",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    mocks.get.mockResolvedValue(token);
    let available = token as string | null;
    mocks.take.mockImplementation(async () => {
      const result = available;
      available = null;
      return result;
    });
    const results = await Promise.allSettled(
      ["first-password", "second-password"].map((password) =>
        resetPasswordAction({
          token: "token",
          password,
          confirmPassword: password,
          csrfToken: "csrf",
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(mocks.sessions).toHaveBeenCalledOnce();
  });
});
