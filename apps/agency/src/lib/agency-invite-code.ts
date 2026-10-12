import { createHash, randomBytes } from "node:crypto";

export const AGENCY_INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export function generateAgencyInviteCode(): string {
  return randomBytes(10).toString("hex").toUpperCase();
}

export function normalizeAgencyInviteCode(code: string): string {
  return code.trim().replace(/[\s-]/g, "").toUpperCase();
}

export function isAgencyInviteCodeValid(code: string): boolean {
  return /^[A-F0-9]{20}$/.test(normalizeAgencyInviteCode(code));
}

export function hashAgencyInviteCode(code: string): string {
  return createHash("sha256").update(normalizeAgencyInviteCode(code)).digest("hex");
}
