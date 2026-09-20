"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2Icon, LayoutListIcon } from "lucide-react";
import { generateChecklistAction } from "@/actions/checklist.action";
import { toast } from "sonner";

interface ChecklistGeneratorProps {
  applicationId: string;
  applicantId: string;
  applicantName: string;
}

export function ChecklistGenerator({
  applicationId,
  applicantId,
  applicantName,
}: ChecklistGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleGenerate() {
    setLoading(true);

    const [, err] = await generateChecklistAction({
      applicationId,
      applicantId,
    });

    if (err) {
      toast.error(
        err.message ?? "Failed to generate checklist. Please try again.",
      );
      setLoading(false);
      return;
    }

    router.refresh();
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-center gap-5 py-16 px-4 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
        <div className="absolute inset-0 bg-primary blur-2xl rounded-full opacity-15 scale-150" />
        <LayoutListIcon className="h-10 w-10 text-primary relative z-10" />
      </div>
      <div className="space-y-2 max-w-sm">
        <p className="text-lg font-semibold">
          No checklist for {applicantName} yet
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Generate a personalized document checklist based on your visa type,
          embassy, and application details.
        </p>
      </div>
      <Button
        onClick={handleGenerate}
        disabled={loading}
        className="gap-2 shadow-lg hover:shadow-primary/10 transition-all hover:-translate-y-0.5"
      >
        {loading ? (
          <>
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Generating checklist...
          </>
        ) : (
          <>
            <LayoutListIcon className="h-4 w-4" />
            Generate Checklist
          </>
        )}
      </Button>
    </div>
  );
}
