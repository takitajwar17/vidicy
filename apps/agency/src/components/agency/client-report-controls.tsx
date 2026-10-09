"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import {
  sendClientReportAction,
  updateClientReportRecipientAction,
} from "@/actions/agency-case.action";
import { useCsrfToken } from "@/components/csrf-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClientReportControls({
  reportId,
  recipient,
  canSend,
  isPendingDelivery,
  canEditRecipient,
}: {
  reportId: string;
  recipient: string | null;
  canSend: boolean;
  isPendingDelivery: boolean;
  canEditRecipient: boolean;
}) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const emailId = useId();
  const [email, setEmail] = useState(recipient ?? "");
  const { execute, isPending } = useServerAction(sendClientReportAction);
  const { execute: saveRecipient, isPending: isSavingRecipient } = useServerAction(
    updateClientReportRecipientAction,
  );
  const hasUnsavedRecipient =
    canEditRecipient && email.trim().toLowerCase() !== (recipient ?? "").trim().toLowerCase();
  async function updateRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) {
      toast.error("Refresh the page to load the security token.");
      return;
    }
    const [result, error] = await saveRecipient({ reportId, email, csrfToken });
    if (error) {
      toast.error(error.message || "The recipient could not be saved.");
      return;
    }
    if (result) setEmail(result.email);
    toast.success("Report recipient saved.");
    router.refresh();
  }
  async function sendReport() {
    if (!csrfToken) {
      toast.error("Refresh the page to load the security token.");
      return;
    }
    const [result, error] = await execute({ reportId, csrfToken });
    if (error) {
      toast.error(
        error.message || "Delivery could not be confirmed. Refresh the report before retrying.",
      );
      router.refresh();
      return;
    }
    toast.success(
      result?.alreadySent
        ? "The provider already accepted this report."
        : "The email provider accepted this report.",
    );
    router.refresh();
  }
  return (
    <div className="flex flex-wrap gap-3 print:hidden">
      {canEditRecipient ? (
        <form onSubmit={updateRecipient} className="flex w-full flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor={emailId}>Report recipient</Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isPending || isSavingRecipient}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={isPending || isSavingRecipient || !csrfToken || !hasUnsavedRecipient}
          >
            {isSavingRecipient ? "Saving…" : "Save recipient"}
          </Button>
        </form>
      ) : null}
      <Button variant="outline" onClick={() => window.print()}>
        Print / Save as PDF
      </Button>
      <Button asChild variant="outline">
        <a href={`/api/client-reports/${reportId}`} download>
          Download report
        </a>
      </Button>
      {canSend ? (
        <Button
          disabled={
            isPending || isSavingRecipient || hasUnsavedRecipient || !recipient || !csrfToken
          }
          onClick={sendReport}
        >
          {isPending
            ? "Sending…"
            : isPendingDelivery
              ? "Check / retry delivery"
              : `Send report to ${recipient ?? "client"}`}
        </Button>
      ) : null}
    </div>
  );
}
