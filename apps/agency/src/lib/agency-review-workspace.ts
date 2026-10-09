import { isOpenReviewIssueStatus } from "@/lib/agency-workflow";

export interface ReviewWorkspaceDocument {
  id: string;
  checklistItemId: string | null;
  fileName: string;
}

export interface ReviewWorkspaceIssue {
  id: string;
  title: string;
  description: string;
  recommendation: string | null;
  severity: string;
  status: string;
  documentId: string | null;
  checklistItemId: string | null;
}

/** An explicit source must never silently point at a different uploaded file. */
export function getIssueDocument<T extends ReviewWorkspaceDocument>({
  issue,
  documents,
}: {
  issue: ReviewWorkspaceIssue;
  documents: T[];
}): T | null {
  if (issue.documentId)
    return documents.find((document) => document.id === issue.documentId) ?? null;
  if (issue.checklistItemId)
    return documents.find((document) => document.checklistItemId === issue.checklistItemId) ?? null;
  return null;
}

export function filterReviewIssues<T extends ReviewWorkspaceIssue>({
  issues,
  documents,
  priority,
  status,
  query,
}: {
  issues: T[];
  documents: ReviewWorkspaceDocument[];
  priority: string;
  status: string;
  query: string;
}): T[] {
  const search = query.trim().toLowerCase();
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return issues
    .filter((issue) => {
      if (priority !== "all" && issue.severity !== priority) return false;
      if (
        status === "open"
          ? !isOpenReviewIssueStatus(issue.status)
          : status !== "all" && issue.status !== status
      )
        return false;
      if (!search) return true;
      const document = getIssueDocument({ issue, documents });
      return [issue.title, issue.description, issue.recommendation, document?.fileName].some(
        (value) => value?.toLowerCase().includes(search),
      );
    })
    .sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
}
