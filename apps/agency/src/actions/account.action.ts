"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { getDB } from "@/db";
import { requireVerifiedEmail } from "@/utils/auth";
import { deleteApplication } from "@/server/application-server";
import {
  userTable,
  visaApplicationTable,
  supportTicketTable,
  supportMessageTable,
  applicationMembershipTable,
  applicationInvitationTable,
} from "@/db/schema";
import { deleteAllSessionsOfUser } from "@/infra/kv-session";
import { validateCsrfToken } from "@/infra/csrf";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { logger } from "@/infra/logger";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/constants";

// ---------------------------------------------------------------------------
// deleteAccountAction — GDPR Right to Erasure
// ---------------------------------------------------------------------------

const deleteAccountSchema = z.object({
  confirmationText: z.literal("DELETE MY ACCOUNT"),
  csrfToken: z.string().optional(),
});

export const deleteAccountAction = createServerAction()
  .input(deleteAccountSchema)
  .handler(async ({ input }) => {
    if (!(await validateCsrfToken(input.csrfToken))) {
      throw new ZSAError("FORBIDDEN", "Invalid request");
    }

    const session = await requireVerifiedEmail();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");
    await checkActionRateLimit("deleteAccount", session.userId, 3);
    const userId = session.userId;
    const db = getDB();

    // 1. Delete all visa applications owned by this user (cascades to
    //    applicants, checklist items, documents, evaluations, chat messages,
    //    memberships, roles, invitations) and cleans up R2 + Vectorize
    const applications = await db
      .select({ id: visaApplicationTable.id })
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.userId, userId));

    for (const app of applications) {
      try {
        await deleteApplication({ applicationId: app.id });
      } catch (error) {
        logger.warn("Failed to delete application during account deletion", {
          applicationId: app.id,
          userId,
          error,
        });
      }
    }

    // 2. Remove memberships in other users' applications (FK has no cascade on userId)
    await db.delete(applicationMembershipTable).where(eq(applicationMembershipTable.userId, userId));

    // 3. Nullify invitation references where this user invited or accepted
    //    invitedBy is NOT NULL so we must delete those rows; acceptedBy is nullable so we nullify
    await db.delete(applicationInvitationTable).where(eq(applicationInvitationTable.invitedBy, userId));
    await db
      .update(applicationInvitationTable)
      .set({ acceptedBy: null })
      .where(eq(applicationInvitationTable.acceptedBy, userId));

    // 4. Delete support message screenshots from R2, then messages and tickets
    const tickets = await db
      .select({
        id: supportTicketTable.id,
        screenshotUrls: supportTicketTable.screenshotUrls,
      })
      .from(supportTicketTable)
      .where(eq(supportTicketTable.userId, userId));

    const ticketIds = tickets.map((t) => t.id);
    let allScreenshotKeys = tickets.flatMap((t) => t.screenshotUrls ?? []);

    // Also collect screenshots from support messages
    if (ticketIds.length > 0) {
      const messages = await db
        .select({ screenshotUrls: supportMessageTable.screenshotUrls })
        .from(supportMessageTable)
        .where(inArray(supportMessageTable.ticketId, ticketIds));
      allScreenshotKeys = allScreenshotKeys.concat(
        messages.flatMap((m) => m.screenshotUrls ?? [])
      );
    }

    // Best-effort R2 cleanup for all support screenshots
    if (allScreenshotKeys.length > 0) {
      try {
        const { getCloudflareContext } = await import("@opennextjs/cloudflare");
        const { env } = await getCloudflareContext({ async: true });
        if (env.R2) {
          await Promise.all(allScreenshotKeys.map((key) => env.R2!.delete(key)));
        }
      } catch (error) {
        logger.warn("R2 cleanup for support screenshots failed", { userId, error });
      }
    }

    // Delete messages first (FK to ticket), then tickets (FK to user without cascade)
    if (ticketIds.length > 0) {
      for (const ticketId of ticketIds) {
        await db.delete(supportMessageTable).where(eq(supportMessageTable.ticketId, ticketId));
      }
    }
    await db.delete(supportTicketTable).where(eq(supportTicketTable.userId, userId));

    // 5. Delete all KV sessions
    await deleteAllSessionsOfUser(userId);

    // 6. Delete the user record (all FK references should now be cleared)
    await db.delete(userTable).where(eq(userTable.id, userId));

    // 7. Clear the session cookie
    try {
      const cookieStore = await cookies();
      cookieStore.delete(SESSION_COOKIE_NAME);
      cookieStore.delete("lastActiveApp");
    } catch {
      // Cookie operations only available inside request context
    }

    logger.info("User account deleted (GDPR erasure)", { userId });

    return { success: true };
  });

// ---------------------------------------------------------------------------
// exportUserDataAction — GDPR Right to Data Portability
// ---------------------------------------------------------------------------

import {
  applicantTable,
  checklistItemTable,
  uploadedDocumentTable,
  documentEvaluationTable,
  chatMessageTable,
} from "@/db/schema";

const exportUserDataSchema = z.object({
  csrfToken: z.string().optional(),
});

export const exportUserDataAction = createServerAction()
  .input(exportUserDataSchema)
  .handler(async ({ input }) => {
    if (!(await validateCsrfToken(input.csrfToken))) {
      throw new ZSAError("FORBIDDEN", "Invalid request");
    }

    const session = await requireVerifiedEmail();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");
    await checkActionRateLimit("exportUserData", session.userId, 5);
    const userId = session.userId;
    const db = getDB();

    // Fetch user profile (exclude passwordHash)
    const user = await db.query.userTable.findFirst({
      where: eq(userTable.id, userId),
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        emailVerified: true,
        avatar: true,
        signUpIpAddress: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new ZSAError("NOT_FOUND", "User not found");

    // Fetch all applications
    const applications = await db
      .select()
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.userId, userId));

    const appIds = applications.map((a) => a.id);

    // Fetch related data for all applications
    let applicants: { applicationId: string }[] = [];
    let checklistItems: { applicationId: string }[] = [];
    let documents: { applicationId: string }[] = [];
    let evaluations: { applicationId: string }[] = [];
    let chatMessages: { applicationId: string }[] = [];
    let memberships: { applicationId: string }[] = [];
    let invitations: { applicationId: string }[] = [];

    if (appIds.length > 0) {
      [applicants, checklistItems, documents, evaluations, chatMessages, memberships, invitations] =
        await Promise.all([
          db.select().from(applicantTable).where(inArray(applicantTable.applicationId, appIds)),
          db.select().from(checklistItemTable).where(inArray(checklistItemTable.applicationId, appIds)),
          db
            .select({
              id: uploadedDocumentTable.id,
              applicationId: uploadedDocumentTable.applicationId,
              applicantId: uploadedDocumentTable.applicantId,
              fileName: uploadedDocumentTable.fileName,
              fileSize: uploadedDocumentTable.fileSize,
              mimeType: uploadedDocumentTable.mimeType,
              uploadedAt: uploadedDocumentTable.uploadedAt,
              extractionStatus: uploadedDocumentTable.extractionStatus,
              indexingStatus: uploadedDocumentTable.indexingStatus,
              extractionMethod: uploadedDocumentTable.extractionMethod,
              extractedAt: uploadedDocumentTable.extractedAt,
              indexingAttemptedAt: uploadedDocumentTable.indexingAttemptedAt,
              pageCount: uploadedDocumentTable.pageCount,
              imageDescription: uploadedDocumentTable.imageDescription,
              extractionPayload: uploadedDocumentTable.extractionPayload,
              chunkCount: uploadedDocumentTable.chunkCount,
            })
            .from(uploadedDocumentTable)
            .where(inArray(uploadedDocumentTable.applicationId, appIds)),
          db.select().from(documentEvaluationTable).where(inArray(documentEvaluationTable.applicationId, appIds)),
          db.select().from(chatMessageTable).where(inArray(chatMessageTable.applicationId, appIds)),
          db.select().from(applicationMembershipTable).where(inArray(applicationMembershipTable.applicationId, appIds)),
          db.select().from(applicationInvitationTable).where(inArray(applicationInvitationTable.applicationId, appIds)),
        ]);
    }

    // Fetch support tickets and messages
    const supportTickets = await db
      .select({
        id: supportTicketTable.id,
        subject: supportTicketTable.subject,
        description: supportTicketTable.description,
        category: supportTicketTable.category,
        status: supportTicketTable.status,
        priority: supportTicketTable.priority,
        createdAt: supportTicketTable.createdAt,
      })
      .from(supportTicketTable)
      .where(eq(supportTicketTable.userId, userId));

    const exportData = {
      exportedAt: new Date().toISOString(),
      dataSubject: user,
      applications: applications.map((app) => ({
        ...app,
        applicants: applicants.filter(
          (a) => a.applicationId === app.id
        ),
        checklistItems: checklistItems.filter(
          (c) => c.applicationId === app.id
        ),
        documents: documents.filter(
          (d) => d.applicationId === app.id
        ),
        evaluations: evaluations.filter(
          (e) => e.applicationId === app.id
        ),
        chatMessages: chatMessages.filter(
          (m) => m.applicationId === app.id
        ),
        memberships: memberships.filter(
          (m) => m.applicationId === app.id
        ),
        invitations: invitations.filter(
          (i) => i.applicationId === app.id
        ),
      })),
      supportTickets,
      _notice:
        "This export contains all personal data held by Vidicy. " +
        "Uploaded document files (PDFs) are not included in this JSON export due to size constraints. " +
        "To request document file copies, contact support.",
    };

    logger.info("User data exported (GDPR portability)", { userId });

    return exportData;
  });
