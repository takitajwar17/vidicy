"use client";

import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import {
  BrainCircuitIcon,
  CheckCircle2Icon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  MoreHorizontalIcon,
  LockKeyholeIcon,
} from "lucide-react";

import {
  addReviewIssueAction,
  assignAgencyCaseAction,
  finalizeReviewAction,
  generateClientReportAction,
  syncReviewIssuesFromEvaluationAction,
  updateAgencyCaseStatusAction,
  updateReviewIssueStatusAction,
} from "@/actions/agency-case.action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import styles from "./agency-case-workspace.module.css";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENCY_CASE_STATUS_OPTIONS,
  CASE_STATUS_META,
  ISSUE_STATUS_META,
  ISSUE_SEVERITY_META,
  normalizeAgencyCaseStatus,
  normalizeReviewIssueStatus,
} from "@/lib/agency-workflow";
import {
  REVIEW_ISSUE_SEVERITY,
  REVIEW_ISSUE_STATUS_OPTIONS,
  type ReviewIssueStatusValue,
} from "@/db/schema";

interface StaffOption {
  userId: string;
  label: string;
}

export function AgencyCaseToolbar({
  applicationId,
  hasEvaluation,
  blockedReason,
  children,
}: {
  applicationId: string;
  hasEvaluation: boolean;
  blockedReason: string | null;
  children?: ReactNode;
}) {
  const router = useRouter();
  const { execute: syncIssues, isPending: syncing } = useServerAction(
    syncReviewIssuesFromEvaluationAction,
  );
  const { execute: generateReport, isPending: reporting } = useServerAction(
    generateClientReportAction,
  );
  const { execute: finalize, isPending: finalizing } = useServerAction(finalizeReviewAction);

  async function handleSyncIssues() {
    const [result, error] = await syncIssues({ applicationId });
    if (error) {
      toast.error(error.message ?? "Run document review before syncing issues.");
      return;
    }
    toast.success(
      `${result?.createdCount ?? 0} issue${result?.createdCount === 1 ? "" : "s"} synced.`,
    );
    router.refresh();
  }

  async function handleGenerateReport() {
    const [report, error] = await generateReport({ applicationId });
    if (error) {
      toast.error(error.message ?? "Could not generate client report.");
      return;
    }
    toast.success("Client report is ready.");
    if (report?.id) router.push(`/dashboard/reports/${report.id}`);
    router.refresh();
  }

  async function handleFinalize() {
    const [, error] = await finalize({ applicationId });
    if (error) {
      toast.error(error.message || "Could not finalize review.");
      return;
    }
    toast.success("Case marked ready to submit.");
    router.refresh();
  }

  return (
    <div className={styles.footerActions}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleGenerateReport}
        disabled={!hasEvaluation || reporting}
      >
        {reporting ? <Loader2Icon className="animate-spin" /> : <FileTextIcon />}Client report
      </Button>
      {children}
      <div className={styles.finalize}>
        <Button
          type="button"
          size="sm"
          onClick={handleFinalize}
          disabled={Boolean(blockedReason) || finalizing}
          aria-describedby={blockedReason ? "finalize-blocked-reason" : undefined}
        >
          {finalizing ? (
            <Loader2Icon className="animate-spin" />
          ) : blockedReason ? (
            <LockKeyholeIcon />
          ) : (
            <CheckCircle2Icon />
          )}
          Finalize review
        </Button>
        {blockedReason ? <small id="finalize-blocked-reason">{blockedReason}</small> : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="Review options">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={handleSyncIssues} disabled={!hasEvaluation || syncing}>
            <BrainCircuitIcon className="mr-2 size-4" />
            Sync review flags
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AgencyCaseAssignmentSelect({
  applicationId,
  assignedReviewerId,
  staff,
}: {
  applicationId: string;
  assignedReviewerId: string | null;
  staff: StaffOption[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(assignedReviewerId ?? "unassigned");
  const { execute, isPending } = useServerAction(assignAgencyCaseAction);
  useEffect(() => {
    setValue(assignedReviewerId ?? "unassigned");
  }, [assignedReviewerId]);
  async function handleChange(nextId: string) {
    setValue(nextId);
    const [, error] = await execute({
      applicationId,
      reviewerId: nextId === "unassigned" ? "" : nextId,
    });
    if (error) {
      setValue(assignedReviewerId ?? "unassigned");
      toast.error("Could not assign reviewer.");
      return;
    }
    toast.success("Reviewer assignment updated.");
    router.refresh();
  }
  return (
    <Select value={value} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger
        aria-label="Assigned reviewer"
        className="h-7 w-auto max-w-[210px] gap-2 border-0 bg-transparent px-2 pr-3 text-xs shadow-none"
      >
        <SelectValue placeholder="Assign reviewer" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {staff.map((member) => (
          <SelectItem key={member.userId} value={member.userId}>
            {member.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AgencyCaseStatusSelect({
  applicationId,
  status,
}: {
  applicationId: string;
  status: string;
}) {
  const router = useRouter();
  const [statusValue, setStatusValue] = useState(normalizeAgencyCaseStatus(status));
  const { execute: updateStatus, isPending } = useServerAction(updateAgencyCaseStatusAction);

  useEffect(() => {
    setStatusValue(normalizeAgencyCaseStatus(status));
  }, [status]);

  async function handleStatusChange(nextStatus: string) {
    const normalizedStatus = normalizeAgencyCaseStatus(nextStatus);
    setStatusValue(normalizedStatus);
    const [, error] = await updateStatus({
      applicationId,
      status: normalizedStatus,
    });
    if (error) {
      toast.error(error.message || "Could not update case status.");
      setStatusValue(normalizeAgencyCaseStatus(status));
      return;
    }
    router.refresh();
  }

  return (
    <Select value={statusValue} onValueChange={handleStatusChange} disabled={isPending}>
      <SelectTrigger
        aria-label="Case status"
        className="h-7 w-auto shrink-0 rounded-full border-primary/25 bg-primary/8 px-3 text-xs font-bold text-primary shadow-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AGENCY_CASE_STATUS_OPTIONS.map((caseStatus) => (
          <SelectItem key={caseStatus} value={caseStatus}>
            {CASE_STATUS_META[caseStatus].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ReviewIssueStatusSelect({
  issueId,
  status,
  showDismiss = false,
}: {
  issueId: string;
  status: string;
  showDismiss?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(normalizeReviewIssueStatus(status));
  const { execute, isPending } = useServerAction(updateReviewIssueStatusAction);

  useEffect(() => {
    setValue(normalizeReviewIssueStatus(status));
  }, [status]);

  async function handleChange(nextStatus: string) {
    const normalizedStatus = normalizeReviewIssueStatus(nextStatus);
    setValue(normalizedStatus);
    const [, error] = await execute({
      issueId,
      status: normalizedStatus as ReviewIssueStatusValue,
    });

    if (error) {
      toast.error("Could not update issue.");
      setValue(normalizeReviewIssueStatus(status));
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger
          aria-label="Issue status"
          className="h-8 min-w-36 rounded-md bg-card text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REVIEW_ISSUE_STATUS_OPTIONS.map((issueStatus) => (
            <SelectItem key={issueStatus} value={issueStatus}>
              {ISSUE_STATUS_META[issueStatus].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showDismiss ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending || value === "dismissed"}
          onClick={() => handleChange("dismissed")}
        >
          Dismiss issue
        </Button>
      ) : null}
    </div>
  );
}

export function AddReviewIssueForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [severity, setSeverity] = useState<string>(REVIEW_ISSUE_SEVERITY.MEDIUM);
  const { execute, isPending } = useServerAction(addReviewIssueAction);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [result, error] = await execute({
      applicationId,
      title,
      description,
      recommendation,
      severity: severity as (typeof REVIEW_ISSUE_SEVERITY)[keyof typeof REVIEW_ISSUE_SEVERITY],
      clientVisible: true,
    });

    if (error || !result) {
      toast.error(error?.message ?? "Could not add review issue.");
      return;
    }

    setTitle("");
    setDescription("");
    setRecommendation("");
    setSeverity(REVIEW_ISSUE_SEVERITY.MEDIUM);
    toast.success("Issue added.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-2">
        <Label htmlFor="review-issue-title" className="text-xs font-bold text-muted-foreground">
          Reviewer issue
        </Label>
        <Input
          id="review-issue-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Missing bank statement"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label
          htmlFor="review-issue-description"
          className="text-xs font-bold text-muted-foreground"
        >
          Description
        </Label>
        <Textarea
          id="review-issue-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What needs reviewer or client attention?"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label
          htmlFor="review-issue-recommendation"
          className="text-xs font-bold text-muted-foreground"
        >
          Client action
        </Label>
        <Textarea
          id="review-issue-recommendation"
          value={recommendation}
          onChange={(event) => setRecommendation(event.target.value)}
          placeholder="What should the client send or fix?"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="review-issue-severity" className="text-xs font-bold text-muted-foreground">
          Severity
        </Label>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger id="review-issue-severity" className="h-10 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(REVIEW_ISSUE_SEVERITY).map((issueSeverity) => (
              <SelectItem key={issueSeverity} value={issueSeverity}>
                {ISSUE_SEVERITY_META[issueSeverity].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <Loader2Icon className="h-4 w-4 animate-spin" />
        ) : (
          <PlusIcon className="h-4 w-4" />
        )}
        Add issue
      </Button>
    </form>
  );
}
