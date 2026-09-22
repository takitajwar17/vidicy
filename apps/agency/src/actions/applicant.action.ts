"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { eq, and, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDB } from "@/db";
import { logger } from "@/infra/logger";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { requireApplicationPermission, isTrialLocked } from "@/utils/application-auth";
import {
  applicantTable,
  checklistItemTable,
  uploadedDocumentTable,
  documentEvaluationTable,
  userTable,
  visaApplicationTable,
  applicationMembershipTable,
  APPLICATION_PERMISSIONS,
  APPLICANT_RELATIONSHIP,
  APPLICANT_ROLE,
  PAYMENT_STATUS,
} from "@/db/schema";
import { ADDITIONAL_APPLICANT_PRICE_CENTS, PLAN_LIMIT_ERROR } from "@/constants";
import { sendApplicantInvitationEmail, sendApplicantAddedNotificationEmail } from "@/utils/email";

function resolveInviterName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}): string {
  const first = user.firstName?.trim();
  if (first) {
    const last = user.lastName?.trim();
    return last ? `${first} ${last}` : first;
  }
  return user.email ?? "Someone";
}

function resolveLinkedApplicantName(
  user:
    | { firstName: string | null; lastName: string | null; email: string | null }
    | null
    | undefined,
  fallbackName: string,
): string {
  const fullName = [user?.firstName?.trim(), user?.lastName?.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  return fallbackName;
}

function resolveApplicationName(
  app:
    | { name: string | null; destinationCountry: string | null; visaType: string | null }
    | undefined,
): string {
  if (!app) return "a visa application";
  return (
    app.name ||
    (app.destinationCountry && app.visaType
      ? `${app.destinationCountry} — ${app.visaType} Visa`
      : "a visa application")
  );
}

// ---------------------------------------------------------------------------
// createApplicantAction
// ---------------------------------------------------------------------------

const createApplicantSchema = z.object({
  applicationId: z.string().min(1),
  name: z.string().min(1).max(255),
  relationship: z.enum(["spouse", "child", "parent", "sibling", "other"]),
  dateOfBirth: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  nationality: z.string().max(100).optional(),
  approvedBefore: z.boolean().optional(),
  approvedVisaType: z.string().max(100).optional(),
  approvedYear: z.string().max(10).optional(),
  rejectedBefore: z.boolean().optional(),
  rejectedVisaType: z.string().max(100).optional(),
  rejectedYear: z.string().max(10).optional(),
  rejectedReason: z.string().max(500).optional(),
});

export const createApplicantAction = createServerAction()
  .input(createApplicantSchema)
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.INVITE_MEMBERS,
    );
    await checkActionRateLimit("createApplicant", session.userId, 20);

    const db = getDB();

    // Enforce paid applicant limit — plan-aware
    const [app] = await db
      .select({
        paidApplicantCount: visaApplicationTable.paidApplicantCount,
        plan: visaApplicationTable.plan,
        isFreeTrialApp: visaApplicationTable.isFreeTrialApp,
        paymentStatus: visaApplicationTable.paymentStatus,
      })
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.id, input.applicationId));

    // Applicants beyond the primary seat require a paid application.
    // This blocks both free-trial and non-trial unpaid workspaces.
    if (app && app.paymentStatus !== PAYMENT_STATUS.PAID) {
      throw new ZSAError("FORBIDDEN", PLAN_LIMIT_ERROR);
    }

    if (app && app.paidApplicantCount > 0) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(applicantTable)
        .where(eq(applicantTable.applicationId, input.applicationId));

      // Primary applicant is already a row in applicantTable, so total includes them
      if (total >= app.paidApplicantCount) {
        throw new ZSAError("FORBIDDEN", PLAN_LIMIT_ERROR);
      }
    }

    const normalizedEmail = input.email?.trim().toLowerCase() || null;

    // Prevent adding two applicants with the same email to one application
    if (normalizedEmail) {
      const duplicate = await db.query.applicantTable.findFirst({
        where: and(
          eq(applicantTable.applicationId, input.applicationId),
          eq(applicantTable.email, normalizedEmail),
        ),
        columns: { id: true },
      });
      if (duplicate) {
        throw new ZSAError(
          "CONFLICT",
          "An applicant with this email already exists in this application",
        );
      }
    }

    let linkedUserId: string | null = null;
    let applicantName = input.name;
    if (normalizedEmail) {
      const existingUser = await db.query.userTable.findFirst({
        where: eq(userTable.email, normalizedEmail),
        columns: { id: true, firstName: true, lastName: true, email: true },
      });
      if (existingUser) {
        linkedUserId = existingUser.id;
        applicantName = resolveLinkedApplicantName(existingUser, input.name);
      }
    }

    const [newApplicant] = await db
      .insert(applicantTable)
      .values({
        applicationId: input.applicationId,
        name: applicantName,
        relationship: input.relationship,
        role: APPLICANT_ROLE.MEMBER,
        dateOfBirth: input.dateOfBirth ?? null,
        email: normalizedEmail,
        userId: linkedUserId,
        nationality: input.nationality ?? null,
        approvedBefore: input.approvedBefore ?? null,
        approvedVisaType: input.approvedVisaType ?? null,
        approvedYear: input.approvedYear ?? null,
        rejectedBefore: input.rejectedBefore ?? null,
        rejectedVisaType: input.rejectedVisaType ?? null,
        rejectedYear: input.rejectedYear ?? null,
        rejectedReason: input.rejectedReason ?? null,
      })
      .returning();

    // Send notification email (non-fatal)
    if (normalizedEmail) {
      try {
        const app = await db.query.visaApplicationTable.findFirst({
          where: eq(visaApplicationTable.id, input.applicationId),
          columns: { name: true, destinationCountry: true, visaType: true },
        });

        const inviterName = resolveInviterName(session.user);
        const applicationName = resolveApplicationName(app);

        if (linkedUserId) {
          // Already has an account — notify them with a link to their dashboard
          await sendApplicantAddedNotificationEmail({
            email: normalizedEmail,
            inviterName,
            applicationName,
            applicationId: input.applicationId,
          });
        } else {
          // No account yet — invite them to sign up
          await sendApplicantInvitationEmail({
            email: normalizedEmail,
            inviterName,
            applicationName,
          });
        }
      } catch (emailError) {
        logger.warn("Failed to send applicant notification email", {
          applicantId: newApplicant.id,
          emailError: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }
    }

    revalidatePath(`/dashboard/${input.applicationId}`);
    return newApplicant;
  });

// ---------------------------------------------------------------------------
// deleteApplicantAction
// ---------------------------------------------------------------------------

export const deleteApplicantAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
      applicantId: z.string().min(1),
    }),
  )
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.REMOVE_MEMBERS,
    );
    await checkActionRateLimit("deleteApplicant", session.userId, 20);

    const db = getDB();

    const applicant = await db.query.applicantTable.findFirst({
      where: and(
        eq(applicantTable.id, input.applicantId),
        eq(applicantTable.applicationId, input.applicationId),
      ),
      columns: { id: true, relationship: true, userId: true },
    });

    if (!applicant) throw new ZSAError("NOT_FOUND", "Applicant not found");

    if (applicant.relationship === APPLICANT_RELATIONSHIP.PRIMARY) {
      throw new ZSAError("FORBIDDEN", "Cannot delete the primary applicant");
    }

    // Collect documents before deleting so we can clean up R2 + Vectorize
    const docsToDelete = await db.query.uploadedDocumentTable.findMany({
      where: and(
        eq(uploadedDocumentTable.applicationId, input.applicationId),
        eq(uploadedDocumentTable.applicantId, input.applicantId),
      ),
      columns: { id: true, fileKey: true, chunkCount: true },
    });

    await Promise.all([
      db
        .delete(checklistItemTable)
        .where(
          and(
            eq(checklistItemTable.applicationId, input.applicationId),
            eq(checklistItemTable.applicantId, input.applicantId),
          ),
        ),
      db
        .delete(uploadedDocumentTable)
        .where(
          and(
            eq(uploadedDocumentTable.applicationId, input.applicationId),
            eq(uploadedDocumentTable.applicantId, input.applicantId),
          ),
        ),
      db
        .delete(documentEvaluationTable)
        .where(
          and(
            eq(documentEvaluationTable.applicationId, input.applicationId),
            eq(documentEvaluationTable.applicantId, input.applicantId),
          ),
        ),
    ]);

    await db.delete(applicantTable).where(eq(applicantTable.id, input.applicantId));

    // Clean up application membership if the applicant had a linked user account
    if (applicant.userId) {
      await db
        .delete(applicationMembershipTable)
        .where(
          and(
            eq(applicationMembershipTable.applicationId, input.applicationId),
            eq(applicationMembershipTable.userId, applicant.userId),
          ),
        );
    }

    // Clean up R2 objects and Vectorize embeddings (non-fatal)
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
        logger.warn("R2/Vectorize cleanup failed during applicant delete", {
          applicantId: input.applicantId,
          cleanupError,
        });
      }
    }

    revalidatePath(`/dashboard/${input.applicationId}`);
    return { success: true };
  });

// ---------------------------------------------------------------------------
// updateApplicantAction
// ---------------------------------------------------------------------------

export const updateApplicantAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
      applicantId: z.string().min(1),
      email: z.string().email().optional().or(z.literal("")),
      nationality: z.string().optional(),
      relationship: z.enum(["primary", "spouse", "child", "parent", "sibling", "other"]).optional(),
      approvedBefore: z.boolean().optional(),
      approvedVisaType: z.string().optional(),
      approvedYear: z.string().optional(),
      rejectedBefore: z.boolean().optional(),
      rejectedVisaType: z.string().optional(),
      rejectedYear: z.string().optional(),
      rejectedReason: z.string().optional(),
    }),
  )
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.INVITE_MEMBERS,
    );

    const db = getDB();

    const applicant = await db.query.applicantTable.findFirst({
      where: and(
        eq(applicantTable.id, input.applicantId),
        eq(applicantTable.applicationId, input.applicationId),
      ),
      columns: { id: true, relationship: true, email: true, userId: true },
    });

    if (!applicant) throw new ZSAError("NOT_FOUND", "Applicant not found");

    const normalizedEmail = input.email?.trim().toLowerCase() || null;

    // Prevent duplicate email within the same application
    const emailChanged = normalizedEmail !== applicant.email;
    if (emailChanged && normalizedEmail) {
      const duplicate = await db.query.applicantTable.findFirst({
        where: and(
          eq(applicantTable.applicationId, input.applicationId),
          eq(applicantTable.email, normalizedEmail),
        ),
        columns: { id: true },
      });
      if (duplicate && duplicate.id !== input.applicantId) {
        throw new ZSAError(
          "CONFLICT",
          "Another applicant with this email already exists in this application",
        );
      }
    }

    // Re-link userId whenever the email changes
    let linkedUserId: string | null | undefined = undefined; // undefined = no change
    if (emailChanged) {
      if (normalizedEmail) {
        const existingUser = await db.query.userTable.findFirst({
          where: eq(userTable.email, normalizedEmail),
          columns: { id: true },
        });
        linkedUserId = existingUser?.id ?? null;
      } else {
        linkedUserId = null;
      }
    }

    const [updated] = await db
      .update(applicantTable)
      .set({
        email: normalizedEmail,
        ...(linkedUserId !== undefined ? { userId: linkedUserId } : {}),
        nationality: input.nationality || null,
        // Don't allow changing relationship of primary applicant
        relationship:
          applicant.relationship === "primary"
            ? "primary"
            : (input.relationship ?? applicant.relationship),
        approvedBefore: input.approvedBefore ?? null,
        approvedVisaType: input.approvedVisaType || null,
        approvedYear: input.approvedYear || null,
        rejectedBefore: input.rejectedBefore ?? null,
        rejectedVisaType: input.rejectedVisaType || null,
        rejectedYear: input.rejectedYear || null,
        rejectedReason: input.rejectedReason || null,
      })
      .where(eq(applicantTable.id, input.applicantId))
      .returning();

    // If a new email was set and the person doesn't have an account, send an invitation (non-fatal)
    if (emailChanged && normalizedEmail && linkedUserId === null) {
      try {
        const app = await db.query.visaApplicationTable.findFirst({
          where: eq(visaApplicationTable.id, input.applicationId),
          columns: { name: true, destinationCountry: true, visaType: true },
        });

        const inviterName = resolveInviterName(session.user);
        const applicationName = resolveApplicationName(app);

        await sendApplicantInvitationEmail({
          email: normalizedEmail,
          inviterName,
          applicationName,
        });
      } catch (emailError) {
        logger.warn("Failed to send invitation email on applicant update", {
          applicantId: input.applicantId,
          emailError: emailError instanceof Error ? emailError.message : String(emailError),
        });
      }
    }

    revalidatePath(`/dashboard/${input.applicationId}`);
    return updated;
  });

// ---------------------------------------------------------------------------
// updateApplicantRoleAction
// ---------------------------------------------------------------------------

export const updateApplicantRoleAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
      applicantId: z.string().min(1),
      role: z.enum(["owner", "admin", "member", "guest"]),
    }),
  )
  .handler(async ({ input }) => {
    await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.CHANGE_MEMBER_ROLES,
    );

    const db = getDB();

    const applicant = await db.query.applicantTable.findFirst({
      where: and(
        eq(applicantTable.id, input.applicantId),
        eq(applicantTable.applicationId, input.applicationId),
      ),
      columns: { id: true, relationship: true },
    });

    if (!applicant) throw new ZSAError("NOT_FOUND", "Applicant not found");

    // Prevent demoting the primary applicant from OWNER — ensures every
    // application always has at least one owner.
    if (applicant.relationship === APPLICANT_RELATIONSHIP.PRIMARY && input.role !== "owner") {
      throw new ZSAError("FORBIDDEN", "Cannot change the primary applicant's role from owner");
    }

    const [updated] = await db
      .update(applicantTable)
      .set({ role: input.role })
      .where(eq(applicantTable.id, input.applicantId))
      .returning();

    revalidatePath(`/dashboard/${input.applicationId}`);
    return updated;
  });

// ---------------------------------------------------------------------------
// resendApplicantInviteAction
// ---------------------------------------------------------------------------

export const resendApplicantInviteAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
      applicantId: z.string().min(1),
    }),
  )
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.INVITE_MEMBERS,
    );
    await checkActionRateLimit("resendApplicantInvite", session.userId, 10);

    const db = getDB();

    const [applicant, app] = await Promise.all([
      db.query.applicantTable.findFirst({
        where: and(
          eq(applicantTable.id, input.applicantId),
          eq(applicantTable.applicationId, input.applicationId),
        ),
        columns: { id: true, email: true, userId: true, name: true },
      }),
      db.query.visaApplicationTable.findFirst({
        where: eq(visaApplicationTable.id, input.applicationId),
        columns: { name: true, destinationCountry: true, visaType: true },
      }),
    ]);

    if (!applicant) throw new ZSAError("NOT_FOUND", "Applicant not found");
    if (!applicant.email)
      throw new ZSAError("PRECONDITION_FAILED", "Applicant has no email address");
    if (applicant.userId)
      throw new ZSAError("PRECONDITION_FAILED", "Applicant already has portal access");

    const inviterName = resolveInviterName(session.user);
    const applicationName = resolveApplicationName(app);

    await sendApplicantInvitationEmail({
      email: applicant.email,
      inviterName,
      applicationName,
    });

    return { success: true };
  });

// ---------------------------------------------------------------------------
// checkApplicantQuotaAction
// Returns the quota state so the UI can show payment prompts or free slots.
// ---------------------------------------------------------------------------

export const checkApplicantQuotaAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
    }),
  )
  .handler(async ({ input }) => {
    await requireApplicationPermission(input.applicationId);

    const db = getDB();

    const [app] = await db
      .select({
        paidApplicantCount: visaApplicationTable.paidApplicantCount,
        plan: visaApplicationTable.plan,
        paymentStatus: visaApplicationTable.paymentStatus,
        isFreeTrialApp: visaApplicationTable.isFreeTrialApp,
      })
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.id, input.applicationId));

    if (!app) throw new ZSAError("NOT_FOUND", "Application not found");

    const [{ total }] = await db
      .select({ total: count() })
      .from(applicantTable)
      .where(eq(applicantTable.applicationId, input.applicationId));

    // Primary applicant is already a row in applicantTable, so total includes them
    const currentCount = total;

    // Unpaid applications must go through checkout before adding applicants.
    // Free-trial apps are surfaced with dedicated copy below.
    if (app.paymentStatus !== PAYMENT_STATUS.PAID) {
      if (isTrialLocked(app)) {
        return {
          plan: "solo",
          paidApplicantCount: 1,
          currentCount,
          remaining: 0,
          requiresPayment: true,
          isFreeTrial: true,
          pricePerAdditional: ADDITIONAL_APPLICANT_PRICE_CENTS,
        };
      }

      return {
        plan: app.plan ?? "solo",
        paidApplicantCount: 0,
        currentCount,
        remaining: 0,
        requiresPayment: true,
        isFreeTrial: false,
        pricePerAdditional: ADDITIONAL_APPLICANT_PRICE_CENTS,
      };
    }

    const remaining = Math.max(0, app.paidApplicantCount - currentCount);
    const requiresPayment = app.paidApplicantCount > 0 && remaining <= 0;

    return {
      plan: app.plan ?? "solo",
      paidApplicantCount: app.paidApplicantCount,
      currentCount,
      remaining,
      requiresPayment,
      isFreeTrial: false,
      pricePerAdditional: ADDITIONAL_APPLICANT_PRICE_CENTS,
    };
  });
