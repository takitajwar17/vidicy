import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/infra/password-hasher";

describe("Password Hasher Data Consistency", () => {
  describe("hashPassword", () => {
    it("should produce a hash in the format salt:hash", async () => {
      const result = await hashPassword({ password: "testpassword" });
      expect(result).toContain(":");
      const parts = result.split(":");
      expect(parts).toHaveLength(2);
    });

    it("should produce different hashes for the same password (different salts)", async () => {
      const hash1 = await hashPassword({ password: "testpassword" });
      const hash2 = await hashPassword({ password: "testpassword" });
      expect(hash1).not.toBe(hash2);
    });

    it("should produce consistent hashes with the same salt", async () => {
      const salt = new Uint8Array(16).fill(42);
      const hash1 = await hashPassword({ password: "testpassword", providedSalt: salt });
      const hash2 = await hashPassword({ password: "testpassword", providedSalt: salt });
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different passwords", async () => {
      const salt = new Uint8Array(16).fill(42);
      const hash1 = await hashPassword({ password: "password1", providedSalt: salt });
      const hash2 = await hashPassword({ password: "password2", providedSalt: salt });
      expect(hash1).not.toBe(hash2);
    });

    it("should produce hex-encoded output", async () => {
      const result = await hashPassword({ password: "testpassword" });
      const [saltHex, hashHex] = result.split(":");
      // Both parts should only contain hex characters
      expect(saltHex).toMatch(/^[0-9a-f]+$/);
      expect(hashHex).toMatch(/^[0-9a-f]+$/);
    });

    it("should produce a salt of expected length (16 bytes = 32 hex chars)", async () => {
      const result = await hashPassword({ password: "testpassword" });
      const [saltHex] = result.split(":");
      expect(saltHex).toHaveLength(32); // 16 bytes * 2 hex chars per byte
    });
  });

  describe("verifyPassword", () => {
    it("should verify a correct password", async () => {
      const password = "correctpassword";
      const hash = await hashPassword({ password });
      const result = await verifyPassword({ storedHash: hash, passwordAttempt: password });
      expect(result).toBe(true);
    });

    it("should reject an incorrect password", async () => {
      const hash = await hashPassword({ password: "correctpassword" });
      const result = await verifyPassword({ storedHash: hash, passwordAttempt: "wrongpassword" });
      expect(result).toBe(false);
    });

    it("should handle empty stored hash", async () => {
      const result = await verifyPassword({ storedHash: "", passwordAttempt: "test" });
      expect(result).toBe(false);
    });

    it("should handle malformed stored hash (no separator)", async () => {
      const result = await verifyPassword({ storedHash: "nocolon", passwordAttempt: "test" });
      expect(result).toBe(false);
    });

    it("should verify password after hashing with specific salt", async () => {
      const salt = new Uint8Array(16).fill(99);
      const password = "mysecretpassword";
      const hash = await hashPassword({ password, providedSalt: salt });
      const result = await verifyPassword({ storedHash: hash, passwordAttempt: password });
      expect(result).toBe(true);
    });

    it("should handle case-sensitive passwords", async () => {
      const hash = await hashPassword({ password: "Password123" });
      const result = await verifyPassword({ storedHash: hash, passwordAttempt: "password123" });
      expect(result).toBe(false);
    });

    it("should handle special characters in passwords", async () => {
      const password = "p@$$w0rd!#%^&*()";
      const hash = await hashPassword({ password });
      const result = await verifyPassword({ storedHash: hash, passwordAttempt: password });
      expect(result).toBe(true);
    });

    it("should handle unicode passwords", async () => {
      const password = "пароль密码パスワード";
      const hash = await hashPassword({ password });
      const result = await verifyPassword({ storedHash: hash, passwordAttempt: password });
      expect(result).toBe(true);
    });
  });
});
