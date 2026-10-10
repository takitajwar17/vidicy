import { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../_components/auth-shell";
import { Button } from "@/components/ui/button";
import { getRuntimeContext } from "@/infra/runtime-context";
import ResetPasswordClientComponent from "./reset-password.client";
import { getResetTokenKey } from "@/utils/auth-utils";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Set a new password for your account",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;

  if (!token) {
    return <ExpiredResetLink />;
  }

  const { env } = getRuntimeContext();

  if (!env?.NEXT_INC_CACHE_KV) {
    throw new Error("Can't connect to KV store");
  }

  const resetTokenStr = await env.NEXT_INC_CACHE_KV.get(getResetTokenKey(token));

  if (!resetTokenStr) {
    return <ExpiredResetLink />;
  }

  return <ResetPasswordClientComponent token={token} />;
}

function ExpiredResetLink() {
  return (
    <AuthShell>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Request a new reset link</h1>
        <p className="text-sm text-muted-foreground">
          This password reset link has expired or is invalid.
        </p>
      </div>
      <Button asChild className="w-full">
        <Link href="/forgot-password">Request a new link</Link>
      </Button>
      <Button asChild variant="outline" className="w-full">
        <Link href="/sign-in">Back to sign in</Link>
      </Button>
    </AuthShell>
  );
}
