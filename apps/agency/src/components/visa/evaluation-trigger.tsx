"use client";

import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { useServerAction } from "zsa-react";
import type { getLatestReviewJob } from "@/server/review-jobs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2Icon, RefreshCwIcon, BrainCircuitIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { evaluateDocumentsAction, getReviewJobAction } from "@/actions/evaluation.action";

interface EvaluationTriggerProps {
  applicationId: string;
  applicantId: string;
  hasDocuments: boolean;
  /** When true, renders as a re-run (refresh icon + "Re-run" label). */
  rerun?: boolean;
  checklistHref?: string;
  className?: string;
  blockedReason?: string | null;
  blockedLabel?: string;
  compact?: boolean;
}

export function EvaluationTrigger({
  applicationId,
  applicantId,
  hasDocuments,
  rerun = false,
  checklistHref,
  className,
  blockedReason,
  blockedLabel,
  compact = false,
}: EvaluationTriggerProps) {
  const router = useRouter();
  const [job, setJob] = useState<Awaited<ReturnType<typeof getLatestReviewJob>>>(null);
  const { execute, isPending } = useServerAction(evaluateDocumentsAction);
  const { execute: readStatus } = useServerAction(getReviewJobAction);
  const readStatusRef = useRef(readStatus);
  readStatusRef.current = readStatus;
  const wasPending = useRef(false);
  const pending = job?.status === "queued" || job?.status === "running";
  const loading = isPending || pending;
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const [current, error] = await readStatusRef.current({ applicationId, applicantId });
      if (cancelled) return;
      if (error) {
        timer = setTimeout(poll, 5000);
        return;
      }
      setJob(current ?? null);
      const active = current?.status === "queued" || current?.status === "running";
      if (wasPending.current && !active) router.refresh();
      wasPending.current = active;
      if (active) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [applicationId, applicantId, job?.id, router]);

  async function handleEvaluate() {
    const [result, error] = await execute({ applicationId, applicantId });
    if (error) {
      toast.error(error.message || "Review could not start. Please try again.");
      const [saved] = await readStatusRef.current({ applicationId, applicantId });
      if (saved) {
        setJob(saved);
        router.refresh();
      }
    } else if (result) {
      wasPending.current = true;
      setJob(result);
      router.refresh();
      toast.success("Review queued. You can leave this page and return later.");
    }
  }

  const canReview = hasDocuments && !blockedReason;
  const IdleIcon = !canReview ? UploadIcon : rerun ? RefreshCwIcon : BrainCircuitIcon;
  const idleLabel = canReview
    ? rerun
      ? "Re-run Review"
      : "Review Available Documents"
    : (blockedLabel ?? "Upload Documents First");

  if (!canReview && checklistHref) {
    return (
      <Button asChild variant="outline" className="gap-2">
        <Link href={checklistHref as Route}>
          <UploadIcon className="h-4 w-4" />
          {idleLabel}
        </Link>
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        onClick={handleEvaluate}
        disabled={loading || !canReview}
        variant={compact ? "default" : rerun ? "outline" : "default"}
        size={compact || rerun ? "sm" : "default"}
        title={blockedReason ?? undefined}
        className={className ?? "gap-2"}
      >
        {loading ? (
          <>
            <Loader2Icon className="h-4 w-4 animate-spin" />
            {job?.status === "queued" ? "Review queued" : "Reviewing..."}
          </>
        ) : (
          <>
            <IdleIcon className="h-4 w-4" />
            {idleLabel}
          </>
        )}
      </Button>
      {job?.status === "failed" ? (
        <span role="alert" className="text-sm text-destructive">
          {job.error || "Review failed. Run it again."}
        </span>
      ) : null}
      {blockedReason && !compact ? (
        <span className="text-xs text-muted-foreground">{blockedReason}</span>
      ) : null}
    </div>
  );
}
