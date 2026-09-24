import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZSAError } from "zsa";

const { mockRequireApplicationPermission } = vi.hoisted(() => ({
  mockRequireApplicationPermission: vi.fn(),
}));

vi.mock("@/utils/application-auth", () => ({
  requireApplicationPermission: mockRequireApplicationPermission,
}));

import { authorizeApplicationRouteAccess } from "@/app/api/_utils/application-route-auth";

describe("authorizeApplicationRouteAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the verified session on success", async () => {
    const session = {
      userId: "user_123",
      user: { id: "user_123", emailVerified: true },
    };
    mockRequireApplicationPermission.mockResolvedValue(session);

    const result = await authorizeApplicationRouteAccess("app_123", "access_application");

    expect(result).toEqual({ session });
    expect(mockRequireApplicationPermission).toHaveBeenCalledWith(
      "app_123",
      "access_application",
    );
  });

  it("maps NOT_AUTHORIZED to a 401 response", async () => {
    mockRequireApplicationPermission.mockRejectedValue(
      new ZSAError("NOT_AUTHORIZED", "Not authenticated"),
    );

    const result = await authorizeApplicationRouteAccess("app_123", "access_application");

    expect("response" in result).toBe(true);
    if (!("response" in result)) throw new Error("expected response result");
    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({
      error: "Not authenticated",
    });
  });

  it("maps FORBIDDEN to a 403 response", async () => {
    mockRequireApplicationPermission.mockRejectedValue(
      new ZSAError("FORBIDDEN", "Please verify your email first"),
    );

    const result = await authorizeApplicationRouteAccess("app_123", "access_application");

    expect("response" in result).toBe(true);
    if (!("response" in result)) throw new Error("expected response result");
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toEqual({
      error: "Please verify your email first",
    });
  });

  it("maps NOT_FOUND to a 404 response", async () => {
    mockRequireApplicationPermission.mockRejectedValue(
      new ZSAError("NOT_FOUND", "Application not found"),
    );

    const result = await authorizeApplicationRouteAccess("app_123", "access_application");

    expect("response" in result).toBe(true);
    if (!("response" in result)) throw new Error("expected response result");
    expect(result.response.status).toBe(404);
    await expect(result.response.json()).resolves.toEqual({
      error: "Application not found",
    });
  });

  it("rethrows unexpected errors", async () => {
    const error = new Error("boom");
    mockRequireApplicationPermission.mockRejectedValue(error);

    await expect(
      authorizeApplicationRouteAccess("app_123", "access_application"),
    ).rejects.toThrow("boom");
  });
});
