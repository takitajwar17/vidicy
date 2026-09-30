import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { PENDING_VERIFICATION_ROUTE } from "@/constants";
import { getApplicationAccessForCurrentSession } from "./application-auth";

export const requireApplicationPagePermission = cache(async (applicationId: string, permission?: string) => {
  const { hasAccess, session } = await getApplicationAccessForCurrentSession(
    applicationId,
    permission,
  );

  if (!session) {
    redirect("/sign-in");
  }

  if (!session.user.emailVerified) {
    redirect(PENDING_VERIFICATION_ROUTE);
  }

  if (!hasAccess) {
    notFound();
  }

  return session;
});
