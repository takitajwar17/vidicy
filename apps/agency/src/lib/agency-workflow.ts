import type { Route } from "next";
import {
  AGENCY_CASE_PRIORITY,
  AGENCY_CASE_STATUS,
  CLIENT_REPORT_DELIVERY_STATUS,
  CLIENT_REPORT_STATUS,
  RISK_LEVEL,
  REVIEW_ISSUE_SEVERITY,
  REVIEW_ISSUE_STATUS,
  REVIEW_ISSUE_STATUS_OPTIONS,
} from "@/db/schema";

export const AGENCY_NAV_ITEMS = [
  { title: "Dashboard", url: "/dashboard" as Route },
  { title: "Applications", url: "/dashboard/applications" as Route },
  { title: "Issues", url: "/dashboard/issues" as Route },
  { title: "Clients", url: "/dashboard/clients" as Route },
  { title: "Documents", url: "/dashboard/documents" as Route },
  { title: "Team", url: "/dashboard/team" as Route },
  { title: "Reports", url: "/dashboard/reports" as Route },
  { title: "Settings", url: "/settings" as Route },
] as const;

export const CASE_STATUS_META = {
  [AGENCY_CASE_STATUS.INTAKE]: {
    label: "Intake",
    tone: "muted",
    description: "Client file is being initialized.",
  },
  [AGENCY_CASE_STATUS.IN_REVIEW]: {
    label: "In Review",
    tone: "info",
    description: "Document review is underway.",
  },
  [AGENCY_CASE_STATUS.NEEDS_CLIENT]: {
    label: "Needs Client",
    tone: "warning",
    description: "Client follow-up is required.",
  },
  [AGENCY_CASE_STATUS.READY_TO_SUBMIT]: {
    label: "Ready to Submit",
    tone: "success",
    description: "Reviewer marked the file ready for submission.",
  },
} as const;

export const AGENCY_CASE_STATUS_OPTIONS = [
  AGENCY_CASE_STATUS.INTAKE,
  AGENCY_CASE_STATUS.IN_REVIEW,
  AGENCY_CASE_STATUS.NEEDS_CLIENT,
  AGENCY_CASE_STATUS.READY_TO_SUBMIT,
] as const;

export function normalizeAgencyCaseStatus(status: string | null | undefined) {
  if (status === "ready_for_review" || status === "ai_reviewed") {
    return AGENCY_CASE_STATUS.IN_REVIEW;
  }

  if (status === "submitted" || status === "completed") {
    return AGENCY_CASE_STATUS.READY_TO_SUBMIT;
  }

  if (AGENCY_CASE_STATUS_OPTIONS.includes(status as (typeof AGENCY_CASE_STATUS_OPTIONS)[number])) {
    return status as (typeof AGENCY_CASE_STATUS_OPTIONS)[number];
  }

  return AGENCY_CASE_STATUS.INTAKE;
}

export const CASE_PRIORITY_META = {
  [AGENCY_CASE_PRIORITY.LOW]: { label: "Low", className: "text-muted-foreground" },
  [AGENCY_CASE_PRIORITY.NORMAL]: { label: "Normal", className: "text-foreground" },
  [AGENCY_CASE_PRIORITY.HIGH]: { label: "High", className: "text-status-warning" },
  [AGENCY_CASE_PRIORITY.URGENT]: { label: "Urgent", className: "text-destructive" },
} as const;

export const RISK_LEVEL_META = {
  [RISK_LEVEL.LOW]: { label: "Low" },
  [RISK_LEVEL.MEDIUM]: { label: "Medium" },
  [RISK_LEVEL.HIGH]: { label: "High" },
} as const;

export const ISSUE_SEVERITY_META = {
  [REVIEW_ISSUE_SEVERITY.HIGH]: {
    label: "High",
    badgeClassName: "border-destructive/25 bg-destructive/10 text-destructive",
    dotClassName: "bg-destructive",
  },
  [REVIEW_ISSUE_SEVERITY.MEDIUM]: {
    label: "Medium",
    badgeClassName: "border-status-warning/25 bg-status-warning/10 text-status-warning",
    dotClassName: "bg-status-warning",
  },
  [REVIEW_ISSUE_SEVERITY.LOW]: {
    label: "Low",
    badgeClassName: "border-status-success/25 bg-status-success/10 text-status-success",
    dotClassName: "bg-status-success",
  },
} as const;

export const ISSUE_STATUS_META = {
  [REVIEW_ISSUE_STATUS.OPEN]: { label: "Open" },
  [REVIEW_ISSUE_STATUS.CLIENT_REQUESTED]: { label: "Client Requested" },
  [REVIEW_ISSUE_STATUS.RESOLVED]: { label: "Resolved" },
  [REVIEW_ISSUE_STATUS.DISMISSED]: { label: "Dismissed" },
} as const;

export const CLIENT_REPORT_STATUS_META = {
  [CLIENT_REPORT_STATUS.NOT_STARTED]: { label: "Not Started" },
  [CLIENT_REPORT_STATUS.DRAFT]: { label: "Draft" },
  [CLIENT_REPORT_STATUS.READY]: { label: "Ready" },
  [CLIENT_REPORT_STATUS.SENT]: { label: "Sent" },
} as const;

export const CLIENT_REPORT_DELIVERY_STATUS_META = {
  [CLIENT_REPORT_DELIVERY_STATUS.DRAFT]: { label: "Draft" },
  [CLIENT_REPORT_DELIVERY_STATUS.READY]: { label: "Ready" },
  [CLIENT_REPORT_DELIVERY_STATUS.SENT]: { label: "Sent" },
} as const;

export function normalizeReviewIssueStatus(status: string | null | undefined) {
  if (status === "accepted") {
    return REVIEW_ISSUE_STATUS.OPEN;
  }

  if (
    REVIEW_ISSUE_STATUS_OPTIONS.includes(status as (typeof REVIEW_ISSUE_STATUS_OPTIONS)[number])
  ) {
    return status as (typeof REVIEW_ISSUE_STATUS_OPTIONS)[number];
  }

  return REVIEW_ISSUE_STATUS.OPEN;
}

export function isOpenReviewIssueStatus(status: string | null | undefined) {
  const normalizedStatus = normalizeReviewIssueStatus(status);
  return (
    normalizedStatus === REVIEW_ISSUE_STATUS.OPEN ||
    normalizedStatus === REVIEW_ISSUE_STATUS.CLIENT_REQUESTED
  );
}

export function getStatusBadgeClass(status: string) {
  const normalizedStatus = normalizeAgencyCaseStatus(status);
  const tone = CASE_STATUS_META[normalizedStatus]?.tone;
  if (tone === "success")
    return "border-status-success/25 bg-status-success/10 text-status-success";
  if (tone === "warning")
    return "border-status-warning/25 bg-status-warning/10 text-status-warning";
  if (tone === "info") return "border-status-info/25 bg-status-info/10 text-status-info";
  return "border-border bg-muted/50 text-muted-foreground";
}

export function getRiskBadgeClass(riskLevel?: string | null) {
  if (riskLevel === "low")
    return "border-status-success/25 bg-status-success/10 text-status-success";
  if (riskLevel === "medium")
    return "border-status-warning/25 bg-status-warning/10 text-status-warning";
  if (riskLevel === "high") return "border-destructive/25 bg-destructive/10 text-destructive";
  return "border-border bg-muted/50 text-muted-foreground";
}

export function getDisplayCaseNumber(caseNumber: string | null | undefined, fallbackId: string) {
  return (
    caseNumber ||
    fallbackId
      .replace(/^vapp_/, "CASE-")
      .slice(0, 14)
      .toUpperCase()
  );
}

export function formatAgencyVisaLabel({
  destinationCountry,
  visaType,
}: {
  destinationCountry?: string | null;
  visaType?: string | null;
}) {
  return [destinationCountry, visaType].filter(Boolean).join(" ") || "Visa not set";
}

export function formatReviewerDisplayName({
  firstName,
  lastName,
  email,
  fallback = "Reviewer",
}: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  fallback?: string;
}) {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim() || email || fallback;
}
