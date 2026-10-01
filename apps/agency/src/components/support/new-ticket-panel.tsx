"use client";

import { ChevronLeftIcon, PlusCircleIcon } from "lucide-react";
import { SubmitTicketForm } from "./submit-ticket-form";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface NewTicketPanelProps {
  onBack: () => void;
}

export function NewTicketPanel({
  onBack,
}: NewTicketPanelProps) {
  const router = useRouter();

  function handleSuccess() {
    // After submitting, refresh the page data (so new ticket appears in list) and go back
    router.refresh();
    onBack();
  }

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Header */}
      <div className="h-14 px-4 lg:px-6 bg-card border-b flex items-center gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="h-8 w-8 -ml-1"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <PlusCircleIcon className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">New Support Ticket</span>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-xl w-full">
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed text-center">
            Describe your issue and we&apos;ll get back to you as soon as
            possible. For bugs, include steps to reproduce.
          </p>
          <SubmitTicketForm onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
}
