"use client";

import { useEffect } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { ErrorPage } from "@/components/error-page";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AdminError]", error);
  }, [error]);

  return (
    <ErrorPage
      icon={AlertTriangleIcon}
      iconColor="text-destructive"
      iconBg="bg-destructive/10"
      iconRing="ring-1 ring-destructive/20"
      glowColor="bg-destructive/6"
      heading="Something went wrong"
      body="We couldn't load this admin page. Try refreshing or head back to the admin dashboard."
      onRetry={reset}
    />
  );
}
