import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDB,
  mockHashPassword,
  mockCreateSession,
  mockGenerateSessionToken,
  mockSetSessionTokenCookie,
  mockCanSignUp,
  mockGetCloudflareContext,
  mockCreateId,
  mockSendVerificationEmail,
  mockSendNewUserSignupNotificationEmail,
  mockValidateCsrfToken,
  mockIsTurnstileEnabled,
  mockLoggerError,
  mockGetIP,
  mockLinkApplicantRecordsByEmail,
  mockGetPostAuthRedirectPath,
  mockWithRateLimit,
  mockKvPut,
} = vi.hoisted(() => ({
  mockGetDB: vi.fn(),
  mockHashPassword: vi.fn(),
  mockCreateSession: vi.fn(),
  mockGenerateSessionToken: vi.fn(),
  mockSetSessionTokenCookie: vi.fn(),
  mockCanSignUp: vi.fn(),
  mockGetCloudflareContext: vi.fn(),
  mockCreateId: vi.fn(),
  mockSendVerificationEmail: vi.fn(),
  mockSendNewUserSignupNotificationEmail: vi.fn(),
  mockValidateCsrfToken: vi.fn(),
  mockIsTurnstileEnabled: vi.fn(),
  mockLoggerError: vi.fn(),
  mockGetIP: vi.fn(),
  mockLinkApplicantRecordsByEmail: vi.fn(),
  mockGetPostAuthRedirectPath: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockKvPut: vi.fn(),
}));

vi.mock("zsa", () => {
  class ZSAError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    ZSAError,
    createServerAction: () => {
      const chain = {
        input: () => chain,
        handler: (fn: (args: { input: unknown }) => unknown) => (input: unknown) =>
          fn({ input }),
      };

      return chain;
    },
  };
});

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("@/infra/password-hasher", () => ({
  hashPassword: mockHashPassword,
}));

vi.mock("@/utils/auth", () => ({
  createSession: mockCreateSession,
  generateSessionToken: mockGenerateSessionToken,
  setSessionTokenCookie: mockSetSessionTokenCookie,
  canSignUp: mockCanSignUp,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("@paralleldrive/cuid2", () => ({
  createId: mockCreateId,
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: mockGetCloudflareContext,
}));

vi.mock("@/utils/email", () => ({
  sendVerificationEmail: mockSendVerificationEmail,
  sendNewUserSignupNotificationEmail: mockSendNewUserSignupNotificationEmail,
}));

vi.mock("@/infra/with-rate-limit", () => ({
  RATE_LIMITS: {
    SIGN_UP: "sign_up",
  },
  withRateLimit: mockWithRateLimit,
}));

vi.mock("@/flags", () => ({
  isTurnstileEnabled: mockIsTurnstileEnabled,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: mockLoggerError,
  },
}));

vi.mock("@/infra/csrf", () => ({
  validateCsrfToken: mockValidateCsrfToken,
}));

vi.mock("@/server/applicant-server", () => ({
  linkApplicantRecordsByEmail: mockLinkApplicantRecordsByEmail,
}));

vi.mock("@/utils/get-IP", () => ({
  getIP: mockGetIP,
}));

vi.mock("@/utils/auth-redirect", () => ({
  getPostAuthRedirectPath: mockGetPostAuthRedirectPath,
}));

vi.mock("@/db/schema", () => ({
  userTable: {
    email: "email",
  },
}));

mockWithRateLimit.mockImplementation(async (fn: () => Promise<unknown>) => fn());

import { signUpAction } from "@/app/(auth)/sign-up/sign-up.action";

describe("signUpAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockValidateCsrfToken.mockResolvedValue(true);
    mockIsTurnstileEnabled.mockResolvedValue(false);
    mockCanSignUp.mockResolvedValue(undefined);
    mockHashPassword.mockResolvedValue("hashed-password");
    mockGenerateSessionToken.mockReturnValue("session-token");
    mockCreateSession.mockResolvedValue({
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    mockSetSessionTokenCookie.mockResolvedValue(undefined);
    mockCreateId.mockReturnValue("verify_123");
    mockSendVerificationEmail.mockResolvedValue(undefined);
    mockSendNewUserSignupNotificationEmail.mockResolvedValue(undefined);
    mockGetIP.mockResolvedValue("203.0.113.42");
    mockLinkApplicantRecordsByEmail.mockResolvedValue(undefined);
    mockGetPostAuthRedirectPath.mockReturnValue("/pending-verification");
    mockKvPut.mockResolvedValue(undefined);
    mockGetCloudflareContext.mockReturnValue({
      env: {
        NEXT_INC_CACHE_KV: {
          put: mockKvPut,
        },
      },
    });
  });

  it("notifies support when a new email signup user is created", async () => {
    const createdUser = {
      id: "usr_123",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
    };
    const mockFindFirst = vi.fn().mockResolvedValue(null);
    const mockReturning = vi.fn().mockResolvedValue([createdUser]);

    mockGetDB.mockReturnValue({
      query: {
        userTable: {
          findFirst: mockFindFirst,
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: mockReturning,
        })),
      })),
    });

    await expect(
      signUpAction({
        email: createdUser.email,
        firstName: createdUser.firstName,
        lastName: createdUser.lastName,
        password: "password123",
        agreeToTerms: true,
        captchaToken: undefined,
        csrfToken: "csrf-token",
      }),
    ).resolves.toEqual({
      success: true,
      redirectTo: "/pending-verification",
    });

    expect(mockSendVerificationEmail).toHaveBeenCalledWith({
      email: createdUser.email,
      verificationToken: "verify_123",
      username: createdUser.firstName,
    });
    expect(mockSendNewUserSignupNotificationEmail).toHaveBeenCalledWith({
      email: createdUser.email,
      name: "Jane Doe",
    });
  });
});
