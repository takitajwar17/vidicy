import "server-only";
import { eq, and, isNull } from "drizzle-orm";
import { getDB } from "@/db";
import { applicantTable, userTable } from "@/db/schema";
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
 * Link pre-existing applicant records to a newly created user account.
 * Called after any new user account is created (email/password, Google OAuth).
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
      },
    });
    const linkedApplicantName = resolveLinkedApplicantName(user ?? null, normalizedEmail);

    await db
      .update(applicantTable)
      .set({
        userId,
        ...(linkedApplicantName ? { name: linkedApplicantName } : {}),
      })
      .where(and(eq(applicantTable.email, normalizedEmail), isNull(applicantTable.userId)));
  } catch (error) {
    logger.warn("Failed to link applicant records by email on sign-up", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
