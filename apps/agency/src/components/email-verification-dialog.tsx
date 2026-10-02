"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSessionStore } from "@/state/session";
import { useServerAction } from "zsa-react";
import { resendVerificationAction } from "@/app/(auth)/resend-verification.action";
import { toast } from "sonner";
import { useState } from "react";
import { EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS, EMAIL_RESEND_COOLDOWN_MS } from "@/constants";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import isProd from "@/utils/is-prod";
import { usePathname } from "next/navigation";

const pagesToBypass = [
  "/pending-verification",
  "/verify-email",
  "/sign-in",
  "/sign-up",
  "/",
  "/privacy",
  "/terms",
  "/reset-password",
  "/forgot-password",
];

const pagesToBypassPrefix = ["/dashboard/support"];

export function EmailVerificationDialog() {
  const session = useSessionStore((state) => state.session);
  const [lastResendTime, setLastResendTime] = useState<number | null>(null);
  const pathname = usePathname();

  const { execute: resendVerification, status } = useServerAction(resendVerificationAction, {
    onError: (error) => {
      toast.dismiss();
      toast.error(error.err?.message);
    },
    onStart: () => {
      toast.loading("Sending verification email...");
    },
    onSuccess: () => {
      toast.dismiss();
      toast.success("Verification email sent");
      setLastResendTime(Date.now());
    },
  });

  // Don't show the dialog if the user is not logged in, if their email is already verified,
  // or if we're on the verify-email page
  if (
    !session ||
    session.user.emailVerified ||
    pagesToBypass.includes(pathname) ||
    pagesToBypassPrefix.some((prefix) => pathname.startsWith(prefix))
  ) {
    return null;
  }

  const canResend = !lastResendTime || Date.now() - lastResendTime > EMAIL_RESEND_COOLDOWN_MS;
  const isLoading = status === "pending";

  return (
    <Dialog
      open
      modal
      onOpenChange={(newState) => {
        if (newState === false) {
          toast.warning("Please verify your email before you continue");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-2.5 text-left">
          <DialogTitle className="text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
            Verify your email
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-muted-foreground/90">
            Please verify your email address to access all features. We sent a verification link to{" "}
            <span className="font-medium text-foreground">{session.user.email}</span>. The verification link will expire in{" "}
            {Math.floor(EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS / 3600)} hours.
          </DialogDescription>
          {!isProd && (
            <Alert variant="warning" className="mt-2 mb-1">
              <AlertTitle>Development mode</AlertTitle>
              <AlertDescription>You can find the verification link in the console.</AlertDescription>
            </Alert>
          )}
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Button
            onClick={() => resendVerification()}
            disabled={isLoading || !canResend}
            className="h-11 w-full bg-sidebar text-sm font-semibold tracking-[0.01em] text-sidebar-foreground hover:bg-sidebar/90"
          >
            {isLoading
              ? "Sending..."
              : !canResend
                ? "Please wait 1 minute before resending"
                : "Resend verification email"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
