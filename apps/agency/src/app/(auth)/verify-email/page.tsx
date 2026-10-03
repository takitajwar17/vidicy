import { Metadata } from "next";
import type { Route } from "next";
import { getSessionFromCookie } from "@/utils/auth";
import { redirect } from "next/navigation";
import VerifyEmailClientComponent from "./verify-email.client";
import { REDIRECT_AFTER_SIGN_IN } from "@/constants";
import { getSessionRedirectPath } from "@/utils/auth-redirect";

export const metadata: Metadata = {
  title: "Verify email",
  description: "Verify your email address",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [session, params] = await Promise.all([getSessionFromCookie(), searchParams]);
  const token = params.token;

  if (session?.user.emailVerified) {
    return redirect(REDIRECT_AFTER_SIGN_IN);
  }

  if (!token) {
    if (session) {
      return redirect(getSessionRedirectPath({ session }) as Route);
    }
    return redirect('/sign-in');
  }

  return <VerifyEmailClientComponent token={token} />;
}
