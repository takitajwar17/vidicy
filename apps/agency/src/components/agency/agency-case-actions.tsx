"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import {
  BrainCircuitIcon,
  CheckCircle2Icon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENCY_CASE_STATUS,
  REVIEW_ISSUE_SEVERITY,
  REVIEW_ISSUE_STATUS,
} from "@/db/schema";

interface StaffOption {
  userId: string;
  label: string;
}

export function AgencyCaseToolbar({
  applicationId,
  status,
  assignedReviewerId,
  staff,
  hasEvaluation,
}: {
  applicationId: string;
  status: string;
  assignedReviewerId: string | null;
  staff: StaffOption[];
  hasEvaluation: boolean;
}) {
  const router = useRouter();
  const [statusValue, setStatusValue] = useState(status);
  const [reviewerValue, setReviewerValue] = useState(assignedReviewerId ?? "unassigned");
  const { execute: updateStatus, isPending: updatingStatus } = useServerAction(updateAgencyCaseStatusAction);
  const { execute: assignCase, isPending: assigning } = useServerAction(assignAgencyCaseAction);
  const { execute: syncIssues, isPending: syncing } = useServerAction(syncReviewIssuesFromEvaluationAction);
  const { execute: generateReport, isPending: reporting } = useServerAction(generateClientReportAction);
  const { execute: finalize, isPending: finalizing } = useServerAction(finalizeReviewAction);

  useEffect(() => {
    setStatusValue(status);
  }, [status]);

  useEffect(() => {
    setReviewerValue(assignedReviewerId ?? "unassigned");
  }, [assignedReviewerId]);

  async function handleStatusChange(nextStatus: string) {
    setStatusValue(nextStatus);
    const [, error] = await updateStatus({
      applicationId,
      status: nextStatus as (typeof AGENCY_CASE_STATUS)[keyof typeof AGENCY_CASE_STATUS],
    });
    if (error) {
      toast.error("Could not update case status.");
      setStatusValue(status);
      return;
    }
    toast.success("Case status updated.");
    router.refresh();
  }

  async function handleReviewerChange(nextReviewerId: string) {
    setReviewerValue(nextReviewerId);
    const [, error] = await assignCase({
      applicationId,
      reviewerId: nextReviewerId === "unassigned" ? "" : nextReviewerId,
    });
    if (error) {
      toast.error("Could not assign reviewer.");
      setReviewerValue(assignedReviewerId ?? "unassigned");
      return;
    }
    toast.success(nextReviewerId === "unassigned" ? "Reviewer unassigned." : "Reviewer assigned.");
    router.refresh();
  }

  async function handleSyncIssues() {
    const [result, error] = await syncIssues({ applicationId });
    if (error) {
      toast.error(error.message ?? "Run AI review before syncing issues.");
      return;
    }
    toast.success(`${result?.createdCount ?? 0} issue${result?.createdCount === 1 ? "" : "s"} synced.`);
    router.refresh();
  }

  async function handleGenerateReport() {
    const [, error] = await generateReport({ applicationId });
    if (error) {
      toast.error("Could not generate client report.");
      return;
    }
    toast.success("Client report is ready.");
    router.refresh();
  }

  async function handleFinalize() {
    const [, error] = await finalize({ applicationId });
    if (error) {
      toast.error("Could not finalize review.");
      return;
    }
    toast.success("Case marked ready to submit.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={statusValue} onValueChange={handleStatusChange} disabled={updatingStatus}>
        <SelectTrigger className="h-11 w-[190px] rounded-2xl bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.values(AGENCY_CASE_STATUS).map((caseStatus) => (
            <SelectItem key={caseStatus} value={caseStatus}>
              {caseStatus.replaceAll("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={reviewerValue} onValueChange={handleReviewerChange} disabled={assigning}>
        <SelectTrigger className="h-11 w-[210px] rounded-2xl bg-card">
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
      <Button type="button" variant="outline" onClick={handleSyncIssues} disabled={!hasEvaluation || syncing}>
        {syncing ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <BrainCircuitIcon className="h-4 w-4" />}
        Sync AI flags
      </Button>
      <Button type="button" variant="outline" onClick={handleGenerateReport} disabled={reporting}>
        {reporting ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <FileTextIcon className="h-4 w-4" />}
        Client report
      </Button>
      <Button type="button" onClick={handleFinalize} disabled={finalizing}>
        {finalizing ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <CheckCircle2Icon className="h-4 w-4" />}
        Finalize review
      </Button>
    </div>
  );
}

export function ReviewIssueStatusSelect({
  issueId,
  status,
}: {
  issueId: string;
  status: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const { execute, isPending } = useServerAction(updateReviewIssueStatusAction);

  useEffect(() => {
    setValue(status);
  }, [status]);

  async function handleChange(nextStatus: string) {
    setValue(nextStatus);
    const [, error] = await execute({
      issueId,
      status: nextStatus as (typeof REVIEW_ISSUE_STATUS)[keyof typeof REVIEW_ISSUE_STATUS],
    });

    if (error) {
      toast.error("Could not update issue.");
      setValue(status);
      return;
    }

    router.refresh();
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="h-9 rounded-xl bg-card text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(REVIEW_ISSUE_STATUS).map((issueStatus) => (
          <SelectItem key={issueStatus} value={issueStatus}>
            {issueStatus.replaceAll("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
        <Label className="text-xs font-bold text-muted-foreground">Reviewer issue</Label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Missing bank statement" required />
      </div>
      <div className="grid gap-2">
        <Label className="text-xs font-bold text-muted-foreground">Description</Label>
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What needs reviewer or client attention?" required />
      </div>
      <div className="grid gap-2">
        <Label className="text-xs font-bold text-muted-foreground">Client action</Label>
        <Textarea value={recommendation} onChange={(event) => setRecommendation(event.target.value)} placeholder="What should the client send or fix?" />
      </div>
      <div className="grid gap-2">
        <Label className="text-xs font-bold text-muted-foreground">Severity</Label>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="h-10 rounded-xl bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.values(REVIEW_ISSUE_SEVERITY).map((issueSeverity) => (
              <SelectItem key={issueSeverity} value={issueSeverity}>
                {issueSeverity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
        Add issue
      </Button>
    </form>
  );
}
