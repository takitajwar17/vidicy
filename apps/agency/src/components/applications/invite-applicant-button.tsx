"use client";

import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { SendIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resendApplicantInviteAction } from "@/actions/applicant.action";

interface InviteApplicantButtonProps {
  applicationId: string;
  applicantId: string;
  applicantName: string;
}

export function InviteApplicantButton({
  applicationId,
  applicantId,
  applicantName,
}: InviteApplicantButtonProps) {
  const { execute, isPending } = useServerAction(resendApplicantInviteAction, {
    onSuccess: () => {
      toast.success(`Invitation sent to ${applicantName}.`);
    },
    onError: ({ err }) => {
      toast.error(err.message ?? "Failed to send invitation.");
    },
  });

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-primary"
      title={`Send portal invite to ${applicantName}`}
      disabled={isPending}
      onClick={() => execute({ applicationId, applicantId })}
    >
      {isPending ? (
        <Loader2Icon className="h-4 w-4 animate-spin" />
      ) : (
        <SendIcon className="h-4 w-4" />
      )}
    </Button>
  );
}
