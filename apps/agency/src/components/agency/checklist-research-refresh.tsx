"use client";

import { useChecklistJob } from "@/hooks/use-checklist-job";
import { Button } from "@/components/ui/button";

export function ChecklistResearchRefresh({
  applicationId,
  applicantId,
}: {
  applicationId: string;
  applicantId: string;
}) {
  const { job, loading, start, error } = useChecklistJob({ applicationId, applicantId });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={() => void start(true)}
      >
        {loading
          ? job?.status === "queued"
            ? "Checklist queued"
            : "Generating checklist..."
          : "Refresh checklist"}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
