export interface DashboardCase {
  id: string;
  caseNumber: string;
  clientName: string;
  applicantName: string;
  destination: string;
  visaType: string;
  status: string;
  dueDate: string | null;
  updatedAt: string;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewerAvatar: string | null;
  requiredCount: number;
  uploadedRequiredCount: number;
  hasChecklist: boolean;
  reviewState: "not_started" | "outdated" | "current";
  openIssueCount: number;
  finalSubmissionAt: string | null;
}

export const DASHBOARD_ATTENTION = [
  "all",
  "overdue",
  "due_soon",
  "unassigned",
  "review_outdated",
  "recheck",
] as const;
export const DASHBOARD_STATUSES = [
  "all",
  "intake",
  "in_review",
  "needs_client",
  "ready_to_submit",
] as const;
export type DashboardAttention = (typeof DASHBOARD_ATTENTION)[number];

export function needsReadinessCheck(row: DashboardCase) {
  return (
    row.status === "ready_to_submit" &&
    (!row.hasChecklist ||
      row.reviewState !== "current" ||
      row.uploadedRequiredCount < row.requiredCount ||
      row.openIssueCount > 0)
  );
}

function matchesAttention({
  row,
  attention,
  today,
}: {
  row: DashboardCase;
  attention: DashboardAttention;
  today: string;
}) {
  if (attention === "all") return true;
  if (row.finalSubmissionAt) return false;
  if (attention === "unassigned") return !row.reviewerId;
  if (attention === "review_outdated") return row.reviewState === "outdated";
  if (attention === "recheck") return needsReadinessCheck(row);
  if (!row.dueDate || (row.status === "ready_to_submit" && !needsReadinessCheck(row))) return false;
  if (attention === "overdue") return row.dueDate < today;
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  return row.dueDate >= today && row.dueDate <= end.toISOString().slice(0, 10);
}

export function getDashboardAttention({ cases, today }: { cases: DashboardCase[]; today: string }) {
  return {
    overdue: cases.filter((row) => matchesAttention({ row, attention: "overdue", today })).length,
    due_soon: cases.filter((row) => matchesAttention({ row, attention: "due_soon", today })).length,
    unassigned: cases.filter((row) => matchesAttention({ row, attention: "unassigned", today }))
      .length,
    review_outdated: cases.filter((row) =>
      matchesAttention({ row, attention: "review_outdated", today }),
    ).length,
    recheck: cases.filter((row) => matchesAttention({ row, attention: "recheck", today })).length,
  };
}

export function getDashboardNextAction(row: DashboardCase): {
  label: string;
  detail: string;
  tab: "review" | "checklist";
} {
  if (row.finalSubmissionAt)
    return { label: "View case", detail: "Submission recorded", tab: "review" };
  if (needsReadinessCheck(row))
    return {
      label: "Recheck readiness",
      detail: "Current evidence needs attention",
      tab: "review",
    };
  if (!row.reviewerId)
    return { label: "Assign reviewer", detail: "No reviewer assigned", tab: "review" };
  if (!row.hasChecklist)
    return { label: "Generate checklist", detail: "Set the required documents", tab: "checklist" };
  const missing = row.requiredCount - row.uploadedRequiredCount;
  if (missing > 0)
    return {
      label: "Add missing files",
      detail: `${missing} required ${missing === 1 ? "file" : "files"} missing`,
      tab: "checklist",
    };
  if (row.reviewState === "not_started")
    return { label: "Run review", detail: "Files have not been reviewed", tab: "review" };
  if (row.reviewState === "outdated")
    return { label: "Review again", detail: "Review does not match current files", tab: "review" };
  if (row.openIssueCount)
    return {
      label: "Resolve issues",
      detail: `${row.openIssueCount} open ${row.openIssueCount === 1 ? "issue" : "issues"}`,
      tab: "review",
    };
  if (row.status !== "ready_to_submit")
    return { label: "Finalize review", detail: "Check and confirm readiness", tab: "review" };
  return { label: "View case", detail: "Marked ready to submit", tab: "review" };
}

export function filterDashboardCases({
  cases,
  today,
  query,
  status,
  attention,
  sort,
}: {
  cases: DashboardCase[];
  today: string;
  query: string;
  status: string;
  attention: DashboardAttention;
  sort: "due" | "updated";
}) {
  const search = query.trim().toLowerCase();
  return cases
    .filter(
      (row) =>
        (status === "all" || row.status === status) &&
        matchesAttention({ row, attention, today }) &&
        (!search ||
          [
            row.caseNumber,
            row.clientName,
            row.applicantName,
            row.destination,
            row.visaType,
            row.reviewerName ?? "",
          ].some((value) => value.toLowerCase().includes(search))),
    )
    .sort((a, b) => {
      if (sort === "due") {
        const dueOrder = (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
        if (dueOrder) return dueOrder;
      }
      return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
    });
}
