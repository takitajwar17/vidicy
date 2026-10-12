import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { getSessionFromCookie, requireAdmin } from "@/utils/auth";
import { ensureAgencyTeamMembership } from "@/server/agency-team";
import { getPendingVerificationPath } from "@/utils/auth-redirect";

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
    redirect(getPendingVerificationPath(redirectTo) as Route);
  }

  return session;
});

// A layout and its page can render at the same time. Check membership before
// page data queries so the layout redirect cannot race an access error.
export const requireAgencyPageSession = cache(async (redirectTo = "/dashboard") => {
  const session = await requireVerifiedPageSession(redirectTo);
  const staff = await ensureAgencyTeamMembership(session);
  if (!staff) {
    redirect(`/agency-setup?redirect=${encodeURIComponent(redirectTo)}` as Route);
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
