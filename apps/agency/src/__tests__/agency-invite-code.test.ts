import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  generateAgencyInviteCode,
  normalizeAgencyInviteCode,
  hashAgencyInviteCode,
  isAgencyInviteCodeValid,
  AGENCY_INVITATION_LIFETIME_MS,
} from "@/lib/agency-invite-code";

describe("agency invitation codes", () => {
  it("generates 80-bit uppercase hexadecimal codes", () => {
    const codes = Array.from({ length: 100 }, generateAgencyInviteCode);
    expect(codes.every((code) => /^[A-F0-9]{20}$/.test(code))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it("normalizes separators and case", () => {
    expect(normalizeAgencyInviteCode("  abcd-1234 efab-5678-90cd  ")).toBe("ABCD1234EFAB567890CD");
  });
  it("hashes the normalized code with SHA-256", () => {
    expect(hashAgencyInviteCode("abcd-1234 efab-5678-90cd")).toBe(
      createHash("sha256").update("ABCD1234EFAB567890CD").digest("hex"),
    );
  });
  it.each(["", "123", "ABCD1234EFAB567890CG", "ABCD1234EFAB567890CD00"])(
    "rejects invalid code %s",
    (code) => {
      expect(isAgencyInviteCodeValid(code)).toBe(false);
    },
  );
  it("accepts a formatted code", () => {
    expect(isAgencyInviteCodeValid("abcd-1234 efab-5678-90cd")).toBe(true);
  });
  it("expires exactly seven days after generation", () => {
    expect(AGENCY_INVITATION_LIFETIME_MS).toBe(604_800_000);
  });
});
