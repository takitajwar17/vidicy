"use client";

import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { sendClientReportAction } from "@/actions/agency-case.action";
import { useCsrfToken } from "@/components/csrf-provider";
import { Button } from "@/components/ui/button";

export function ClientReportControls({
  reportId,
  recipient,
  canSend,
  isPendingDelivery,
}: {
  reportId: string;
  recipient: string | null;
  canSend: boolean;
  isPendingDelivery: boolean;
}) {
  const router = useRouter();
  const csrfToken = useCsrfToken();
  const { execute, isPending } = useServerAction(sendClientReportAction);
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
      <Button variant="outline" onClick={() => window.print()}>
        Print / Save as PDF
      </Button>
      <Button asChild variant="outline">
        <a href={`/api/client-reports/${reportId}`} download>
          Download report
        </a>
      </Button>
      {canSend ? (
        <Button disabled={isPending || !recipient || !csrfToken} onClick={sendReport}>
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
