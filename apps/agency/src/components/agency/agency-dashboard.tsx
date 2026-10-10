"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CircleAlertIcon,
  FileClockIcon,
  SearchIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CaseStatusBadge, ReviewerAvatar } from "@/components/agency/agency-ui";
import {
  DASHBOARD_ATTENTION,
  DASHBOARD_STATUSES,
  filterDashboardCases,
  getDashboardAttention,
  getDashboardNextAction,
  type DashboardCase,
  type DashboardAttention,
} from "@/lib/agency-dashboard-queue";
import { CASE_STATUS_META } from "@/lib/agency-workflow";
import { cn } from "@/lib/utils";

interface DashboardReviewer {
  id: string;
  name: string;
  avatar: string | null;
  active: number;
  ready: number;
}

interface AgencyDashboardProps {
  cases: DashboardCase[];
  reviewers: DashboardReviewer[];
  today: string;
}

const PAGE_SIZE = 8;
const attentionItems = [
  {
    key: "overdue",
    label: "Past due",
    detail: "Due date passed; readiness not confirmed",
    icon: CircleAlertIcon,
    warning: true,
  },
  {
    key: "due_soon",
    label: "Due in 7 days",
    detail: "Includes cases due today",
    icon: CalendarDaysIcon,
    warning: true,
  },
  {
    key: "unassigned",
    label: "Unassigned",
    detail: "Choose a reviewer",
    icon: UserRoundIcon,
    warning: false,
  },
  {
    key: "review_outdated",
    label: "Review out of date",
    detail: "Review the current files",
    icon: FileClockIcon,
    warning: false,
  },
] as const;

function statusLabel(status: string) {
  if (status === "all") return "All";
  if (status === "ready_to_submit") return "Marked ready";
  return CASE_STATUS_META[status as keyof typeof CASE_STATUS_META]?.label ?? status;
}

function dueLabel(date: string | null) {
  if (!date) return "No due date";
  return `Due ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))}`;
}

function DashboardStatus({ row }: { row: DashboardCase }) {
  return row.status === "ready_to_submit" ? (
    <span className="inline-flex rounded border border-primary/15 bg-primary/8 px-2 py-0.5 text-[10px] font-medium text-primary">
      Marked ready
    </span>
  ) : (
    <CaseStatusBadge status={row.status} className="whitespace-nowrap text-[10px]" />
  );
}

function RequiredFiles({ row }: { row: DashboardCase }) {
  if (!row.hasChecklist)
    return <span className="text-[11px] text-muted-foreground">No checklist</span>;
  if (!row.requiredCount)
    return <span className="text-[11px] text-muted-foreground">No required files</span>;
  return (
    <>
      <p className="text-[11px] tabular-nums">
        {row.uploadedRequiredCount} / {row.requiredCount}
      </p>
      <Progress
        aria-label={`Required files uploaded for ${row.caseNumber}`}
        value={(row.uploadedRequiredCount / row.requiredCount) * 100}
        className="mt-1.5 h-1.5 w-20"
      />
    </>
  );
}

export function AgencyDashboard({ cases, reviewers, today: serverToday }: AgencyDashboardProps) {
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    const date = new Date();
    setToday(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    );
  }, []);
  const [view, setView] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      status: parseAsStringLiteral(DASHBOARD_STATUSES).withDefault("all"),
      attention: parseAsStringLiteral(DASHBOARD_ATTENTION).withDefault("all"),
      sort: parseAsStringLiteral(["due", "updated"]).withDefault("due"),
      page: parseAsInteger.withDefault(1),
    },
    { shallow: true },
  );
  const counts = getDashboardAttention({ cases, today });
  const filtered = filterDashboardCases({
    cases,
    today,
    query: view.q,
    status: view.status,
    attention: view.attention,
    sort: view.sort,
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(view.page, pageCount));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilter = view.q || view.status !== "all" || view.attention !== "all";
  const selectedAttention =
    attentionItems.find((item) => item.key === view.attention)?.label ??
    (view.attention === "recheck" ? "Readiness check needed" : null);

  function selectAttention(attention: DashboardAttention) {
    void setView({ attention, status: "all", q: "", page: 1 });
  }

  return (
    <>
      <section aria-label="Case summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {(
          [
            ["all", "Client files", "Total client cases"],
            ["in_review", "In review", "On a reviewer's desk"],
            ["needs_client", "Needs client", "Waiting on client files"],
            ["ready_to_submit", "Marked ready", "Reviewer marked ready"],
          ] as const
        ).map(([status, label, detail]) => (
          <button
            key={status}
            type="button"
            aria-label={`${label}: ${status === "all" ? cases.length : cases.filter((row) => row.status === status).length}`}
            onClick={() => void setView({ status, attention: "all", q: "", page: 1 })}
            className="rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span className="block text-xs font-medium text-muted-foreground">{label}</span>
            <span className="mt-1 block text-3xl font-bold tracking-tight tabular-nums">
              {status === "all"
                ? cases.length
                : cases.filter((row) => row.status === status).length}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {status === "ready_to_submit" && counts.recheck ? (
                <span className="text-status-warning">
                  {counts.recheck} {counts.recheck === 1 ? "case needs" : "cases need"} a readiness
                  check
                </span>
              ) : (
                detail
              )}
            </span>
          </button>
        ))}
      </section>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_330px]">
        <Card className="min-w-0 overflow-hidden rounded-md">
          <CardHeader className="gap-4 space-y-0 p-4 pb-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle role="heading" aria-level={2} className="text-base">
                Client files
              </CardTitle>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <div className="relative min-w-0 flex-1 sm:w-52">
                  <SearchIcon
                    aria-hidden="true"
                    className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
                  />
                  <Input
                    aria-label="Search client files"
                    placeholder="Search client files…"
                    value={view.q}
                    onChange={(event) => void setView({ q: event.target.value, page: 1 })}
                    className="h-9 pl-9"
                  />
                </div>
                <NativeSelect
                  aria-label="Sort client files"
                  value={view.sort}
                  onChange={(event) =>
                    void setView({ sort: event.target.value as "due" | "updated", page: 1 })
                  }
                  className="h-9 rounded-[5px] border border-input bg-card pl-3 text-xs"
                >
                  <option value="due">Due date</option>
                  <option value="updated">Last updated</option>
                </NativeSelect>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1" aria-label="Case status filters">
              {DASHBOARD_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={view.status === status}
                  onClick={() => void setView({ status, page: 1 })}
                  className={cn(
                    "border-b-2 border-transparent px-0.5 py-2.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    view.status === status && "border-primary font-semibold text-primary",
                  )}
                >
                  {statusLabel(status)}{" "}
                  <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
                    {status === "all"
                      ? cases.length
                      : cases.filter((row) => row.status === status).length}
                  </span>
                </button>
              ))}
            </div>
          </CardHeader>
          {activeFilter ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2 text-xs">
              <p role="status">
                {selectedAttention ? `${selectedAttention} · ` : ""}
                {filtered.length} matching {filtered.length === 1 ? "case" : "cases"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void setView({ q: "", status: "all", attention: "all", page: 1 })}
              >
                <XIcon />
                Clear filters
              </Button>
            </div>
          ) : null}
          <Table
            aria-label="Client file work queue"
            className="min-w-[700px] text-xs"
            wrapperClassName="hidden rounded-none border-t border-border md:block"
          >
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Client / destination</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Required files</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead className="pr-4">Reviewer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length ? (
                visible.map((row) => {
                  const action = getDashboardNextAction(row);
                  const href = `/dashboard/${row.id}?tab=${action.tab}` as Route;
                  const late = row.dueDate && row.dueDate < today && !row.finalSubmissionAt;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-56 whitespace-normal py-3.5 pl-4">
                        <Link
                          href={href}
                          className="font-semibold hover:text-primary hover:underline"
                        >
                          {row.applicantName || row.clientName}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {row.visaType} · {row.destination}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {row.caseNumber}{" "}
                          <span className={cn("ml-1", late && "text-status-warning")}>
                            · {dueLabel(row.dueDate)}
                          </span>
                        </p>
                      </TableCell>
                      <TableCell>
                        <DashboardStatus row={row} />
                      </TableCell>
                      <TableCell className="min-w-24">
                        <RequiredFiles row={row} />
                      </TableCell>
                      <TableCell className="max-w-44 whitespace-normal">
                        <Link
                          href={href}
                          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                        >
                          {action.label}
                          <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
                        </Link>
                        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                          {action.detail}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-40 pr-4">
                        <ReviewerAvatar
                          name={row.reviewerName}
                          avatar={row.reviewerAvatar}
                          className="max-w-36"
                          avatarClassName="size-6 text-[9px]"
                          labelClassName="max-w-24 text-[11px]"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    No cases match these filters.{" "}
                    <button
                      type="button"
                      className="font-medium text-primary underline"
                      onClick={() =>
                        void setView({ q: "", status: "all", attention: "all", page: 1 })
                      }
                    >
                      Clear filters
                    </button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div
            className="divide-y divide-border border-t border-border md:hidden"
            role="list"
            aria-label="Client file work queue"
          >
            {visible.map((row) => {
              const action = getDashboardNextAction(row);
              const href = `/dashboard/${row.id}?tab=${action.tab}` as Route;
              return (
                <article role="listitem" key={row.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={href} className="text-sm font-semibold hover:underline">
                        {row.applicantName || row.clientName}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.visaType} · {row.destination}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {row.caseNumber} · {dueLabel(row.dueDate)}
                      </p>
                    </div>
                    <span className="shrink-0">
                      <DashboardStatus row={row} />
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="mb-1 text-[10px] text-muted-foreground">Required files</p>
                      <RequiredFiles row={row} />
                    </div>
                    <ReviewerAvatar
                      name={row.reviewerName}
                      avatar={row.reviewerAvatar}
                      className="min-w-0 max-w-36"
                      avatarClassName="size-6 text-[9px]"
                      labelClassName="max-w-24 text-[11px]"
                    />
                  </div>
                  <Link
                    href={href}
                    className="flex items-center justify-between gap-2 text-xs font-semibold text-primary hover:underline"
                  >
                    {action.label}
                    <ArrowRightIcon aria-hidden="true" className="size-4 shrink-0" />
                  </Link>
                </article>
              );
            })}
            {!visible.length ? (
              <p className="p-6 text-sm text-muted-foreground">No cases match these filters.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <p role="status">
              {filtered.length
                ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} files`
                : "No matching files"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => void setView({ page: page - 1 })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page === pageCount}
                onClick={() => void setView({ page: page + 1 })}
              >
                Next
              </Button>
            </div>
            <Link
              href="/dashboard/applications"
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              View all files
              <ArrowRightIcon className="size-3" />
            </Link>
          </div>
        </Card>

        <aside aria-label="Agency priorities" className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Card className="rounded-md">
            <CardHeader className="space-y-1 p-4 pb-2">
              <CardTitle role="heading" aria-level={2} className="text-base">
                Needs attention
              </CardTitle>
              <p className="text-xs leading-5 text-muted-foreground">
                Open the cases that need a next step.
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {attentionItems.map(({ key, label, detail, icon: Icon, warning }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view.attention === key}
                  onClick={() => selectAttention(view.attention === key ? "all" : key)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b border-border py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    view.attention === key && "bg-accent",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground",
                      warning && counts[key] > 0 && "text-destructive",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">{label}</span>
                    <span className="mt-1 block text-[10px] leading-4 text-muted-foreground">
                      {detail}
                    </span>
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                    {counts[key]}
                  </span>
                  <ArrowRightIcon aria-hidden="true" className="size-3 text-muted-foreground" />
                </button>
              ))}
              <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
                A case can appear in more than one group.
              </p>
              {counts.recheck > 0 ? (
                <button
                  type="button"
                  aria-pressed={view.attention === "recheck"}
                  onClick={() => selectAttention("recheck")}
                  className="mt-3 w-full rounded border border-status-warning/25 bg-status-warning/8 p-3 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <span className="block font-medium text-status-warning">
                    {counts.recheck} marked-ready{" "}
                    {counts.recheck === 1 ? "case needs" : "cases need"} a readiness check
                  </span>
                  <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                    Open cases
                    <ArrowRightIcon className="size-3" />
                  </span>
                </button>
              ) : null}
            </CardContent>
          </Card>
          <Card className="rounded-md">
            <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
              <CardTitle role="heading" aria-level={2} className="text-base">
                Reviewer workload
              </CardTitle>
              <Link
                href="/dashboard/team"
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                View team
              </Link>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {reviewers.length ? (
                reviewers.slice(0, 5).map((reviewer) => (
                  <div
                    key={reviewer.id}
                    className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0 last:pb-0"
                  >
                    <ReviewerAvatar
                      name={reviewer.name}
                      avatar={reviewer.avatar}
                      className="min-w-0"
                      labelClassName="max-w-28 text-xs"
                    />
                    <div className="shrink-0 text-right text-xs">
                      <p className="font-semibold tabular-nums">{reviewer.active} active</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {reviewer.ready} marked ready
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-3 text-xs text-muted-foreground">No reviewers in the team yet.</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
