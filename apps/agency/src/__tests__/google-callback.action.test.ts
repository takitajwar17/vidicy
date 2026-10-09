import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;

const {
  mockCookies,
  mockValidateAuthorizationCode,
  mockDecodeIdToken,
  mockGetDB,
  mockCanSignUp,
  mockCreateAndStoreSession,
  mockIsGoogleSSOEnabled,
  mockGetIP,
  mockLoggerError,
  mockLoggerWarn,
  mockSendNewUserSignupNotificationEmail,
  mockLinkApplicantRecordsByEmail,
  mockGetPostAuthRedirectPath,
  mockNormalizeRedirectPath,
  mockWithRateLimit,
} = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockValidateAuthorizationCode: vi.fn(),
  mockDecodeIdToken: vi.fn(),
  mockGetDB: vi.fn(),
  mockCanSignUp: vi.fn(),
  mockCreateAndStoreSession: vi.fn(),
  mockIsGoogleSSOEnabled: vi.fn(),
  mockGetIP: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockSendNewUserSignupNotificationEmail: vi.fn(),
  mockLinkApplicantRecordsByEmail: vi.fn(),
  mockGetPostAuthRedirectPath: vi.fn(),
  mockNormalizeRedirectPath: vi.fn(),
  mockWithRateLimit: vi.fn(),
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
        handler: (fn: (args: { input: unknown }) => unknown) => (input: unknown) => fn({ input }),
      };

      return chain;
    },
  };
});

vi.mock("@/schemas/google-sso-callback.schema", () => ({
  googleSSOCallbackSchema: {},
}));

vi.mock("@/infra/with-rate-limit", () => ({
  RATE_LIMITS: {
    GOOGLE_SSO_CALLBACK: "google_sso_callback",
  },
  withRateLimit: mockWithRateLimit,
}));

vi.mock("@/constants", () => ({
  GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME: "google-oauth-code-verifier",
  GOOGLE_OAUTH_REDIRECT_COOKIE_NAME: "google-oauth-redirect",
  GOOGLE_OAUTH_STATE_COOKIE_NAME: "google-oauth-state",
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("@/lib/sso/google-sso", () => ({
  getGoogleSSOClient: () => ({
    validateAuthorizationCode: mockValidateAuthorizationCode,
  }),
}));

vi.mock("arctic", () => ({
  decodeIdToken: mockDecodeIdToken,
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
}));

vi.mock("@/db/schema", () => ({
  userTable: {
    googleAccountId: "googleAccountId",
    email: "email",
    id: "id",
  },
}));

vi.mock("@/utils/auth", () => ({
  canSignUp: mockCanSignUp,
  createAndStoreSession: mockCreateAndStoreSession,
}));

vi.mock("@/flags", () => ({
  isGoogleSSOEnabled: mockIsGoogleSSOEnabled,
}));

vi.mock("@/utils/get-IP", () => ({
  getIP: mockGetIP,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
  },
}));

vi.mock("@/utils/email", () => ({
  sendNewUserSignupNotificationEmail: mockSendNewUserSignupNotificationEmail,
}));

vi.mock("@/server/applicant-server", () => ({
  linkApplicantRecordsByEmail: mockLinkApplicantRecordsByEmail,
}));

vi.mock("@/utils/auth-redirect", () => ({
  getPostAuthRedirectPath: mockGetPostAuthRedirectPath,
  normalizeRedirectPath: mockNormalizeRedirectPath,
}));

import { googleSSOCallbackAction } from "@/app/(auth)/sso/google/callback/google-callback.action";

describe("googleSSOCallbackAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.GOOGLE_CLIENT_ID = "google-client-id";

    mockWithRateLimit.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    mockIsGoogleSSOEnabled.mockResolvedValue(true);
    mockValidateAuthorizationCode.mockResolvedValue({
      idToken: () => "google-id-token",
    });
    mockDecodeIdToken.mockReturnValue({
      iss: "https://accounts.google.com",
      aud: "google-client-id",
      sub: "108206457500302303110",
      email: "gleecon2020@gmail.com",
      email_verified: true,
      name: "Glee Con",
      picture: "https://example.com/avatar.png",
      given_name: "Glee",
      family_name: "Con",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    mockCanSignUp.mockResolvedValue(undefined);
    mockCreateAndStoreSession.mockResolvedValue(undefined);
    mockGetIP.mockResolvedValue("2402:d000:a400:bad0:1057:3320:abd7:9029");
    mockSendNewUserSignupNotificationEmail.mockResolvedValue(undefined);
    mockLinkApplicantRecordsByEmail.mockResolvedValue(undefined);
    mockGetPostAuthRedirectPath.mockReturnValue("/dashboard");
    mockNormalizeRedirectPath.mockReturnValue("/dashboard");

    mockCookies.mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === "google-oauth-state") {
          return { value: "state_123" };
        }
        if (name === "google-oauth-code-verifier") {
          return { value: "verifier_123" };
        }
        if (name === "google-oauth-redirect") {
          return { value: "/dashboard" };
        }
        return undefined;
      }),
      delete: vi.fn(),
    });
  });

  it("creates a new user and session on the first Google sign-in", async () => {
    const createdUser = {
      id: "usr_nsopdt5c2q58qou5vvzgl0i0",
      email: "gleecon2020@gmail.com",
      firstName: "Glee",
      lastName: "Con",
      emailVerified: new Date("2026-10-11T02:50:26.053Z"),
    };
    const mockFindFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const mockReturning = vi.fn().mockResolvedValueOnce([createdUser]);

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
      googleSSOCallbackAction({
        code: "google_code_123",
        state: "state_123",
      }),
    ).resolves.toEqual({
      success: true,
      redirectTo: "/dashboard",
    });

    expect(mockFindFirst).toHaveBeenCalledTimes(2);
    expect(mockCreateAndStoreSession).toHaveBeenCalledWith(createdUser.id, "google-oauth");
    expect(mockLinkApplicantRecordsByEmail).toHaveBeenCalledWith({
      userId: createdUser.id,
      email: createdUser.email,
    });
    expect(mockSendNewUserSignupNotificationEmail).toHaveBeenCalledWith({
      email: createdUser.email,
      name: "Glee Con",
    });
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("signs in an already linked Google user without creating a new record", async () => {
    const existingUser = {
      id: "usr_existing_google_123",
      email: "gleecon2020@gmail.com",
      firstName: "Glee",
      lastName: "Con",
      emailVerified: new Date("2026-10-11T02:50:26.053Z"),
    };
    const mockFindFirst = vi.fn().mockResolvedValueOnce(existingUser);
    const mockInsert = vi.fn();

    mockGetDB.mockReturnValue({
      query: {
        userTable: {
          findFirst: mockFindFirst,
        },
      },
      insert: mockInsert,
    });

    await expect(
      googleSSOCallbackAction({
        code: "google_code_123",
        state: "state_123",
      }),
    ).resolves.toEqual({
      success: true,
      redirectTo: "/dashboard",
    });

    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(mockCreateAndStoreSession).toHaveBeenCalledWith(existingUser.id, "google-oauth");
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSendNewUserSignupNotificationEmail).not.toHaveBeenCalled();
  });

  it("skips email side effects when a new Google user has no email on the created record", async () => {
    const createdUser = {
      id: "usr_google_without_email",
      email: null,
      firstName: "Glee",
      lastName: "Con",
      emailVerified: new Date("2026-10-11T02:50:26.053Z"),
    };
    const mockFindFirst = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const mockReturning = vi.fn().mockResolvedValueOnce([createdUser]);

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
      googleSSOCallbackAction({
        code: "google_code_123",
        state: "state_123",
      }),
    ).resolves.toEqual({
      success: true,
      redirectTo: "/dashboard",
    });

    expect(mockCreateAndStoreSession).toHaveBeenCalledWith(createdUser.id, "google-oauth");
    expect(mockLinkApplicantRecordsByEmail).not.toHaveBeenCalled();
    expect(mockSendNewUserSignupNotificationEmail).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  if (originalGoogleClientId === undefined) {
    delete process.env.GOOGLE_CLIENT_ID;
    return;
  }

  process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
});
