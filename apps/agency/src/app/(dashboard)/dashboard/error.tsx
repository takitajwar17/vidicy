"use client";

import { useEffect } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { ErrorPage } from "@/components/error-page";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <ErrorPage
      icon={AlertTriangleIcon}
      iconColor="text-destructive"
      iconBg="bg-destructive/10"
      iconRing="ring-1 ring-destructive/20"
      glowColor="bg-destructive/6"
      heading="Something went wrong"
      body="We couldn't load your dashboard. This is usually temporary — try refreshing or come back in a moment."
      onRetry={reset}
    />
  );
}
