import "server-only";
import { getDB } from "@/db";
import {
  AGENCY_STAFF_ROLE,
  AGENCY_STAFF_STATUS,
  APPLICATION_PERMISSIONS,
  applicationInvitationTable,
  applicationMembershipTable,
  agencyTeamMemberTable,
  supportTicketTable,
  supportMessageTable,
  uploadedDocumentTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema";
import { ZSAError } from "zsa";
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { updateAllSessionsOfUser, deleteAllSessionsOfUser } from "@/infra/kv-session";
import { logger } from "@/infra/logger";
import { requireApplicationPermission } from "@/utils/application-auth";

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

async function getReplacementAgencyOwner({ userId }: { userId: string }) {
  const db = getDB();
  const activeStaff = await db
    .select({
      userId: agencyTeamMemberTable.userId,
      role: agencyTeamMemberTable.role,
      joinedAt: agencyTeamMemberTable.joinedAt,
      createdAt: agencyTeamMemberTable.createdAt,
    })
    .from(agencyTeamMemberTable)
	    .where(
	      and(
	        isNotNull(agencyTeamMemberTable.userId),
	        ne(agencyTeamMemberTable.userId, userId),
	        eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
	      ),
    );

  activeStaff.sort((a, b) => {
    const rankA = a.role === AGENCY_STAFF_ROLE.ADMIN ? 1 : 0;
    const rankB = b.role === AGENCY_STAFF_ROLE.ADMIN ? 1 : 0;
    if (rankA !== rankB) return rankB - rankA;
    const dateA = a.joinedAt ?? a.createdAt;
    const dateB = b.joinedAt ?? b.createdAt;
    if (dateA && dateB) return dateA.getTime() - dateB.getTime();
    return 0;
  });

  return activeStaff[0] ?? null;
}

export async function transferOrDeleteOwnedApplicationsForUser({ userId }: { userId: string }) {
  const db = getDB();

  const ownedApps = await db
    .select({ id: visaApplicationTable.id })
    .from(visaApplicationTable)
    .where(eq(visaApplicationTable.userId, userId));

  if (ownedApps.length === 0) {
    return { appsTransferred: 0, appsDeleted: 0 };
  }

  const replacement = await getReplacementAgencyOwner({ userId });

  if (replacement) {
    await db
      .update(visaApplicationTable)
	      .set({ userId: replacement.userId!, updatedAt: new Date() })
      .where(eq(visaApplicationTable.userId, userId));

    logger.info("Agency case ownership transferred before user deletion", {
      fromUserId: userId,
	      toUserId: replacement.userId,
      applicationCount: ownedApps.length,
    });

    return { appsTransferred: ownedApps.length, appsDeleted: 0 };
  }

  let appsDeleted = 0;
  for (const app of ownedApps) {
    try {
      await deleteApplicationAsAdmin({ applicationId: app.id });
      appsDeleted++;
    } catch (error) {
      logger.warn("Failed to delete application during user deletion", {
        applicationId: app.id,
        userId,
        error,
      });
    }
  }

  return { appsTransferred: 0, appsDeleted };
}

/**
 * Delete a user from the admin panel with proper cascading:
 *  - Agency cases created by the user → transferred to another active staff member when possible
 *  - Agency cases with no remaining staff → deleted with R2/Vectorize cleanup
 *  - Legacy memberships, application invitations, support data, sessions → cleaned up
 */
export async function adminDeleteUser({ userId }: { userId: string }) {
  const db = getDB();

  const { appsTransferred, appsDeleted } = await transferOrDeleteOwnedApplicationsForUser({ userId });

  // 2. Remove memberships in other users' applications
  await db.delete(applicationMembershipTable).where(eq(applicationMembershipTable.userId, userId));

  // 3. Clean up legacy application invitations and agency team access
  await db
    .delete(applicationInvitationTable)
    .where(eq(applicationInvitationTable.invitedBy, userId));
  await db
    .update(applicationInvitationTable)
    .set({ acceptedBy: null })
    .where(eq(applicationInvitationTable.acceptedBy, userId));
  await db.delete(agencyTeamMemberTable).where(eq(agencyTeamMemberTable.userId, userId));

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
