"use client";

import { ChevronLeftIcon } from "lucide-react";
import { SubmitTicketForm } from "./submit-ticket-form";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";

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
      <PageHeader
        items={[
          { href: "/dashboard" as Route, label: "Dashboard" },
          { href: "/dashboard/support" as Route, label: "Support" },
          { href: "/dashboard/support" as Route, label: "New support thread" },
        ]}
      />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-xl w-full">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="mb-6 -ml-2"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Back to support threads
          </Button>
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
