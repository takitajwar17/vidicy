import { describe, it, expect, vi } from "vitest";
import { validateCsrfToken } from "@/infra/csrf";

// Mock next/headers
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

describe("CSRF Utility", () => {
  describe("validateCsrfToken", () => {
    it("should return false if provided token is null or undefined", async () => {
      expect(await validateCsrfToken(null)).toBe(false);
      expect(await validateCsrfToken(undefined)).toBe(false);
      expect(await validateCsrfToken("")).toBe(false);
    });

    it("should return false if no token is stored in cookies", async () => {
      const { cookies } = await import("next/headers");
      const mockGet = vi.fn().mockReturnValue(undefined);
      (cookies as any).mockReturnValue({ get: mockGet });

      expect(await validateCsrfToken("some-token")).toBe(false);
      expect(mockGet).toHaveBeenCalledWith("csrf-token");
    });

    it("should return true if provided token matches stored token", async () => {
      const { cookies } = await import("next/headers");
      const token = "correct-secure-token-123";
      const mockGet = vi.fn().mockReturnValue({ value: token });
      (cookies as any).mockReturnValue({ get: mockGet });

      expect(await validateCsrfToken(token)).toBe(true);
    });

    it("should return false if provided token does not match stored token", async () => {
      const { cookies } = await import("next/headers");
      const mockGet = vi.fn().mockReturnValue({ value: "stored-token" });
      (cookies as any).mockReturnValue({ get: mockGet });

      expect(await validateCsrfToken("wrong-token")).toBe(false);
    });

    it("should return false if tokens have different lengths", async () => {
      const { cookies } = await import("next/headers");
      const mockGet = vi.fn().mockReturnValue({ value: "short" });
      (cookies as any).mockReturnValue({ get: mockGet });

      expect(await validateCsrfToken("longer-token")).toBe(false);
    });
  });
});
