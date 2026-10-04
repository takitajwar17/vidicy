"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { requireAgencyAdmin, requireAgencyStaff } from "@/server/agency-team";
import {
  AGENCY_CASE_PRIORITY,
  AGENCY_CASE_STATUS,
  AGENCY_STAFF_ROLE,
  AGENCY_STAFF_STATUS,
  CLIENT_REPORT_DELIVERY_STATUS,
  CLIENT_REPORT_STATUS,
  REVIEW_ISSUE_SEVERITY,
  REVIEW_ISSUE_SOURCE,
  REVIEW_ISSUE_STATUS,
  agencyClientTable,
  agencyTeamMemberTable,
  applicantTable,
  checklistItemTable,
  clientReportTable,
  documentEvaluationTable,
  reviewIssueTable,
  userTable,
  visaApplicationTable,
  APPLICANT_RELATIONSHIP,
  APPLICANT_ROLE,
  VISA_APPLICATION_STATUS,
  reviewIssueStatusTuple,
} from "@/db/schema";
import { sendEmailBestEffort } from "@/lib/best-effort-email";
import { isOpenReviewIssueStatus, normalizeReviewIssueStatus } from "@/lib/agency-workflow";
import { logger } from "@/infra/logger";
import { sendAgencyTeamAccessEmail } from "@/utils/email";

const nullableDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal(""));

function parseDateInput(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeOptionalText(value?: string | null) {
  return value?.trim() || null;
}

function getCaseNumber() {
  return `VA-${new Date().getFullYear()}-${createId().slice(0, 6).toUpperCase()}`;
}

function getStaffDisplayName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "An agency admin";
}

async function requireAgencyCase({
  db,
  applicationId,
}: {
  db: ReturnType<typeof getDB>;
  applicationId: string;
}) {
  const application = await db.query.visaApplicationTable.findFirst({
    where: and(
      eq(visaApplicationTable.id, applicationId),
      isNull(visaApplicationTable.trashedAt),
      isNotNull(visaApplicationTable.clientId),
    ),
    columns: { id: true },
  });

  if (!application) {
    throw new ZSAError("NOT_FOUND", "Application not found");
  }

  return application;
}

async function resolveOrCreateClient({
  name,
  email,
  phone,
  country,
}: {
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
}) {
  const db = getDB();
  const normalizedEmail = email?.trim().toLowerCase() || null;

  if (normalizedEmail) {
    const existing = await db.query.agencyClientTable.findFirst({
      where: eq(agencyClientTable.email, normalizedEmail),
    });

    if (existing) {
      await db
        .update(agencyClientTable)
        .set({
          name,
          phone: phone || existing.phone,
          country: country || existing.country,
          updatedAt: new Date(),
        })
        .where(eq(agencyClientTable.id, existing.id));
      return existing.id;
    }
  }

  const [client] = await db
    .insert(agencyClientTable)
    .values({
      name,
      email: normalizedEmail,
      phone: phone || null,
      country: country || null,
    })
    .returning();

  return client.id;
}

const createAgencyCaseSchema = z.object({
  clientName: z.string().trim().min(1).max(255),
  clientEmail: z.string().trim().email().optional().or(z.literal("")),
  clientPhone: z.string().trim().max(100).optional().or(z.literal("")),
  applicantName: z.string().trim().min(1).max(255),
  applicantEmail: z.string().trim().email().optional().or(z.literal("")),
  homeCountry: z.string().trim().min(1).max(100),
  currentCountry: z.string().trim().min(1).max(100),
  destinationCountry: z.string().trim().min(1).max(100),
  visaType: z.string().trim().min(1).max(100),
  embassy: z.string().trim().min(1).max(255),
  priority: z.enum([
    AGENCY_CASE_PRIORITY.LOW,
    AGENCY_CASE_PRIORITY.NORMAL,
    AGENCY_CASE_PRIORITY.HIGH,
    AGENCY_CASE_PRIORITY.URGENT,
  ]),
  assignedReviewerId: z.string().trim().optional().or(z.literal("")),
  submittedAt: nullableDateSchema,
  dueAt: nullableDateSchema,
  approvedBefore: z.boolean().optional(),
  approvedVisaType: z.string().trim().max(100).optional().or(z.literal("")),
  approvedYear: z.string().trim().max(10).optional().or(z.literal("")),
  rejectedBefore: z.boolean().optional(),
  rejectedVisaType: z.string().trim().max(100).optional().or(z.literal("")),
  rejectedYear: z.string().trim().max(10).optional().or(z.literal("")),
  rejectedReason: z.string().trim().max(500).optional().or(z.literal("")),
});

export const createAgencyCaseAction = createServerAction()
  .input(createAgencyCaseSchema)
  .handler(async ({ input }) => {
    const { session } = await requireAgencyStaff();
    const db = getDB();

    const assignedReviewerId = input.assignedReviewerId?.trim() || null;
    const approvedBefore = input.approvedBefore === true;
    const rejectedBefore = input.rejectedBefore === true;

    if (assignedReviewerId) {
      const reviewer = await db.query.agencyTeamMemberTable.findFirst({
        where: and(
          eq(agencyTeamMemberTable.userId, assignedReviewerId),
          eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
        ),
      });

      if (!reviewer) {
        throw new ZSAError("INPUT_PARSE_ERROR", "Selected reviewer is not active.");
      }
    }

    const clientId = await resolveOrCreateClient({
      name: input.clientName,
      email: input.clientEmail || null,
      phone: input.clientPhone || null,
      country: input.homeCountry,
    });

    const [application] = await db
      .insert(visaApplicationTable)
      .values({
        userId: session.userId,
        homeCountry: input.homeCountry,
        currentCountry: input.currentCountry,
        destinationCountry: input.destinationCountry,
        visaType: input.visaType,
        embassy: input.embassy,
        name: `${input.applicantName} — ${input.destinationCountry} ${input.visaType}`,
        status: VISA_APPLICATION_STATUS.IN_PROGRESS,
        caseNumber: getCaseNumber(),
        clientId,
        clientName: input.clientName,
        clientEmail: input.clientEmail?.toLowerCase() || null,
        clientPhone: input.clientPhone || null,
        agencyStatus: AGENCY_CASE_STATUS.INTAKE,
        priority: input.priority,
        assignedReviewerId,
        submittedAt: parseDateInput(input.submittedAt),
        dueAt: parseDateInput(input.dueAt),
        clientReportStatus: CLIENT_REPORT_STATUS.NOT_STARTED,
      })
      .returning();

    const [applicant] = await db
      .insert(applicantTable)
      .values({
        applicationId: application.id,
        name: input.applicantName,
        relationship: APPLICANT_RELATIONSHIP.PRIMARY,
        role: APPLICANT_ROLE.OWNER,
        email: input.applicantEmail?.toLowerCase() || input.clientEmail?.toLowerCase() || null,
        nationality: input.homeCountry,
        approvedBefore,
        approvedVisaType: approvedBefore ? normalizeOptionalText(input.approvedVisaType) : null,
        approvedYear: approvedBefore ? normalizeOptionalText(input.approvedYear) : null,
        rejectedBefore,
        rejectedVisaType: rejectedBefore ? normalizeOptionalText(input.rejectedVisaType) : null,
        rejectedYear: rejectedBefore ? normalizeOptionalText(input.rejectedYear) : null,
        rejectedReason: rejectedBefore ? normalizeOptionalText(input.rejectedReason) : null,
      })
      .returning();

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/applications");

    return { application, applicant };
  });

export const updateAgencyCaseStatusAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
      status: z.enum([
        AGENCY_CASE_STATUS.INTAKE,
        AGENCY_CASE_STATUS.IN_REVIEW,
        AGENCY_CASE_STATUS.NEEDS_CLIENT,
        AGENCY_CASE_STATUS.READY_TO_SUBMIT,
      ]),
    }),
  )
  .handler(async ({ input }) => {
    await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId });

    const nextValues: Partial<typeof visaApplicationTable.$inferInsert> = {
      agencyStatus: input.status,
    };

    if (input.status === AGENCY_CASE_STATUS.READY_TO_SUBMIT) {
      nextValues.reviewCompletedAt = new Date();
      nextValues.status = VISA_APPLICATION_STATUS.READY;
    }

    await db
      .update(visaApplicationTable)
      .set(nextValues)
      .where(eq(visaApplicationTable.id, input.applicationId));

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/applications");
    return { success: true };
  });

export const assignAgencyCaseAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
      reviewerId: z.string().optional().or(z.literal("")),
    }),
  )
  .handler(async ({ input }) => {
    await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId });
    const reviewerId = input.reviewerId?.trim() || null;

    if (reviewerId) {
      const reviewer = await db.query.agencyTeamMemberTable.findFirst({
        where: and(
          eq(agencyTeamMemberTable.userId, reviewerId),
          eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
        ),
      });

      if (!reviewer) {
        throw new ZSAError("NOT_FOUND", "Reviewer not found");
      }
    }

    await db
      .update(visaApplicationTable)
      .set({
        assignedReviewerId: reviewerId,
        ...(reviewerId ? { agencyStatus: AGENCY_CASE_STATUS.IN_REVIEW } : {}),
      })
      .where(eq(visaApplicationTable.id, input.applicationId));

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/applications");
    return { success: true };
  });

function getIssueSeverityFromFeedback(feedback: {
  status?: string;
  score?: number;
  issues?: string[];
  hasDocument?: boolean;
}) {
  if (!feedback.hasDocument || feedback.status === "missing" || (feedback.score ?? 100) < 45) {
    return REVIEW_ISSUE_SEVERITY.HIGH;
  }
  if ((feedback.score ?? 100) < 75 || (feedback.issues?.length ?? 0) > 0) {
    return REVIEW_ISSUE_SEVERITY.MEDIUM;
  }
  return REVIEW_ISSUE_SEVERITY.LOW;
}

export const syncReviewIssuesFromEvaluationAction = createServerAction()
  .input(z.object({ applicationId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const { session } = await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId });

    const [evaluation, checklistItems] = await Promise.all([
      db.query.documentEvaluationTable.findFirst({
        where: eq(documentEvaluationTable.applicationId, input.applicationId),
        orderBy: [desc(documentEvaluationTable.createdAt)],
      }),
      db.query.checklistItemTable.findMany({
        where: eq(checklistItemTable.applicationId, input.applicationId),
      }),
    ]);

    if (!evaluation?.itemFeedback) {
      throw new ZSAError("PRECONDITION_FAILED", "Run document review before syncing issues.");
    }

    let createdCount = 0;
    for (const item of checklistItems) {
      const feedback = evaluation.itemFeedback[item.id];
      if (!feedback) continue;

      const issues = feedback.issues ?? [];
      const shouldCreate =
        feedback.status === "missing" ||
        feedback.status === "needs_review" ||
        issues.length > 0 ||
        (feedback.score ?? 100) < 80;

      if (!shouldCreate) continue;

      const existing = await db.query.reviewIssueTable.findFirst({
        where: and(
          eq(reviewIssueTable.applicationId, input.applicationId),
          eq(reviewIssueTable.checklistItemId, item.id),
          eq(reviewIssueTable.source, REVIEW_ISSUE_SOURCE.AI),
          ne(reviewIssueTable.status, REVIEW_ISSUE_STATUS.DISMISSED),
        ),
      });

      if (existing) continue;

      await db.insert(reviewIssueTable).values({
        applicationId: input.applicationId,
        applicantId: item.applicantId,
        checklistItemId: item.id,
        title:
          feedback.status === "missing"
            ? `Missing ${item.documentName}`
            : `${item.documentName} needs review`,
        description: issues[0] || feedback.feedback || item.description,
        recommendation:
          feedback.feedback ||
          `Ask the client to provide a clearer or corrected ${item.documentName}.`,
        category: feedback.status === "missing" ? "missing_document" : "document_quality",
        severity: getIssueSeverityFromFeedback(feedback),
        status: REVIEW_ISSUE_STATUS.OPEN,
        source: REVIEW_ISSUE_SOURCE.AI,
        confidence: feedback.confidence ?? null,
        clientVisible: true,
        assignedToId: session.userId,
        createdById: session.userId,
      });
      createdCount += 1;
    }

    await db
      .update(visaApplicationTable)
      .set({
        agencyStatus: AGENCY_CASE_STATUS.IN_REVIEW,
        clientReportStatus: CLIENT_REPORT_STATUS.DRAFT,
      })
      .where(eq(visaApplicationTable.id, input.applicationId));

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/issues");
    return { createdCount };
  });

export const addReviewIssueAction = createServerAction()
  .input(
    z.object({
      applicationId: z.string().min(1),
      title: z.string().trim().min(2).max(255),
      description: z.string().trim().min(2).max(2000),
      recommendation: z.string().trim().max(2000).optional().or(z.literal("")),
      severity: z.enum([
        REVIEW_ISSUE_SEVERITY.HIGH,
        REVIEW_ISSUE_SEVERITY.MEDIUM,
        REVIEW_ISSUE_SEVERITY.LOW,
      ]),
      clientVisible: z.boolean().default(true),
    }),
  )
  .handler(async ({ input }) => {
    const { session } = await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId });

    const [issue] = await db
      .insert(reviewIssueTable)
      .values({
        applicationId: input.applicationId,
        title: input.title,
        description: input.description,
        recommendation: input.recommendation || null,
        severity: input.severity,
        source: REVIEW_ISSUE_SOURCE.REVIEWER,
        status: REVIEW_ISSUE_STATUS.OPEN,
        category: "reviewer_note",
        clientVisible: input.clientVisible,
        assignedToId: session.userId,
        createdById: session.userId,
      })
      .returning();

    await db
      .update(visaApplicationTable)
      .set({ agencyStatus: AGENCY_CASE_STATUS.IN_REVIEW })
      .where(eq(visaApplicationTable.id, input.applicationId));

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/issues");
    return issue;
  });

export const updateReviewIssueStatusAction = createServerAction()
  .input(
    z.object({
      issueId: z.string().min(1),
      status: z.union([z.enum(reviewIssueStatusTuple), z.literal("accepted")]).transform(normalizeReviewIssueStatus),
    }),
  )
  .handler(async ({ input }) => {
    await requireAgencyStaff();
    const db = getDB();

    const issue = await db.query.reviewIssueTable.findFirst({
      where: eq(reviewIssueTable.id, input.issueId),
      columns: { applicationId: true },
    });

    if (!issue) {
      throw new ZSAError("NOT_FOUND", "Issue not found");
    }
    await requireAgencyCase({ db, applicationId: issue.applicationId });

    await db
      .update(reviewIssueTable)
      .set({
        status: input.status,
        resolvedAt:
          input.status === REVIEW_ISSUE_STATUS.RESOLVED ||
          input.status === REVIEW_ISSUE_STATUS.DISMISSED
            ? new Date()
            : null,
      })
      .where(eq(reviewIssueTable.id, input.issueId));

    revalidatePath(`/dashboard/${issue.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/issues");
    return { success: true };
  });

export const generateClientReportAction = createServerAction()
  .input(z.object({ applicationId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const { session } = await requireAgencyStaff();
    const db = getDB();

    const [application, issues] = await Promise.all([
      db.query.visaApplicationTable.findFirst({
        where: and(
          eq(visaApplicationTable.id, input.applicationId),
          isNull(visaApplicationTable.trashedAt),
          isNotNull(visaApplicationTable.clientId),
        ),
      }),
      db.query.reviewIssueTable.findMany({
        where: and(
          eq(reviewIssueTable.applicationId, input.applicationId),
          eq(reviewIssueTable.clientVisible, true),
          ne(reviewIssueTable.status, REVIEW_ISSUE_STATUS.DISMISSED),
        ),
        orderBy: [desc(reviewIssueTable.createdAt)],
      }),
    ]);

    if (!application) {
      throw new ZSAError("NOT_FOUND", "Application not found");
    }

    const actionItems = issues
      .filter((issue) => isOpenReviewIssueStatus(issue.status))
      .map((issue) => ({
        title: issue.title,
        detail: issue.recommendation || issue.description,
        severity: issue.severity as "high" | "medium" | "low",
      }));

    const summary =
      actionItems.length > 0
        ? `${application.clientName ?? "Client"} has ${actionItems.length} item${actionItems.length === 1 ? "" : "s"} to fix before the review desk can mark the case ready.`
        : "No client-ready issues remain. The case can move to the ready queue.";

    const [report] = await db
      .insert(clientReportTable)
      .values({
        applicationId: input.applicationId,
        status: CLIENT_REPORT_DELIVERY_STATUS.READY,
        summary,
        actionItems,
        createdById: session.userId,
      })
      .returning();

    await db
      .update(visaApplicationTable)
      .set({
        clientReportStatus: CLIENT_REPORT_STATUS.READY,
        agencyStatus:
          actionItems.length > 0 ? AGENCY_CASE_STATUS.NEEDS_CLIENT : AGENCY_CASE_STATUS.READY_TO_SUBMIT,
      })
      .where(eq(visaApplicationTable.id, input.applicationId));

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/reports");
    return report;
  });

export const finalizeReviewAction = createServerAction()
  .input(z.object({ applicationId: z.string().min(1) }))
  .handler(async ({ input }) => {
    await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId });

    await db
      .update(visaApplicationTable)
      .set({
        agencyStatus: AGENCY_CASE_STATUS.READY_TO_SUBMIT,
        status: VISA_APPLICATION_STATUS.READY,
        reviewCompletedAt: new Date(),
      })
      .where(eq(visaApplicationTable.id, input.applicationId));

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/applications");
    return { success: true };
  });

export const addAgencyStaffAction = createServerAction()
  .input(
    z.object({
      email: z.string().trim().email(),
      role: z.enum([AGENCY_STAFF_ROLE.ADMIN, AGENCY_STAFF_ROLE.MEMBER]),
    }),
  )
	  .handler(async ({ input }) => {
	    const { session } = await requireAgencyAdmin();
	    const db = getDB();
	    const email = input.email.trim().toLowerCase();
	    const addedByName = getStaffDisplayName(session.user);

	    const existingUser = await db.query.userTable.findFirst({
	      where: eq(userTable.email, email),
	      columns: { id: true, firstName: true, lastName: true, email: true },
	    });

	    const [existingByEmail, existingByUser] = await Promise.all([
	      db.query.agencyTeamMemberTable.findFirst({
	        where: eq(agencyTeamMemberTable.email, email),
	      }),
	      existingUser
	        ? db.query.agencyTeamMemberTable.findFirst({
	            where: eq(agencyTeamMemberTable.userId, existingUser.id),
	          })
	        : Promise.resolve(null),
	    ]);

	    if (existingByEmail && existingByUser && existingByEmail.id !== existingByUser.id) {
	      throw new ZSAError(
	        "CONFLICT",
	        "This email and account are already linked to different staff records.",
	      );
	    }

	    const existingMember = existingByEmail ?? existingByUser;
	    const now = new Date();
	    const nextValues = {
	      email,
	      userId: existingUser?.id ?? existingMember?.userId ?? null,
	      role: input.role,
	      status: AGENCY_STAFF_STATUS.ACTIVE,
	      invitedBy: session.userId,
	      invitedAt: existingMember?.invitedAt ?? now,
      joinedAt: existingUser ? (existingMember?.joinedAt ?? now) : (existingMember?.joinedAt ?? null),
	      updatedAt: now,
	    };

	    if (existingMember) {
	      await db
	        .update(agencyTeamMemberTable)
	        .set(nextValues)
	        .where(eq(agencyTeamMemberTable.id, existingMember.id));
	    } else {
	      await db.insert(agencyTeamMemberTable).values(nextValues);
	    }

	    const emailSent = await sendEmailBestEffort({
	      send: () =>
	        sendAgencyTeamAccessEmail({
	          email,
	          addedByName,
	          role: input.role,
	        }),
	      logger,
	      message: "Failed to send agency staff access email",
	      context: { email, role: input.role },
	    });

	    revalidatePath("/dashboard/team");
	    return { status: "added" as const, emailSent };
	  });

export const updateAgencyStaffRoleAction = createServerAction()
  .input(
    z.object({
	      staffMemberId: z.string().min(1),
	      role: z.enum([AGENCY_STAFF_ROLE.ADMIN, AGENCY_STAFF_ROLE.MEMBER]),
	    }),
  )
  .handler(async ({ input }) => {
	    const { session } = await requireAgencyAdmin();
	    const db = getDB();

	    const member = await db.query.agencyTeamMemberTable.findFirst({
	      where: eq(agencyTeamMemberTable.id, input.staffMemberId),
	      columns: { id: true, userId: true },
	    });

	    if (!member) {
	      throw new ZSAError("NOT_FOUND", "Staff member not found.");
	    }

	    if (member.userId === session.userId && input.role !== AGENCY_STAFF_ROLE.ADMIN) {
	      throw new ZSAError("FORBIDDEN", "You cannot remove your own admin access.");
	    }

	    await db
	      .update(agencyTeamMemberTable)
	      .set({ role: input.role, updatedAt: new Date() })
	      .where(eq(agencyTeamMemberTable.id, input.staffMemberId));

    revalidatePath("/dashboard/team");
    return { success: true };
  });

export const disableAgencyStaffAction = createServerAction()
  .input(z.object({ staffMemberId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const { session } = await requireAgencyAdmin();
    const db = getDB();

    const member = await db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.id, input.staffMemberId),
      columns: { id: true, userId: true },
    });

    if (!member) {
      throw new ZSAError("NOT_FOUND", "Staff member not found.");
    }

    if (member.userId === session.userId) {
      throw new ZSAError("FORBIDDEN", "You cannot disable your own account.");
    }

    await db
      .update(agencyTeamMemberTable)
      .set({ status: AGENCY_STAFF_STATUS.DISABLED, updatedAt: new Date() })
      .where(eq(agencyTeamMemberTable.id, input.staffMemberId));

    revalidatePath("/dashboard/team");
    return { success: true };
  });
