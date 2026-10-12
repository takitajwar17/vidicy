"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { generateChecklistAction, getChecklistJobAction } from "@/actions/checklist.action";
import type { getLatestChecklistJob } from "@/server/checklist-jobs";

type ChecklistJob = Awaited<ReturnType<typeof getLatestChecklistJob>>;

export function useChecklistJob({
  applicationId,
  applicantId,
}: {
  applicationId: string;
  applicantId: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<ChecklistJob>(null);
  const { execute, isPending } = useServerAction(generateChecklistAction);
  const { execute: readStatus } = useServerAction(getChecklistJobAction);
  const readStatusRef = useRef(readStatus);
  readStatusRef.current = readStatus;
  const completed = useRef<string | null>(null);
  const pending = job?.status === "queued" || job?.status === "running";
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
      if (current?.status === "succeeded" && completed.current !== current.id) {
        completed.current = current.id;
        router.refresh();
      }
      if (active) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [applicationId, applicantId, job?.id, router]);

  async function start(refreshResearch = false) {
    const [result, error] = await execute({ applicationId, applicantId, refreshResearch });
    if (error) {
      toast.error(error.message || "Checklist generation could not start. Please try again.");
      const [saved] = await readStatusRef.current({ applicationId, applicantId });
      if (saved) setJob(saved);
    } else if (result) {
      setJob(result);
      toast.success("Checklist queued. You can leave this page and return later.");
    }
  }
  return {
    job,
    loading: isPending || pending,
    start,
    error: job?.status === "failed" ? job.error : null,
  };
}
