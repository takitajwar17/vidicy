import { describe, expect, it } from "vitest";
import {
  getDashboardAttention,
  getDashboardNextAction,
  filterDashboardCases,
  needsReadinessCheck,
  type DashboardCase,
} from "@/lib/agency-dashboard-queue";

const today = "2026-10-21";
const caseRow: DashboardCase = {
  id: "case-1",
  caseNumber: "VDC-1",
  clientName: "Client",
  applicantName: "Alex Morgan",
  destination: "Germany",
  visaType: "Student visa",
  status: "in_review",
  dueDate: today,
  updatedAt: "2026-10-20T10:00:00Z",
  reviewerId: "staff",
  reviewerName: "Reviewer",
  reviewerAvatar: null,
  requiredCount: 2,
  uploadedRequiredCount: 2,
  hasChecklist: true,
  reviewState: "current",
  openIssueCount: 0,
  finalSubmissionAt: null,
};

describe("dashboard action queue", () => {
  it("uses calendar due dates, excludes submitted cases and keeps overlapping groups distinct", () => {
    const cases = [
      { ...caseRow, id: "past", dueDate: "2026-10-20", reviewerId: null },
      caseRow,
      { ...caseRow, id: "boundary", dueDate: "2026-10-28" },
      { ...caseRow, id: "later", dueDate: "2026-10-29" },
      { ...caseRow, id: "ready", dueDate: "2026-10-20", status: "ready_to_submit" },
      { ...caseRow, id: "sent", dueDate: "2026-10-20", finalSubmissionAt: "2026-10-20" },
      { ...caseRow, id: "none", dueDate: null },
    ];
    expect(getDashboardAttention({ cases, today })).toMatchObject({
      overdue: 1,
      due_soon: 2,
      unassigned: 1,
    });
  });

  it("distinguishes a saved ready label from a current, complete review", () => {
    expect(needsReadinessCheck({ ...caseRow, status: "ready_to_submit" })).toBe(false);
    for (const change of [
      { reviewState: "outdated" as const },
      { uploadedRequiredCount: 1 },
      { openIssueCount: 1 },
      { hasChecklist: false },
    ]) {
      const row = { ...caseRow, status: "ready_to_submit", ...change };
      expect(needsReadinessCheck(row)).toBe(true);
      expect(getDashboardNextAction(row)).toMatchObject({
        label: "Recheck readiness",
        tab: "review",
      });
    }
  });

  it("selects a useful action without treating uploads as approval", () => {
    expect(getDashboardNextAction({ ...caseRow, reviewerId: null }).label).toBe("Assign reviewer");
    expect(getDashboardNextAction({ ...caseRow, hasChecklist: false }).label).toBe(
      "Generate checklist",
    );
    expect(getDashboardNextAction({ ...caseRow, uploadedRequiredCount: 1 }).tab).toBe("checklist");
    expect(getDashboardNextAction({ ...caseRow, reviewState: "not_started" }).label).toBe(
      "Run review",
    );
    expect(getDashboardNextAction({ ...caseRow, reviewState: "outdated" }).label).toBe(
      "Review again",
    );
    expect(getDashboardNextAction({ ...caseRow, openIssueCount: 2 }).label).toBe("Resolve issues");
    expect(getDashboardNextAction(caseRow).label).toBe("Finalize review");
  });

  it("searches cases and filters attention before paginating, with stable due-date order", () => {
    const cases = [
      caseRow,
      { ...caseRow, id: "past", caseNumber: "VDC-2", dueDate: "2026-10-20" },
      { ...caseRow, id: "none", dueDate: null },
    ];
    expect(
      filterDashboardCases({
        cases,
        today,
        query: "germany",
        status: "all",
        attention: "all",
        sort: "due",
      }).map((row) => row.id),
    ).toEqual(["past", "case-1", "none"]);
    expect(
      filterDashboardCases({
        cases,
        today,
        query: "vdc-2",
        status: "all",
        attention: "overdue",
        sort: "due",
      }),
    ).toHaveLength(1);
    expect(
      filterDashboardCases({
        cases,
        today,
        query: "",
        status: "needs_client",
        attention: "all",
        sort: "due",
      }),
    ).toEqual([]);
    expect(getDashboardAttention({ cases: [], today })).toMatchObject({
      overdue: 0,
      review_outdated: 0,
      recheck: 0,
    });
  });
});
