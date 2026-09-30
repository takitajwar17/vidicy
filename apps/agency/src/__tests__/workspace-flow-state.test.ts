import { describe, expect, it } from "vitest";

import { AGENCY_CASE_STATUS, REVIEW_ISSUE_SEVERITY } from "@/db/schema";
import {
  CASE_STATUS_META,
  ISSUE_SEVERITY_META,
  getDisplayCaseNumber,
  getStatusBadgeClass,
} from "@/lib/agency-workflow";

describe("agency workflow metadata", () => {
  it("labels the agency-first case statuses", () => {
    expect(CASE_STATUS_META[AGENCY_CASE_STATUS.INTAKE].label).toBe("Intake");
    expect(CASE_STATUS_META[AGENCY_CASE_STATUS.NEEDS_CLIENT].label).toBe("Needs client");
    expect(CASE_STATUS_META[AGENCY_CASE_STATUS.READY_TO_SUBMIT].label).toBe("Ready to submit");
  });

  it("maps important states to operational badge styles", () => {
    expect(getStatusBadgeClass(AGENCY_CASE_STATUS.READY_TO_SUBMIT)).toContain("status-success");
    expect(getStatusBadgeClass(AGENCY_CASE_STATUS.NEEDS_CLIENT)).toContain("status-warning");
    expect(ISSUE_SEVERITY_META[REVIEW_ISSUE_SEVERITY.HIGH].badgeClassName).toContain("destructive");
  });

  it("generates a stable fallback case number", () => {
    expect(getDisplayCaseNumber(null, "vapp_abcdef123456789")).toBe("CASE-ABCDEF123");
    expect(getDisplayCaseNumber("VA-2026-ABC123", "vapp_unused")).toBe("VA-2026-ABC123");
  });
});
