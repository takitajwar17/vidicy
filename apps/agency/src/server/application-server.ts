import "server-only";
import { getDB } from "@/db";
import {
  APPLICATION_PERMISSIONS,
  visaApplicationTable,
  uploadedDocumentTable,
  documentEvaluationTable,
  applicantTable,
  applicationMembershipTable,
  applicationInvitationTable,
  supportTicketTable,
  supportMessageTable,
  userTable,
} from "@/db/schema";
import { requireVerifiedEmail } from "@/utils/auth";
import { ZSAError } from "zsa";
import { eq, desc, inArray, count, and, asc, isNull } from "drizzle-orm";
import { updateAllSessionsOfUser, deleteAllSessionsOfUser } from "@/infra/kv-session";
import { logger } from "@/infra/logger";
import { requireApplicationPermission } from "@/utils/application-auth";
import { MARKETING_EVENT_TYPE } from "@/db/schema";
import { recordMarketingEvent } from "@/server/marketing/events";

export async function createVisaApplicationWorkspace({
  userId,
  homeCountry,
  currentCountry,
  destinationCountry,
  visaType,
  embassy,
}: {
  userId: string;
  homeCountry: string;
  currentCountry: string;
  destinationCountry: string;
  visaType: string;
  embassy: string;
}) {
  const db = getDB();

  // Check limit — count applications this user has created
  const [countResult] = await db
    .select({ total: count() })
    .from(visaApplicationTable)
    .where(eq(visaApplicationTable.userId, userId));

  const existingCount = countResult?.total ?? 0;

  // First application ever → free trial
  const isFreeTrialApp = existingCount === 0;

  // Build application name
  const baseName = `${destinationCountry} — ${visaType} Visa`;

  // Insert the application
  const [newApp] = await db
    .insert(visaApplicationTable)
    .values({
      userId,
      homeCountry,
      currentCountry,
      destinationCountry,
      visaType,
      embassy,
      name: baseName,
      isFreeTrialApp: isFreeTrialApp,
    })
    .returning();

  if (!newApp) throw new ZSAError("INTERNAL_SERVER_ERROR", "Could not create application");

  await recordMarketingEvent({
    db,
    type: MARKETING_EVENT_TYPE.APPLICATION_CREATED,
    userId,
    applicationId: newApp.id,
  });

  return { applicationId: newApp.id, name: baseName, isFreeTrialApp: isFreeTrialApp };
}

export async function getUserApplications() {
  const session = await requireVerifiedEmail();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");

  const db = getDB();

  // Fetch apps owned by user + apps where user is a linked applicant/member
  const [ownedApps, linkedApplicantRows, membershipRows] = await Promise.all([
    db
      .select()
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.userId, session.userId))
      .orderBy(desc(visaApplicationTable.createdAt)),
    db
      .select({ applicationId: applicantTable.applicationId })
      .from(applicantTable)
      .where(eq(applicantTable.userId, session.userId)),
    db
      .select({ applicationId: applicationMembershipTable.applicationId })
      .from(applicationMembershipTable)
      .where(
        and(
          eq(applicationMembershipTable.userId, session.userId),
          eq(applicationMembershipTable.isActive, 1),
        ),
      ),
  ]);

  // Find linked app IDs that aren't already in owned apps
  const ownedIds = new Set(ownedApps.map((a) => a.id));
  const extraIds = Array.from(
    new Set(
      [...linkedApplicantRows, ...membershipRows]
        .map((r) => r.applicationId)
        .filter((id) => !ownedIds.has(id)),
    ),
  );

  let applications = ownedApps;

  if (extraIds.length > 0) {
    const extraApps = await db
      .select()
      .from(visaApplicationTable)
      .where(inArray(visaApplicationTable.id, extraIds))
      .orderBy(desc(visaApplicationTable.createdAt));
    applications = [...ownedApps, ...extraApps];
  }

  if (applications.length === 0) return [];

  // Single query for all evaluations — avoids N+1 on dashboard load
  const appIds = applications.map((a) => a.id);
  const allEvaluations = await db
    .select({
      id: documentEvaluationTable.id,
      applicationId: documentEvaluationTable.applicationId,
      applicantId: documentEvaluationTable.applicantId,
      overallScore: documentEvaluationTable.overallScore,
      riskLevel: documentEvaluationTable.riskLevel,
      summary: documentEvaluationTable.summary,
      redFlags: documentEvaluationTable.redFlags,
      strengths: documentEvaluationTable.strengths,
      recommendations: documentEvaluationTable.recommendations,
      scoreConfidence: documentEvaluationTable.scoreConfidence,
      ensembleDivergence: documentEvaluationTable.ensembleDivergence,
      createdAt: documentEvaluationTable.createdAt,
    })
    .from(documentEvaluationTable)
    .where(inArray(documentEvaluationTable.applicationId, appIds))
    .orderBy(desc(documentEvaluationTable.createdAt));

  // Evaluations are already ordered desc; first hit per applicationId is the latest
  const latestByApp = new Map<string, (typeof allEvaluations)[0]>();
  for (const ev of allEvaluations) {
    if (!latestByApp.has(ev.applicationId)) {
      latestByApp.set(ev.applicationId, ev);
    }
  }

  return applications.map((app) => ({
    ...app,
    latestEvaluation: latestByApp.get(app.id) ?? null,
  }));
}

/**
 * Lightweight application list optimized for nav/app switcher.
 * Avoids loading evaluation payloads to keep route transitions snappy.
 */
export async function getUserApplicationsLite() {
  const session = await requireVerifiedEmail();
  if (!session) throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");

  const db = getDB();

  // Fetch apps owned by user + apps where user is a linked applicant/member
  const [ownedApps, linkedApplicantRows, membershipRows] = await Promise.all([
    db
      .select({
        id: visaApplicationTable.id,
        name: visaApplicationTable.name,
        destinationCountry: visaApplicationTable.destinationCountry,
        visaType: visaApplicationTable.visaType,
        createdAt: visaApplicationTable.createdAt,
      })
      .from(visaApplicationTable)
      .where(
        and(
          eq(visaApplicationTable.userId, session.userId),
          isNull(visaApplicationTable.trashedAt),
        ),
      )
      .orderBy(desc(visaApplicationTable.createdAt)),
    db
      .select({ applicationId: applicantTable.applicationId })
      .from(applicantTable)
      .where(eq(applicantTable.userId, session.userId)),
    db
      .select({ applicationId: applicationMembershipTable.applicationId })
      .from(applicationMembershipTable)
      .where(
        and(
          eq(applicationMembershipTable.userId, session.userId),
          eq(applicationMembershipTable.isActive, 1),
        ),
      ),
  ]);

  const ownedIds = new Set(ownedApps.map((a) => a.id));
  const extraIds = Array.from(
    new Set(
      [...linkedApplicantRows, ...membershipRows]
        .map((r) => r.applicationId)
        .filter((id) => !ownedIds.has(id)),
    ),
  );

  let applications = ownedApps;

  if (extraIds.length > 0) {
    const extraApps = await db
      .select({
        id: visaApplicationTable.id,
        name: visaApplicationTable.name,
        destinationCountry: visaApplicationTable.destinationCountry,
        visaType: visaApplicationTable.visaType,
        createdAt: visaApplicationTable.createdAt,
      })
      .from(visaApplicationTable)
      .where(
        and(inArray(visaApplicationTable.id, extraIds), isNull(visaApplicationTable.trashedAt)),
      )
      .orderBy(desc(visaApplicationTable.createdAt));

    applications = [...ownedApps, ...extraApps];
  }

  return applications;
}

export async function updateApplicationSettings({
  applicationId,
  name,
}: {
  applicationId: string;
  name: string;
}) {
  await requireApplicationPermission(
    applicationId,
    APPLICATION_PERMISSIONS.EDIT_APPLICATION_SETTINGS,
  );
  const db = getDB();
  const [updated] = await db
    .update(visaApplicationTable)
    .set({ name, updatedAt: new Date() })
    .where(eq(visaApplicationTable.id, applicationId))
    .returning();
  if (!updated) throw new ZSAError("NOT_FOUND", "Application not found");

  // Refresh all sessions so the updated name propagates
  const session = await requireVerifiedEmail();
  if (session) await updateAllSessionsOfUser(session.userId);

  return updated;
}

export async function deleteApplication({ applicationId }: { applicationId: string }) {
  const session = await requireApplicationPermission(
    applicationId,
    APPLICATION_PERMISSIONS.DELETE_APPLICATION,
  );
  const db = getDB();

  // Verify it exists
  const existing = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, applicationId),
  });
  if (!existing) throw new ZSAError("NOT_FOUND", "Application not found");

  // Collect all uploaded documents before deleting so we can clean up R2 + Vectorize afterwards
  const docsToDelete = await db.query.uploadedDocumentTable.findMany({
    where: eq(uploadedDocumentTable.applicationId, applicationId),
    columns: { id: true, fileKey: true, chunkCount: true },
  });

  // Child rows are removed automatically via ON DELETE CASCADE on all FK references to visa_application.id
  await db.delete(visaApplicationTable).where(eq(visaApplicationTable.id, applicationId));

  // Clean up R2 objects and Vectorize embeddings — non-fatal; log on failure but don't block the response
  if (docsToDelete.length > 0) {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = await getCloudflareContext({ async: true });

      const deletions: Promise<unknown>[] = [];

      // Delete R2 files
      if (env.R2) {
        deletions.push(...docsToDelete.map((doc) => env.R2!.delete(doc.fileKey)));
      }

      // Delete Vectorize embeddings for all documents that were indexed
      if (env.VECTORIZE) {
        const vectorIds = docsToDelete.flatMap((doc) =>
          doc.chunkCount > 0
            ? Array.from({ length: doc.chunkCount }, (_, i) => `${doc.id}-${i}`)
            : [],
        );
        if (vectorIds.length > 0) {
          deletions.push(env.VECTORIZE.deleteByIds(vectorIds));
        }
      }

      await Promise.all(deletions);
    } catch (cleanupError) {
      logger.warn("R2/Vectorize cleanup partially failed during application delete", {
        applicationId,
        cleanupError,
      });
    }
  }

  // Refresh sessions
  await updateAllSessionsOfUser(session.userId);
  logger.info("Application deleted", { applicationId, userId: session.userId });

  // Clear the lastActiveApp cookie if it pointed to the deleted application
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    if (cookieStore.get("lastActiveApp")?.value === applicationId) {
      cookieStore.delete("lastActiveApp");
    }
  } catch {
    // cookie operations are only available inside a request context
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Admin-only helpers — no per-app permission checks
// ---------------------------------------------------------------------------

/**
 * Delete an application without checking user permissions (admin-initiated).
 * Handles R2 + Vectorize cleanup identical to `deleteApplication()`.
 */
export async function deleteApplicationAsAdmin({ applicationId }: { applicationId: string }) {
  const db = getDB();

  const docsToDelete = await db.query.uploadedDocumentTable.findMany({
    where: eq(uploadedDocumentTable.applicationId, applicationId),
    columns: { id: true, fileKey: true, chunkCount: true },
  });

  await db.delete(visaApplicationTable).where(eq(visaApplicationTable.id, applicationId));

  if (docsToDelete.length > 0) {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = await getCloudflareContext({ async: true });
      const deletions: Promise<unknown>[] = [];

      if (env.R2) {
        deletions.push(...docsToDelete.map((doc) => env.R2!.delete(doc.fileKey)));
      }
      if (env.VECTORIZE) {
        const vectorIds = docsToDelete.flatMap((doc) =>
          doc.chunkCount > 0
            ? Array.from({ length: doc.chunkCount }, (_, i) => `${doc.id}-${i}`)
            : [],
        );
        if (vectorIds.length > 0) {
          deletions.push(env.VECTORIZE.deleteByIds(vectorIds));
        }
      }
      await Promise.all(deletions);
    } catch (cleanupError) {
      logger.warn("R2/Vectorize cleanup failed (admin delete)", { applicationId, cleanupError });
    }
  }

  logger.info("Application deleted by admin", { applicationId });
}

/** Numeric rank for ownership-transfer precedence. */
const SYSTEM_ROLE_RANK: Record<string, number> = { admin: 3, editor: 2, viewer: 1 };

/**
 * Delete a user from the admin panel with proper cascading:
 *  - Owned apps with other members → transfer ownership to highest-role member
 *  - Owned apps with no members → delete entirely (R2/Vectorize cleanup)
 *  - Memberships in other apps, invitations, support data, sessions → cleaned up
 */
export async function adminDeleteUser({ userId }: { userId: string }) {
  const db = getDB();

  let appsTransferred = 0;
  let appsDeleted = 0;

  // 1. Handle all applications owned by this user
  const ownedApps = await db
    .select({ id: visaApplicationTable.id })
    .from(visaApplicationTable)
    .where(eq(visaApplicationTable.userId, userId));

  for (const app of ownedApps) {
    // Find active members (excluding the user being deleted)
    const members = await db
      .select({
        id: applicationMembershipTable.id,
        userId: applicationMembershipTable.userId,
        roleId: applicationMembershipTable.roleId,
        isSystemRole: applicationMembershipTable.isSystemRole,
        joinedAt: applicationMembershipTable.joinedAt,
        createdAt: applicationMembershipTable.createdAt,
      })
      .from(applicationMembershipTable)
      .where(
        and(
          eq(applicationMembershipTable.applicationId, app.id),
          eq(applicationMembershipTable.isActive, 1),
        ),
      )
      .orderBy(asc(applicationMembershipTable.createdAt));

    // Filter out the user being deleted (they might also be a member)
    const candidates = members.filter((m) => m.userId !== userId);

    if (candidates.length > 0) {
      // Transfer ownership to best candidate
      candidates.sort((a, b) => {
        const rankA = a.isSystemRole ? (SYSTEM_ROLE_RANK[a.roleId] ?? 0) : 0;
        const rankB = b.isSystemRole ? (SYSTEM_ROLE_RANK[b.roleId] ?? 0) : 0;
        if (rankB !== rankA) return rankB - rankA; // higher rank first
        // Tiebreak: earliest joiner
        const dateA = a.joinedAt ?? a.createdAt;
        const dateB = b.joinedAt ?? b.createdAt;
        if (dateA && dateB) return dateA.getTime() - dateB.getTime();
        return 0;
      });

      const newOwner = candidates[0];

      // Transfer ownership
      await db
        .update(visaApplicationTable)
        .set({ userId: newOwner.userId, updatedAt: new Date() })
        .where(eq(visaApplicationTable.id, app.id));

      // Remove new owner's membership row (owners don't need one)
      await db
        .delete(applicationMembershipTable)
        .where(eq(applicationMembershipTable.id, newOwner.id));

      appsTransferred++;
      logger.info("Application ownership transferred", {
        applicationId: app.id,
        fromUserId: userId,
        toUserId: newOwner.userId,
      });
    } else {
      // No other members — delete the application entirely
      try {
        await deleteApplicationAsAdmin({ applicationId: app.id });
        appsDeleted++;
      } catch (error) {
        logger.warn("Failed to delete application during admin user deletion", {
          applicationId: app.id,
          userId,
          error,
        });
      }
    }
  }

  // 2. Remove memberships in other users' applications
  await db.delete(applicationMembershipTable).where(eq(applicationMembershipTable.userId, userId));

  // 3. Clean up invitations
  await db
    .delete(applicationInvitationTable)
    .where(eq(applicationInvitationTable.invitedBy, userId));
  await db
    .update(applicationInvitationTable)
    .set({ acceptedBy: null })
    .where(eq(applicationInvitationTable.acceptedBy, userId));

  // 4. Clean up support data (screenshots from R2, then messages, then tickets)
  const tickets = await db
    .select({ id: supportTicketTable.id, screenshotUrls: supportTicketTable.screenshotUrls })
    .from(supportTicketTable)
    .where(eq(supportTicketTable.userId, userId));

  const ticketIds = tickets.map((t) => t.id);
  let allScreenshotKeys = tickets.flatMap((t) => t.screenshotUrls ?? []);

  if (ticketIds.length > 0) {
    const messages = await db
      .select({ screenshotUrls: supportMessageTable.screenshotUrls })
      .from(supportMessageTable)
      .where(inArray(supportMessageTable.ticketId, ticketIds));
    allScreenshotKeys = allScreenshotKeys.concat(messages.flatMap((m) => m.screenshotUrls ?? []));
  }

  if (allScreenshotKeys.length > 0) {
    try {
      const { getCloudflareContext } = await import("@opennextjs/cloudflare");
      const { env } = await getCloudflareContext({ async: true });
      if (env.R2) {
        await Promise.all(allScreenshotKeys.map((key) => env.R2!.delete(key)));
      }
    } catch (error) {
      logger.warn("R2 cleanup for support screenshots failed (admin delete)", { userId, error });
    }
  }

  if (ticketIds.length > 0) {
    for (const ticketId of ticketIds) {
      await db.delete(supportMessageTable).where(eq(supportMessageTable.ticketId, ticketId));
    }
  }
  await db.delete(supportTicketTable).where(eq(supportTicketTable.userId, userId));

  // 5. Delete all KV sessions
  await deleteAllSessionsOfUser(userId);

  // 6. Delete the user record
  await db.delete(userTable).where(eq(userTable.id, userId));

  logger.info("User deleted by admin", { userId, appsTransferred, appsDeleted });

  return { appsTransferred, appsDeleted };
}
