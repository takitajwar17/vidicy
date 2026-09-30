import { describe, expect, it } from "vitest";

import {
  AGENCY_CASE_STATUS,
  REVIEW_ISSUE_SEVERITY,
  REVIEW_ISSUE_STATUS,
  REVIEW_ISSUE_STATUS_OPTIONS,
} from "@/db/schema";
import {
  CASE_STATUS_META,
  ISSUE_STATUS_META,
  ISSUE_SEVERITY_META,
  getDisplayCaseNumber,
  getStatusBadgeClass,
  isOpenReviewIssueStatus,
  normalizeAgencyCaseStatus,
  normalizeReviewIssueStatus,
} from "@/lib/agency-workflow";

describe("agency workflow metadata", () => {
  it("labels the agency-first case statuses", () => {
    expect(CASE_STATUS_META[AGENCY_CASE_STATUS.INTAKE].label).toBe("Intake");
    expect(CASE_STATUS_META[AGENCY_CASE_STATUS.NEEDS_CLIENT].label).toBe("Needs Client");
    expect(CASE_STATUS_META[AGENCY_CASE_STATUS.READY_TO_SUBMIT].label).toBe("Ready to Submit");
  });

  it("maps important states to operational badge styles", () => {
    expect(getStatusBadgeClass(AGENCY_CASE_STATUS.READY_TO_SUBMIT)).toContain("status-success");
    expect(getStatusBadgeClass(AGENCY_CASE_STATUS.NEEDS_CLIENT)).toContain("status-warning");
    expect(ISSUE_SEVERITY_META[REVIEW_ISSUE_SEVERITY.HIGH].badgeClassName).toContain("destructive");
  });

  it("normalizes old detailed statuses into the simplified workflow", () => {
    expect(normalizeAgencyCaseStatus("ready_for_review")).toBe(AGENCY_CASE_STATUS.IN_REVIEW);
    expect(normalizeAgencyCaseStatus("ai_reviewed")).toBe(AGENCY_CASE_STATUS.IN_REVIEW);
    expect(normalizeAgencyCaseStatus("submitted")).toBe(AGENCY_CASE_STATUS.READY_TO_SUBMIT);
    expect(normalizeAgencyCaseStatus("completed")).toBe(AGENCY_CASE_STATUS.READY_TO_SUBMIT);
  });

  it("keeps review issue statuses ordered and maps legacy accepted to open", () => {
    expect(REVIEW_ISSUE_STATUS_OPTIONS).toEqual([
      REVIEW_ISSUE_STATUS.OPEN,
      REVIEW_ISSUE_STATUS.CLIENT_REQUESTED,
      REVIEW_ISSUE_STATUS.RESOLVED,
      REVIEW_ISSUE_STATUS.DISMISSED,
    ]);
    expect(ISSUE_STATUS_META[REVIEW_ISSUE_STATUS.CLIENT_REQUESTED].label).toBe("Client Requested");
    expect(normalizeReviewIssueStatus("accepted")).toBe(REVIEW_ISSUE_STATUS.OPEN);
    expect(isOpenReviewIssueStatus(REVIEW_ISSUE_STATUS.OPEN)).toBe(true);
    expect(isOpenReviewIssueStatus(REVIEW_ISSUE_STATUS.CLIENT_REQUESTED)).toBe(true);
    expect(isOpenReviewIssueStatus(REVIEW_ISSUE_STATUS.RESOLVED)).toBe(false);
    expect(isOpenReviewIssueStatus(REVIEW_ISSUE_STATUS.DISMISSED)).toBe(false);
  });

  it("generates a stable fallback case number", () => {
    expect(getDisplayCaseNumber(null, "vapp_abcdef123456789")).toBe("CASE-ABCDEF123");
    expect(getDisplayCaseNumber("VA-2026-ABC123", "vapp_unused")).toBe("VA-2026-ABC123");
  });
});
