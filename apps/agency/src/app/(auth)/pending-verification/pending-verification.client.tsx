"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AuthDivider } from "@/components/auth-divider";
import { Spinner } from "@/components/ui/spinner";
import { resendVerificationAction } from "@/app/(auth)/resend-verification.action";
import { EMAIL_RESEND_COOLDOWN_MS, EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS } from "@/constants";
import useSignOut from "@/hooks/useSignOut";
import isProd from "@/utils/is-prod";
import { AuthShell } from "../_components/auth-shell";

export default function PendingVerificationClient({
  email,
}: {
  email: string;
}) {
  const router = useRouter();
  const { signOut } = useSignOut();
  const [lastResendTime, setLastResendTime] = useState<number | null>(null);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const { execute: resendVerification, status } = useServerAction(resendVerificationAction, {
    onError: (error) => {
      toast.dismiss();
      toast.error(error.err?.message || "Failed to send verification email");
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

  const canResend = !lastResendTime || Date.now() - lastResendTime > EMAIL_RESEND_COOLDOWN_MS;
  const isResending = status === "pending";

  const handleCheckAgain = async () => {
    setIsCheckingVerification(true);
    router.refresh();
    setTimeout(() => {
      setIsCheckingVerification(false);
    }, 500);
  };

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      window.location.href = "/sign-in";
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <AuthShell
      testimonial={{
        quote:
          "Our reviewers turned the morning file backlog into exact client fixes before lunch.",
        author: "Agency Operations Manager",
      }}
    >
      <div className="space-y-2.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
          Verify your email
        </h1>
        <p className="text-sm leading-6 text-muted-foreground/90">
          Your account is ready, but you need to verify{" "}
          <span className="font-medium text-foreground">{email}</span> before you can continue.
          The verification link expires in{" "}
          {Math.floor(EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS / 3600)} hours.
        </p>
      </div>

      {!isProd && (
        <Alert variant="warning">
          <AlertTitle>Development mode</AlertTitle>
          <AlertDescription>You can find the verification link in the console.</AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        <Button
          className="h-11 w-full bg-sidebar text-sm font-semibold tracking-[0.01em] text-sidebar-foreground hover:bg-sidebar/90"
          disabled={isResending || !canResend}
          onClick={() => resendVerification()}
        >
          {isResending
            ? "Sending..."
            : !canResend
              ? "Please wait 1 minute before resending"
              : "Resend verification email"}
        </Button>

        <AuthDivider>or</AuthDivider>

        <Button
          variant="outline"
          className="h-11 w-full text-sm font-semibold tracking-[0.01em]"
          disabled={isCheckingVerification}
          onClick={handleCheckAgain}
        >
          {isCheckingVerification ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Checking verification...
            </>
          ) : (
            "I've verified my email"
          )}
        </Button>

        <Button
          variant="ghost"
          className="h-11 w-full text-sm font-semibold tracking-[0.01em]"
          disabled={isSigningOut}
          onClick={handleSignOut}
        >
          {isSigningOut ? "Signing out..." : "Sign out"}
        </Button>
      </div>
    </AuthShell>
  );
}
