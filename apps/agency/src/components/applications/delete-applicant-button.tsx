"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteApplicantAction } from "@/actions/applicant.action";

interface DeleteApplicantButtonProps {
  applicationId: string;
  applicantId: string;
  applicantName: string;
  isPrimary: boolean;
}

export function DeleteApplicantButton({
  applicationId,
  applicantId,
  applicantName,
  isPrimary,
}: DeleteApplicantButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { execute, isPending } = useServerAction(deleteApplicantAction, {
    onSuccess: () => {
      setOpen(false);
      toast.success("Applicant removed.");
      router.refresh();
    },
    onError: ({ err }) => {
      toast.error(err.message ?? "Failed to remove applicant.");
    },
  });

  if (isPrimary) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground/40 cursor-not-allowed"
        disabled
        title="Cannot delete the primary applicant"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title={`Delete ${applicantName}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete applicant?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{applicantName}</strong> along with their
            checklist, uploaded documents, and evaluations. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={() => execute({ applicationId, applicantId })}
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
