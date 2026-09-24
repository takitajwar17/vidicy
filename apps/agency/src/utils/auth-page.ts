import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionFromCookie, requireAdmin } from "@/utils/auth";
import { PENDING_VERIFICATION_ROUTE } from "@/constants";

function getSignInHref(redirectTo?: string): "/sign-in" | `/sign-in?redirect=${string}` {
  if (!redirectTo) {
    return "/sign-in";
  }

  return `/sign-in?redirect=${encodeURIComponent(redirectTo)}`;
}

export const requirePageSession = cache(async (redirectTo?: string) => {
  const session = await getSessionFromCookie();

  if (!session) {
    redirect(getSignInHref(redirectTo));
  }

  return session;
});

export const requireVerifiedPageSession = cache(async (redirectTo?: string) => {
  const session = await requirePageSession(redirectTo);

  if (!session.user.emailVerified) {
    redirect(PENDING_VERIFICATION_ROUTE);
  }

  return session;
});

export const requireAdminPageSession = cache(async () => {
  const session = await requireAdmin({ doNotThrowError: true });

  if (!session) {
    redirect("/");
  }

  return session;
});
