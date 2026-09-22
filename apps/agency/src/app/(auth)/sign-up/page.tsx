import { Metadata } from "next";
import { getSessionFromCookie } from "@/utils/auth";
import SignUpClientComponent from "./sign-up.client";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/spinner";
import { getSessionRedirectPath, normalizeRedirectPath } from "@/utils/auth-redirect";
import { getConfig } from "@/flags";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a new account",
};

const SignUpPage = async ({
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
    <Suspense fallback={
      <div className="min-h-[90vh] flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    }>
      <SignUpClientComponent
        redirectPath={redirectPath}
        isGoogleSSOEnabled={config.isGoogleSSOEnabled}
      />
    </Suspense>
  );
}

export default SignUpPage;
