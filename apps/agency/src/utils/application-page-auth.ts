import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { PENDING_VERIFICATION_ROUTE } from "@/constants";
import { getDB } from "@/db";
import { visaApplicationTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getApplicationAccessForCurrentSession } from "./application-auth";
import { requireVerifiedPageSession } from "./auth-page";

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

export const requireApplicationOwnerPage = cache(async (applicationId: string) => {
  const session = await requireVerifiedPageSession();
  const db = getDB();
  const app = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, applicationId),
    columns: { userId: true },
  });

  if (!app || app.userId !== session.userId) {
    notFound();
  }

  return session;
});
