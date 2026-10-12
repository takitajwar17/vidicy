"use client";

import type { ReactNode } from "react";
import { BookOpenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ChecklistSourcesDialog({
  children,
  applicantName,
}: {
  children: ReactNode;
  applicantName?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <BookOpenIcon />
          View sources
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="px-6 pb-4 pt-6 text-left">
          <DialogTitle>Checklist sources</DialogTitle>
          <DialogDescription>
            {applicantName
              ? `Saved references for ${applicantName}.`
              : "Saved references for this checklist."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
