import "server-only";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { getDB } from "@/db";
import {
  AGENCY_STAFF_STATUS,
  agencyTeamMemberTable,
  applicantTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema";
import { logger } from "@/infra/logger";

function resolveLinkedApplicantName(
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null,
  fallbackEmail: string,
): string | null {
  const fullName = [user?.firstName?.trim(), user?.lastName?.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  const email = user?.email ?? fallbackEmail;
  const localPart = email.split("@")[0]?.trim();
  return localPart || null;
}

/**
 * Link verified accounts to applicant records inside their existing agency.
 * A new signup cannot change applicant data in another agency through its email.
 * Non-fatal — swallows errors to avoid disrupting the sign-up flow.
 */
export async function linkApplicantRecordsByEmail({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  try {
    const db = getDB();
    const normalizedEmail = email.trim().toLowerCase();
    const user = await db.query.userTable.findFirst({
      where: eq(userTable.id, userId),
      columns: {
        firstName: true,
        lastName: true,
        email: true,
        emailVerified: true,
      },
    });
    if (!user?.emailVerified || user.email?.trim().toLowerCase() !== normalizedEmail) return;

    const membership = await db.query.agencyTeamMemberTable.findFirst({
      where: and(
        eq(agencyTeamMemberTable.userId, userId),
        eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
      ),
      columns: { agencyId: true },
    });
    if (!membership?.agencyId) return;

    const applications = await db.query.visaApplicationTable.findMany({
      where: eq(visaApplicationTable.agencyId, membership.agencyId),
      columns: { id: true },
    });
    if (!applications.length) return;

    const linkedApplicantName = resolveLinkedApplicantName(user ?? null, normalizedEmail);

    await db
      .update(applicantTable)
      .set({
        userId,
        ...(linkedApplicantName ? { name: linkedApplicantName } : {}),
      })
      .where(
        and(
          eq(applicantTable.email, normalizedEmail),
          isNull(applicantTable.userId),
          inArray(
            applicantTable.applicationId,
            applications.map((application) => application.id),
          ),
        ),
      );
  } catch (error) {
    logger.warn("Failed to link applicant records by email on sign-up", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
