import { describe, it, expect } from "vitest";
import { ROLES_ENUM } from "@/db/schema";
import {
  MAX_SESSIONS_PER_USER,
  PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS,
  EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS,
} from "@/constants";
import { CURRENT_SESSION_VERSION } from "@/infra/kv-session";
import { signUpSchema } from "@/schemas/signup.schema";
import { signInSchema } from "@/schemas/signin.schema";
import { resetPasswordSchema } from "@/schemas/reset-password.schema";
import { userSettingsSchema } from "@/schemas/settings.schema";

describe("Cross-Part Data Consistency", () => {
  // ============================
  // Schema <-> Database Consistency
  // ============================
  describe("Schema and Database Type Alignment", () => {
    it("should have consistent role values between ROLES_ENUM and what schemas expect", () => {
      // The userTable uses ROLES_ENUM values, default is USER
      expect(ROLES_ENUM.USER).toBe("user");
      expect(ROLES_ENUM.ADMIN).toBe("admin");
    });
  });

  // ============================
  // Validation Schema Cross-Consistency
  // ============================
  describe("Validation Schema Cross-Consistency", () => {
    it("should enforce consistent password minimum length across all schemas", () => {
      const shortPassword = "pass123"; // 7 chars - below minimum of 8

      // Sign Up
      const signUpResult = signUpSchema.safeParse({
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        password: shortPassword,
        agreeToTerms: true,
        captchaToken: "mock-token",
      });
      expect(signUpResult.success).toBe(false);

      // Sign In
      const signInResult = signInSchema.safeParse({
        email: "test@example.com",
        password: shortPassword,
      });
      expect(signInResult.success).toBe(false);

      // Reset Password
      const resetResult = resetPasswordSchema.safeParse({
        token: "valid-token",
        password: shortPassword,
        confirmPassword: shortPassword,
      });
      expect(resetResult.success).toBe(false);
    });

    it("should enforce consistent 8-char password minimum", () => {
      const exactMinPassword = "pass1234"; // exactly 8 chars

      // Sign Up
      const signUpResult = signUpSchema.safeParse({
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        password: exactMinPassword,
        agreeToTerms: true,
        captchaToken: "mock-token",
      });
      expect(signUpResult.success).toBe(true);

      // Sign In
      const signInResult = signInSchema.safeParse({
        email: "test@example.com",
        password: exactMinPassword,
      });
      expect(signInResult.success).toBe(true);

      // Reset Password
      const resetResult = resetPasswordSchema.safeParse({
        token: "valid-token",
        password: exactMinPassword,
        confirmPassword: exactMinPassword,
      });
      expect(resetResult.success).toBe(true);
    });

    it("should enforce consistent name length constraints across signup and settings", () => {
      const shortFirstName = "J"; // 1 char

      const signUpResult = signUpSchema.safeParse({
        email: "test@example.com",
        firstName: shortFirstName,
        lastName: "Doe",
        password: "password123",
        agreeToTerms: true,
        captchaToken: "mock-token",
      });
      expect(signUpResult.success).toBe(false);

      const settingsResult = userSettingsSchema.safeParse({
        firstName: shortFirstName,
        lastName: "Doe",
      });
      expect(settingsResult.success).toBe(false);
    });

    it("should enforce consistent max name length in signup and settings", () => {
      const longName = "A".repeat(256);

      const signUpResult = signUpSchema.safeParse({
        email: "test@example.com",
        firstName: longName,
        lastName: "Doe",
        password: "password123",
        agreeToTerms: true,
        captchaToken: "mock-token",
      });
      expect(signUpResult.success).toBe(false);

      const settingsResult = userSettingsSchema.safeParse({
        firstName: longName,
        lastName: "Doe",
      });
      expect(settingsResult.success).toBe(false);
    });
  });

  // ============================
  // Session <-> Auth Consistency
  // ============================
  describe("Session System Consistency", () => {
    it("should have session version as a positive integer", () => {
      expect(CURRENT_SESSION_VERSION).toBeGreaterThan(0);
      expect(Number.isInteger(CURRENT_SESSION_VERSION)).toBe(true);
    });

    it("should have consistent max sessions limit", () => {
      expect(MAX_SESSIONS_PER_USER).toBe(5);
    });

    it("should have token expirations consistent between reset and verification", () => {
      expect(PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS).toBe(
        EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS,
      );
    });
  });
});
