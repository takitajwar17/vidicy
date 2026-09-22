"use client";

import { useEffect, useState } from "react";
import { Loader2Icon, AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const POLL_STORAGE_KEY = "vidicy-payment-poll-start";
const POLL_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;

export function PaymentSuccessPoll() {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(POLL_STORAGE_KEY);
    const startTime = stored ? Number(stored) : Date.now();
    if (!stored) sessionStorage.setItem(POLL_STORAGE_KEY, String(startTime));

    // Already past the deadline from a previous reload cycle
    if (Date.now() - startTime > POLL_TIMEOUT_MS) {
      setTimedOut(true);
      return;
    }

    const interval = setInterval(() => {
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }
      window.location.reload();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  if (timedOut) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <AlertCircleIcon className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-1.5 max-w-sm">
          <p className="text-lg font-semibold">Taking longer than expected</p>
          <p className="text-sm text-muted-foreground">
            Your payment was received. Workspace activation is still processing — this can take up to a minute.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 mt-2">
          <Button
            variant="default"
            onClick={() => {
              sessionStorage.removeItem(POLL_STORAGE_KEY);
              window.location.reload();
            }}
          >
            Try again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/support">Contact Support</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Don&apos;t worry — your payment is safe. If the issue persists, our team will resolve it within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-20 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <Loader2Icon className="h-8 w-8 text-primary animate-spin" />
      </div>
      <div className="space-y-1.5 max-w-xs">
        <p className="text-lg font-semibold">Activating your workspace…</p>
        <p className="text-sm text-muted-foreground">
          Payment received. We&apos;re setting things up — this takes just a moment.
        </p>
      </div>
    </div>
  );
}
