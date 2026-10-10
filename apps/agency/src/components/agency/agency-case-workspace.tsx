"use client";

import { NativeSelect } from "@/components/ui/native-select";

import type { ReactNode } from "react";
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleAlertIcon,
  SearchIcon,
} from "lucide-react";
import { AgencyCaseDocumentDesk, type AgencyCaseDocument } from "./agency-case-document-desk";
import { ReviewIssueStatusSelect } from "./agency-case-actions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  filterReviewIssues,
  getIssueDocument,
  type ReviewWorkspaceIssue,
} from "@/lib/agency-review-workspace";
import {
  isOpenReviewIssueStatus,
  ISSUE_STATUS_META,
  ISSUE_SEVERITY_META,
  normalizeReviewIssueStatus,
} from "@/lib/agency-workflow";
import styles from "./agency-case-workspace.module.css";

interface WorkspaceIssue extends ReviewWorkspaceIssue {
  source: string;
}
interface AgencyCaseWorkspaceProps {
  applicationId: string;
  issues: WorkspaceIssue[];
  documents: AgencyCaseDocument[];
  missingCount: number;
  isReviewStale: boolean;
  defaultTab: "review" | "checklist";
  checklist: ReactNode;
  notes: ReactNode;
  activity: ReactNode;
}

export function AgencyCaseWorkspace({
  applicationId,
  issues,
  documents,
  missingCount,
  isReviewStale,
  defaultTab,
  checklist,
  notes,
  activity,
}: AgencyCaseWorkspaceProps) {
  const [view, setView] = useQueryStates(
    {
      tab: parseAsStringLiteral(["review", "checklist", "notes", "activity"]).withDefault(
        defaultTab,
      ),
      issue: parseAsString,
      document: parseAsString,
      priority: parseAsStringLiteral(["all", "high", "medium", "low"]).withDefault("all"),
      status: parseAsStringLiteral(["open", "all", "resolved", "dismissed"]).withDefault("open"),
      q: parseAsString.withDefault(""),
    },
    { shallow: true },
  );
  const openIssues = issues.filter((issue) => isOpenReviewIssueStatus(issue.status));
  const statusIssues = issues.filter(
    (issue) =>
      view.status === "all" ||
      (view.status === "open"
        ? isOpenReviewIssueStatus(issue.status)
        : issue.status === view.status),
  );
  const filtered = filterReviewIssues({
    issues,
    documents,
    priority: view.priority,
    status: view.status,
    query: view.q,
  });
  const selectedIssue = filtered.find((issue) => issue.id === view.issue) ?? filtered[0] ?? null;
  const selectedIndex = selectedIssue
    ? filtered.findIndex((issue) => issue.id === selectedIssue.id)
    : -1;
  const sourceDocument = selectedIssue
    ? getIssueDocument({ issue: selectedIssue, documents })
    : null;
  const manualDocument =
    !view.issue || view.issue === selectedIssue?.id
      ? documents.find((document) => document.id === view.document)
      : null;
  const activeDocument =
    manualDocument ?? sourceDocument ?? (!selectedIssue ? (documents[0] ?? null) : null);

  function selectIssue(id: string) {
    void setView({ issue: id, document: null });
  }
  function moveIssue(offset: number) {
    if (!filtered.length) return;
    selectIssue(filtered[(selectedIndex + offset + filtered.length) % filtered.length].id);
  }

  return (
    <Tabs
      value={view.tab}
      onValueChange={(tab) => void setView({ tab: tab as typeof view.tab })}
      className={styles.tabs}
    >
      <TabsList className={styles.tabList} aria-label="Case sections">
        {(["review", "checklist", "notes", "activity"] as const).map((tab) => (
          <TabsTrigger key={tab} value={tab} className={styles.tab}>
            {tab[0].toUpperCase() + tab.slice(1)}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className={styles.body}>
        <div className={styles.left}>
          <TabsContent value="review" className={`${styles.panel} ${styles.reviewPanel}`}>
            {isReviewStale ? (
              <p role="status" className={styles.notice}>
                The previous review is incomplete or no longer matches the documents. Run review
                again before you generate a report or mark the case ready.
              </p>
            ) : null}
            <h2 className={styles.heading}>Needs attention</h2>
            <p className={styles.summary}>
              {openIssues.filter((issue) => issue.severity === "high").length} high priority issues
              and {missingCount} required files missing.
            </p>
            <div className={styles.filters}>
              <div className={styles.filterGroup} aria-label="Issue priority">
                {(
                  [
                    "all",
                    "high",
                    "medium",
                    ...(issues.some((issue) => issue.severity === "low") ? ["low" as const] : []),
                  ] as const
                ).map((priority) => (
                  <button
                    key={priority}
                    type="button"
                    className={styles.filter}
                    aria-label={
                      priority === "all"
                        ? "All issues"
                        : `${ISSUE_SEVERITY_META[priority]?.label} priority issues`
                    }
                    aria-pressed={view.priority === priority}
                    onClick={() => void setView({ priority, issue: null, document: null })}
                  >
                    {priority === "all" ? "All" : ISSUE_SEVERITY_META[priority]?.label}
                    <span>
                      {
                        statusIssues.filter(
                          (issue) => priority === "all" || issue.severity === priority,
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              <div className={styles.search}>
                <SearchIcon />
                <Input
                  aria-label="Search issues"
                  placeholder="Search issues…"
                  value={view.q}
                  onChange={(event) =>
                    void setView({ q: event.target.value, issue: null, document: null })
                  }
                />
              </div>
            </div>
            <label className={styles.statusFilter}>
              Show
              <NativeSelect
                aria-label="Filter issue status"
                value={view.status}
                onChange={(event) =>
                  void setView({
                    status: event.target.value as typeof view.status,
                    issue: null,
                    document: null,
                  })
                }
              >
                <option value="open">Open issues</option>
                <option value="all">All issues</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </NativeSelect>
            </label>
            <div className={styles.tableScroll}>
              <table className={styles.table} aria-label="Review issues">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Issue</th>
                    <th scope="col">Source file</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Open issue</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((issue, index) => {
                    const source = getIssueDocument({ issue, documents });
                    return (
                      <tr key={issue.id} data-selected={selectedIssue?.id === issue.id}>
                        <td>{index + 1}</td>
                        <td>
                          <span className={styles.priority} data-severity={issue.severity}>
                            <CircleAlertIcon />
                            {ISSUE_SEVERITY_META[issue.severity as keyof typeof ISSUE_SEVERITY_META]
                              ?.label ?? issue.severity}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            aria-pressed={selectedIssue?.id === issue.id}
                            aria-label={`Review issue: ${issue.title}`}
                            className={styles.issueButton}
                            onClick={() => selectIssue(issue.id)}
                          >
                            {issue.title}
                          </button>
                        </td>
                        <td>
                          <span className={styles.source} title={source?.fileName}>
                            {source?.fileName ??
                              (issue.documentId || issue.checklistItemId ? "No file" : "Case-wide")}
                          </span>
                        </td>
                        <td>
                          <span
                            className={styles.status}
                            data-open={isOpenReviewIssueStatus(issue.status)}
                          >
                            {ISSUE_STATUS_META[normalizeReviewIssueStatus(issue.status)].label}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            aria-label={`Open finding: ${issue.title}`}
                            onClick={() => selectIssue(issue.id)}
                            className="rounded p-1"
                          >
                            <ChevronRightIcon className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!filtered.length ? (
                <div className={styles.empty}>
                  <p>
                    {issues.length
                      ? "No issues match these filters."
                      : "No tracked issues. Generate the checklist, upload documents, then run review."}
                  </p>
                  {issues.length ? (
                    <button
                      className="mt-3 font-semibold text-primary underline"
                      type="button"
                      onClick={() =>
                        void setView({
                          status: "all",
                          priority: "all",
                          q: "",
                          issue: null,
                          document: null,
                        })
                      }
                    >
                      Show all issues
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {selectedIssue ? (
              <section className={styles.detail} aria-label="Selected issue">
                <div className={styles.detailHeader}>
                  <h3>{selectedIssue.title}</h3>
                  <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                    <span>
                      Issue {selectedIndex + 1} of {filtered.length}
                    </span>
                    <button
                      type="button"
                      aria-label="Previous issue"
                      onClick={() => moveIssue(-1)}
                      disabled={filtered.length < 2}
                    >
                      <ChevronUpIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next issue"
                      onClick={() => moveIssue(1)}
                      disabled={filtered.length < 2}
                    >
                      <ChevronDownIcon className="size-4" />
                    </button>
                  </div>
                </div>
                <div className={styles.detailBody}>
                  <div className={styles.detailColumns}>
                    <div>
                      <h4>Details</h4>
                      <p>{selectedIssue.description}</p>
                    </div>
                    <div>
                      <h4>Recommendation</h4>
                      <p>
                        {selectedIssue.recommendation ||
                          "Check this finding against the current documents."}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {selectedIssue.source === "ai" ? "AI finding" : "Reviewer issue"}
                    {isReviewStale && selectedIssue.source === "ai" ? " — previous review" : ""}
                    {manualDocument && manualDocument.id !== sourceDocument?.id
                      ? " · Viewing a different file"
                      : ""}
                  </p>
                  <div className={styles.detailActions}>
                    <div>
                      <p className="mb-1 text-[11px] font-semibold">Status</p>
                      <ReviewIssueStatusSelect
                        key={selectedIssue.id}
                        issueId={selectedIssue.id}
                        status={selectedIssue.status}
                        showDismiss
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => moveIssue(1)}
                      disabled={filtered.length < 2}
                    >
                      Next issue
                      <ArrowRightIcon />
                    </Button>
                  </div>
                </div>
              </section>
            ) : null}
          </TabsContent>
          <TabsContent value="checklist" className={styles.panel}>
            {checklist}
          </TabsContent>
          <TabsContent value="notes" className={styles.panel}>
            {notes}
          </TabsContent>
          <TabsContent value="activity" className={styles.panel}>
            {activity}
          </TabsContent>
        </div>
        <AgencyCaseDocumentDesk
          applicationId={applicationId}
          document={activeDocument}
          documents={documents}
          noSource={Boolean(selectedIssue && !sourceDocument && !manualDocument)}
          onSelectDocument={(document) => void setView({ document })}
        />
      </div>
    </Tabs>
  );
}
