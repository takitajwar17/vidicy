import { describe, expect, it } from "vitest";
import {
  getAuthRouteHref,
  getPendingVerificationPath,
  getPostAuthRedirectPath,
  getSessionRedirectPath,
  normalizeRedirectPath,
} from "@/utils/auth-redirect";

describe("auth redirect helpers", () => {
  it("normalizes missing redirect paths to the dashboard", () => {
    expect(normalizeRedirectPath(undefined)).toBe("/dashboard");
  });

  it("rejects absolute redirect URLs and falls back to the dashboard", () => {
    expect(normalizeRedirectPath("https://example.com/evil")).toBe("/dashboard");
    expect(normalizeRedirectPath("//example.com/evil")).toBe("/dashboard");
  });

  it("builds auth route hrefs with the requested internal redirect", () => {
    expect(getAuthRouteHref("/sso/google", "/dashboard/applications/new")).toBe(
      "/sso/google?redirect=%2Fdashboard%2Fapplications%2Fnew",
    );
  });

  it("keeps the pending-verification route tied to the intended destination", () => {
    expect(getPendingVerificationPath("/dashboard/applications/new")).toBe(
      "/pending-verification?redirect=%2Fdashboard%2Fapplications%2Fnew",
    );
  });

  it("keeps the requested redirect for verified users", () => {
    expect(
      getPostAuthRedirectPath({
        isEmailVerified: true,
        verifiedRedirectPath: "/settings",
      }),
    ).toBe("/settings");
  });

  it("sends unverified users to the pending-verification page", () => {
    expect(
      getPostAuthRedirectPath({
        isEmailVerified: false,
        verifiedRedirectPath: "/settings",
      }),
    ).toBe("/pending-verification?redirect=%2Fsettings");
  });

  it("routes authenticated but unverified sessions to pending-verification", () => {
    expect(
      getSessionRedirectPath({
        session: {
          id: "session_123",
          userId: "user_123",
          expiresAt: Date.now() + 60_000,
          version: 1,
          authenticationType: "password",
          user: {
            id: "user_123",
            firstName: null,
            lastName: null,
            email: "owner@example.com",
            role: "user",
            emailVerified: null,
            googleAccountId: null,
            avatar: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            initials: "OE",
          },
        } as any,
        verifiedRedirectPath: "/dashboard/applications/new",
      }),
    ).toBe("/pending-verification?redirect=%2Fdashboard%2Fapplications%2Fnew");
  });
});
