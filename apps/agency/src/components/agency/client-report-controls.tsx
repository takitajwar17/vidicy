"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { Send } from "lucide-react";
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
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        {canEditRecipient ? (
          <form
            onSubmit={updateRecipient}
            className="flex w-full min-w-0 max-w-2xl flex-wrap items-end gap-3"
          >
            <div className="min-w-0 flex-[1_1_220px] space-y-2">
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
        ) : recipient ? (
          <div className="space-y-1 text-sm">
            <p className="text-xs text-muted-foreground">Report recipient</p>
            <p className="break-all font-medium">{recipient}</p>
          </div>
        ) : null}
        {canSend ? (
          <Button
            disabled={
              isPending || isSavingRecipient || hasUnsavedRecipient || !recipient || !csrfToken
            }
            onClick={sendReport}
            variant="secondary"
            className="shrink-0"
          >
            <Send aria-hidden="true" />
            {isPending ? "Sending…" : isPendingDelivery ? "Check / retry delivery" : "Send report"}
          </Button>
        ) : null}
      </div>
      {!recipient && canEditRecipient ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Save a client email address before sending this report.
        </p>
      ) : null}
    </div>
  );
}
