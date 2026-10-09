import { describe, expect, it } from "vitest";
import { filterReviewIssues, getIssueDocument } from "@/lib/agency-review-workspace";

const documents = [
  { id: "new", checklistItemId: "passport", fileName: "new-passport.pdf" },
  { id: "old", checklistItemId: "passport", fileName: "old-passport.pdf" },
];
const issue = {
  id: "issue",
  title: "Check identity",
  description: "Name differs",
  recommendation: null,
  severity: "high",
  status: "open",
  documentId: "old",
  checklistItemId: "passport",
};

describe("review workspace evidence and filters", () => {
  it("uses the exact source document, even when a newer file exists", () => {
    expect(getIssueDocument({ issue, documents })?.id).toBe("old");
    expect(getIssueDocument({ issue: { ...issue, documentId: "removed" }, documents })).toBeNull();
  });

  it("uses a checklist file only when the issue has no explicit document source", () => {
    expect(getIssueDocument({ issue: { ...issue, documentId: null }, documents })?.id).toBe("new");
    expect(
      getIssueDocument({ issue: { ...issue, documentId: null, checklistItemId: null }, documents }),
    ).toBeNull();
  });

  it("separates open findings from resolved and dismissed history and sorts by priority", () => {
    const issues = [
      { ...issue, id: "medium", severity: "medium" },
      { ...issue, id: "dismissed", status: "dismissed" },
      issue,
      { ...issue, id: "resolved", status: "resolved" },
      { ...issue, id: "progress", status: "client_requested" },
    ];
    expect(
      filterReviewIssues({ issues, documents, priority: "all", status: "open", query: "" }).map(
        (i) => i.id,
      ),
    ).toEqual(["issue", "progress", "medium"]);
    expect(
      filterReviewIssues({
        issues,
        documents,
        priority: "high",
        status: "all",
        query: "old-passport",
      }),
    ).toHaveLength(4);
    expect(
      filterReviewIssues({
        issues,
        documents,
        priority: "all",
        status: "resolved",
        query: "NAME",
      }).map((i) => i.id),
    ).toEqual(["resolved"]);
  });
});
