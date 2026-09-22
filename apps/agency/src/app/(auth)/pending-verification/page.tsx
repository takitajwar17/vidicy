import { Metadata } from "next";
import { getSessionFromCookie } from "@/utils/auth";
import { redirect } from "next/navigation";
import PendingVerificationClient from "./pending-verification.client";
import type { Route } from "next";
import { getAuthRouteHref, normalizeRedirectPath } from "@/utils/auth-redirect";

export const metadata: Metadata = {
  title: "Verify your email",
  description: "Finish verifying your email address to continue",
};

export default async function PendingVerificationPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect: redirectParam } = await searchParams;
  const session = await getSessionFromCookie();
  const redirectPath = normalizeRedirectPath(redirectParam);

  if (!session) {
    return redirect(getAuthRouteHref("/sign-in", redirectPath) as Route);
  }

  if (session.user.emailVerified) {
    return redirect(redirectPath as Route);
  }

  return <PendingVerificationClient email={session.user.email ?? ""} />;
}
