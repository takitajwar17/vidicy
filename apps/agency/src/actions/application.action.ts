"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDB } from "@/db";
import { requireVerifiedEmail } from "@/utils/auth";

import { requireApplicationPermission } from "@/utils/application-auth";
import {
  createVisaApplicationWorkspace,
  getUserApplications,
  getUserApplicationsLite,
  updateApplicationSettings,
  deleteApplication,
} from "@/server/application-server";
import {
  visaApplicationTable,
  applicantTable,
  APPLICATION_PERMISSIONS,
  APPLICANT_RELATIONSHIP,
  APPLICANT_ROLE,
  VISA_OUTCOME,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// createVisaApplicationAction
// ---------------------------------------------------------------------------

const createVisaApplicationSchema = z.object({
  homeCountry: z.string().min(1).max(100),
  currentCountry: z.string().min(1).max(100),
  destinationCountry: z.string().min(1).max(100),
  visaType: z.string().min(1).max(100),
  embassy: z.string().min(1).max(255),
  // Rich history fields (preferred — stored verbatim)
  approvedBefore: z.boolean().optional(),
  approvedVisaType: z.string().max(100).optional(),
  approvedYear: z.string().regex(/^\d{4}$/, "Must be a 4-digit year").optional().or(z.literal("")),
  rejectedBefore: z.boolean().optional(),
  rejectedVisaType: z.string().max(100).optional(),
  rejectedYear: z.string().regex(/^\d{4}$/, "Must be a 4-digit year").optional().or(z.literal("")),
  rejectedReason: z.string().max(500).optional(),
  // Legacy field — kept for backward compatibility
  previousApplicationStatus: z.enum(["first_time", "previously_approved", "previously_rejected"]).optional(),
});

export const createVisaApplicationAction = createServerAction()
  .input(createVisaApplicationSchema)
  .handler(async ({ input }) => {
    const session = await requireVerifiedEmail();

    if (!session) {
      throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");
    }

    const { applicationId, isFreeTrialApp } = await createVisaApplicationWorkspace({
      userId: session.userId,
      homeCountry: input.homeCountry,
      currentCountry: input.currentCountry,
      destinationCountry: input.destinationCountry,
      visaType: input.visaType.charAt(0).toUpperCase() + input.visaType.slice(1),
      embassy: input.embassy,
    });

    const db = getDB();

    const primaryName =
      [session.user.firstName, session.user.lastName].filter(Boolean).join(" ").trim() ||
      (session.user.email ?? "").split("@")[0] ||
      "Primary Applicant";

    const [primaryApplicant] = await db
      .insert(applicantTable)
      .values({
        applicationId,
        name: primaryName,
        relationship: APPLICANT_RELATIONSHIP.PRIMARY,
        role: APPLICANT_ROLE.OWNER,
        email: session.user.email ?? null,
        userId: session.userId,
        nationality: input.homeCountry,
        // Visa history stored per-applicant
        approvedBefore: input.approvedBefore ?? null,
        approvedVisaType: input.approvedVisaType ?? null,
        approvedYear: input.approvedYear ?? null,
        rejectedBefore: input.rejectedBefore ?? null,
        rejectedVisaType: input.rejectedVisaType ?? null,
        rejectedYear: input.rejectedYear ?? null,
        rejectedReason: input.rejectedReason ?? null,
      })
      .returning();

    revalidatePath("/dashboard");
    return { application: { id: applicationId }, primaryApplicant, isFreeTrialApp };
  });

// ---------------------------------------------------------------------------
// getVisaApplicationsAction
// ---------------------------------------------------------------------------

export const getVisaApplicationsAction = createServerAction()
  .handler(async () => {
    return getUserApplications();
  });

// Lightweight list used by nav/app switchers where evaluation payloads are unnecessary.
export const getVisaApplicationsLiteAction = createServerAction()
  .handler(async () => {
    return getUserApplicationsLite();
  });

// ---------------------------------------------------------------------------
// trashApplicationAction
// ---------------------------------------------------------------------------

export const trashApplicationAction = createServerAction()
  .input(z.object({ applicationId: z.string().min(1) }))
  .handler(async ({ input }) => {
    await requireApplicationPermission(input.applicationId, APPLICATION_PERMISSIONS.DELETE_APPLICATION);

    const db = getDB();

    await db
      .update(visaApplicationTable)
      .set({ trashedAt: new Date() })
      .where(eq(visaApplicationTable.id, input.applicationId));

    revalidatePath("/dashboard");
    return { success: true };
  });

// ---------------------------------------------------------------------------
// updateApplicationSettingsAction
// ---------------------------------------------------------------------------

export const updateApplicationSettingsAction = createServerAction()
  .input(z.object({
    applicationId: z.string().min(1),
    name: z.string().min(1, "Name is required").max(255),
  }))
  .handler(async ({ input }) => {
    const result = await updateApplicationSettings({
      applicationId: input.applicationId,
      name: input.name,
    });
    revalidatePath(`/dashboard/${input.applicationId}`);
    return result;
  });

// ---------------------------------------------------------------------------
// deleteApplicationAction
// ---------------------------------------------------------------------------

export const deleteApplicationAction = createServerAction()
  .input(z.object({
    applicationId: z.string().min(1),
  }))
  .handler(async ({ input }) => {
    const result = await deleteApplication({ applicationId: input.applicationId });
    revalidatePath("/dashboard");
    return result;
  });

// ---------------------------------------------------------------------------
// recordOutcomeAction
// ---------------------------------------------------------------------------

export const recordOutcomeAction = createServerAction()
  .input(z.object({
    applicationId: z.string().min(1),
    actualOutcome: z.enum([VISA_OUTCOME.APPROVED, VISA_OUTCOME.REJECTED]).nullable(),
    outcomeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    outcomeNotes: z.string().max(1000).nullable().optional(),
  }))
  .handler(async ({ input }) => {
    await requireApplicationPermission(input.applicationId, APPLICATION_PERMISSIONS.EDIT_APPLICATION_SETTINGS);

    const db = getDB();

    const [updated] = await db
      .update(visaApplicationTable)
      .set({
        actualOutcome: input.actualOutcome ?? null,
        outcomeDate: input.outcomeDate ? new Date(input.outcomeDate) : null,
        outcomeNotes: input.outcomeNotes ?? null,
      })
      .where(eq(visaApplicationTable.id, input.applicationId))
      .returning();

    if (!updated) {
      throw new ZSAError("NOT_FOUND", "Application not found");
    }

    revalidatePath(`/dashboard/${input.applicationId}`);
    return { success: true };
  });
