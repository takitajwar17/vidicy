import type { Route } from "next";
import {
  AGENCY_CASE_PRIORITY,
  AGENCY_CASE_STATUS,
  REVIEW_ISSUE_SEVERITY,
  REVIEW_ISSUE_STATUS,
} from "@/db/schema";

export const AGENCY_NAV_ITEMS = [
  { title: "Dashboard", url: "/dashboard" as Route },
  { title: "Applications", url: "/dashboard/applications" as Route },
  { title: "AI Review", url: "/dashboard/review" as Route },
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
  [AGENCY_CASE_STATUS.READY_FOR_REVIEW]: {
    label: "Ready for review",
    tone: "info",
    description: "Documents are ready for AI and reviewer checks.",
  },
  [AGENCY_CASE_STATUS.AI_REVIEWED]: {
    label: "AI reviewed",
    tone: "primary",
    description: "AI review has produced issue flags.",
  },
  [AGENCY_CASE_STATUS.NEEDS_CLIENT]: {
    label: "Needs client",
    tone: "warning",
    description: "Client follow-up is required.",
  },
  [AGENCY_CASE_STATUS.IN_REVIEW]: {
    label: "In review",
    tone: "info",
    description: "A reviewer is working this case.",
  },
  [AGENCY_CASE_STATUS.READY_TO_SUBMIT]: {
    label: "Ready to submit",
    tone: "success",
    description: "Reviewer approved the file for final submission.",
  },
  [AGENCY_CASE_STATUS.SUBMITTED]: {
    label: "Submitted",
    tone: "success",
    description: "The agency has submitted the application.",
  },
  [AGENCY_CASE_STATUS.COMPLETED]: {
    label: "Completed",
    tone: "success",
    description: "The case is closed.",
  },
  [AGENCY_CASE_STATUS.ARCHIVED]: {
    label: "Archived",
    tone: "muted",
    description: "The case is archived.",
  },
} as const;

export const CASE_PRIORITY_META = {
  [AGENCY_CASE_PRIORITY.LOW]: { label: "Low", className: "text-muted-foreground" },
  [AGENCY_CASE_PRIORITY.NORMAL]: { label: "Normal", className: "text-foreground" },
  [AGENCY_CASE_PRIORITY.HIGH]: { label: "High", className: "text-status-warning" },
  [AGENCY_CASE_PRIORITY.URGENT]: { label: "Urgent", className: "text-destructive" },
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
  [REVIEW_ISSUE_STATUS.ACCEPTED]: { label: "Accepted" },
  [REVIEW_ISSUE_STATUS.DISMISSED]: { label: "Dismissed" },
  [REVIEW_ISSUE_STATUS.RESOLVED]: { label: "Resolved" },
  [REVIEW_ISSUE_STATUS.CLIENT_REQUESTED]: { label: "Client requested" },
} as const;

export function getStatusBadgeClass(status: string) {
  const tone = CASE_STATUS_META[status as keyof typeof CASE_STATUS_META]?.tone;
  if (tone === "success") return "border-status-success/25 bg-status-success/10 text-status-success";
  if (tone === "warning") return "border-status-warning/25 bg-status-warning/10 text-status-warning";
  if (tone === "info") return "border-status-info/25 bg-status-info/10 text-status-info";
  if (tone === "primary") return "border-primary/25 bg-primary/10 text-primary";
  return "border-border bg-muted/50 text-muted-foreground";
}

export function getRiskBadgeClass(riskLevel?: string | null) {
  if (riskLevel === "low") return "border-status-success/25 bg-status-success/10 text-status-success";
  if (riskLevel === "medium") return "border-status-warning/25 bg-status-warning/10 text-status-warning";
  if (riskLevel === "high") return "border-destructive/25 bg-destructive/10 text-destructive";
  return "border-border bg-muted/50 text-muted-foreground";
}

export function getDisplayCaseNumber(caseNumber: string | null | undefined, fallbackId: string) {
  return caseNumber || fallbackId.replace(/^vapp_/, "CASE-").slice(0, 14).toUpperCase();
}
