"use client";

import { useEffect } from "react";
import { AlertTriangleIcon, LockKeyholeIcon } from "lucide-react";
import { ErrorPage } from "@/components/error-page";

const isForbidden = (error: Error) =>
  error.message?.toLowerCase().includes("forbidden") ||
  error.message?.toLowerCase().includes("don't have access") ||
  error.message?.toLowerCase().includes("not authorized");

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[WorkspaceError]", error);
  }, [error]);

  const forbidden = isForbidden(error);

  return (
    <ErrorPage
      icon={forbidden ? LockKeyholeIcon : AlertTriangleIcon}
      iconColor={forbidden ? "text-amber-500" : "text-destructive"}
      iconBg={forbidden ? "bg-amber-500/10" : "bg-destructive/10"}
      iconRing={forbidden ? "ring-1 ring-amber-500/20" : "ring-1 ring-destructive/20"}
      glowColor={forbidden ? "bg-amber-500/8" : "bg-destructive/6"}
      heading={forbidden ? "You don't have access to this" : "Something went wrong"}
      body={
        forbidden
          ? "This visa application belongs to a different account. Make sure you're signed in with the right email, or return to your own applications."
          : "We hit an unexpected snag loading this page. This is usually temporary — try refreshing or head back to your applications."
      }
      onRetry={forbidden ? undefined : reset}
    />
  );
}

