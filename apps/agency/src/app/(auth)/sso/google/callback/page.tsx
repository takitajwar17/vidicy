import { Metadata } from "next";
import type { Route } from "next";
import { getSessionFromCookie } from "@/utils/auth";
import { redirect } from "next/navigation";
import GoogleCallbackClientComponent from "./google-callback.client";
import { getSessionRedirectPath } from "@/utils/auth-redirect";

export const metadata: Metadata = {
  title: "Complete Google sign-in",
  description: "Complete your sign in with Google",
};

export default async function GoogleCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string }>;
}) {
  const [session, params] = await Promise.all([getSessionFromCookie(), searchParams]);

  if (session) {
    return redirect(getSessionRedirectPath({ session }) as Route);
  }

  return <GoogleCallbackClientComponent code={params.code ?? ""} state={params.state ?? ""} />;
}
