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

export default async function GoogleCallbackPage() {
  const session = await getSessionFromCookie();

  if (session) {
    return redirect(getSessionRedirectPath({ session }) as Route);
  }

  return <GoogleCallbackClientComponent />;
}
