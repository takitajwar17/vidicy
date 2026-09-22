"use client";

import { useEffect } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { ErrorPage } from "@/components/error-page";

export default function LegalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[LegalError]", error);
  }, [error]);

  return (
    <ErrorPage
      icon={AlertTriangleIcon}
      iconColor="text-destructive"
      iconBg="bg-destructive/10"
      iconRing="ring-1 ring-destructive/20"
      glowColor="bg-destructive/6"
      heading="Something went wrong"
      body="We hit an unexpected error loading this page. Please try refreshing, or head back to the home page."
      onRetry={reset}
    />
  );
}
