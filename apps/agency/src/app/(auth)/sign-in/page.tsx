import { Metadata } from "next";
import { getSessionFromCookie } from "@/utils/auth";
import { redirect } from "next/navigation";
import type { Route } from "next";
import SignInClientPage from "./sign-in.client";
import { getSessionRedirectPath, normalizeRedirectPath } from "@/utils/auth-redirect";
import { getConfig } from "@/flags";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your account",
};

const SignInPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) => {
  const { redirect: redirectParam } = await searchParams;
  const [session, config] = await Promise.all([
    getSessionFromCookie(),
    getConfig(),
  ]);
  const redirectPath = normalizeRedirectPath(redirectParam);

  if (session) {
    return redirect(getSessionRedirectPath({
      session,
      verifiedRedirectPath: redirectPath,
    }) as Route);
  }

  return (
    <SignInClientPage
      redirectPath={redirectPath}
      isGoogleSSOEnabled={config.isGoogleSSOEnabled}
    />
  )
}

export default SignInPage;
