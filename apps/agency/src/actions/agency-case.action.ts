"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
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
  agencyTable,
  agencyTeamMemberTable,
  applicantTable,
  clientReportTable,
  documentEvaluationTable,
  reviewIssueTable,
  visaApplicationTable,
  APPLICANT_RELATIONSHIP,
  APPLICANT_ROLE,
  VISA_APPLICATION_STATUS,
  reviewIssueStatusTuple,
} from "@/db/schema";
import { isOpenReviewIssueStatus, normalizeReviewIssueStatus } from "@/lib/agency-workflow";
import { deliverClientReport, updateClientReportRecipient } from "@/server/client-reports";
import { validateCsrfToken } from "@/infra/csrf";
import {
  invalidateAgencyReports,
  getAgencyReportInvalidationQueries,
  newestEvaluationOrder,
  requireCurrentAgencyReview,
  markAgencyCaseReady,
  syncAgencyReviewIssues,
} from "@/server/agency-review";

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

async function requireAgencyCase({
  db,
  applicationId,
  agencyId,
}: {
  db: ReturnType<typeof getDB>;
  applicationId: string;
  agencyId: string;
}) {
  const application = await db.query.visaApplicationTable.findFirst({
    where: and(
      eq(visaApplicationTable.id, applicationId),
      eq(visaApplicationTable.agencyId, agencyId),
      isNull(visaApplicationTable.trashedAt),
      isNotNull(visaApplicationTable.clientId),
    ),
    columns: { id: true, updateCounter: true },
  });

  if (!application) {
    throw new ZSAError("NOT_FOUND", "Application not found");
  }

  return application;
}

async function resolveOrCreateClient({
  agencyId,
  name,
  email,
  phone,
  country,
}: {
  agencyId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
}) {
  const db = getDB();
  const normalizedEmail = email?.trim().toLowerCase() || null;

  if (normalizedEmail) {
    const existing = await db.query.agencyClientTable.findFirst({
      where: and(
        eq(agencyClientTable.agencyId, agencyId),
        eq(agencyClientTable.email, normalizedEmail),
      ),
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
        .where(
          and(eq(agencyClientTable.id, existing.id), eq(agencyClientTable.agencyId, agencyId)),
        );
      return existing.id;
    }
  }

  const [client] = await db
    .insert(agencyClientTable)
    .values({
      agencyId,
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
    const { session, staff } = await requireAgencyStaff();
    const db = getDB();

    const assignedReviewerId = input.assignedReviewerId?.trim() || null;
    const approvedBefore = input.approvedBefore === true;
    const rejectedBefore = input.rejectedBefore === true;

    if (assignedReviewerId) {
      const reviewer = await db.query.agencyTeamMemberTable.findFirst({
        where: and(
          eq(agencyTeamMemberTable.userId, assignedReviewerId),
          eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
          eq(agencyTeamMemberTable.agencyId, staff.agencyId),
        ),
      });

      if (!reviewer) {
        throw new ZSAError("INPUT_PARSE_ERROR", "Selected reviewer is not active.");
      }
    }

    const { application, applicant } = await db.withTransaction(async () => {
      const clientId = await resolveOrCreateClient({
        agencyId: staff.agencyId,
        name: input.clientName,
        email: input.clientEmail || null,
        phone: input.clientPhone || null,
        country: input.homeCountry,
      });

      const [application] = await db
        .insert(visaApplicationTable)
        .values({
          agencyId: staff.agencyId,
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

      return { application, applicant };
    });

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
    const { session, staff } = await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId, agencyId: staff.agencyId });

    if (input.status === AGENCY_CASE_STATUS.READY_TO_SUBMIT) {
      await markAgencyCaseReady({ db, applicationId: input.applicationId, userId: session.userId });
    } else {
      await db
        .update(visaApplicationTable)
        .set({
          agencyStatus: input.status,
          reviewCompletedAt: null,
          status: VISA_APPLICATION_STATUS.IN_PROGRESS,
        })
        .where(
          and(
            eq(visaApplicationTable.id, input.applicationId),
            eq(visaApplicationTable.agencyId, staff.agencyId),
          ),
        );
    }

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
    const { staff } = await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId, agencyId: staff.agencyId });
    const reviewerId = input.reviewerId?.trim() || null;

    if (reviewerId) {
      const reviewer = await db.query.agencyTeamMemberTable.findFirst({
        where: and(
          eq(agencyTeamMemberTable.userId, reviewerId),
          eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
          eq(agencyTeamMemberTable.agencyId, staff.agencyId),
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
      .where(
        and(
          eq(visaApplicationTable.id, input.applicationId),
          eq(visaApplicationTable.agencyId, staff.agencyId),
        ),
      );

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/applications");
    return { success: true };
  });

export const syncReviewIssuesFromEvaluationAction = createServerAction()
  .input(z.object({ applicationId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const { session, staff } = await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId, agencyId: staff.agencyId });

    const evaluation = await db.query.documentEvaluationTable.findFirst({
      where: eq(documentEvaluationTable.applicationId, input.applicationId),
      orderBy: newestEvaluationOrder,
    });

    if (!evaluation) throw new ZSAError("PRECONDITION_FAILED", "Run document review first.");
    const result = await syncAgencyReviewIssues({
      db,
      applicationId: input.applicationId,
      evaluation,
      userId: session.userId,
    });
    await invalidateAgencyReports({ db, applicationId: input.applicationId });

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/issues");
    return result;
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
    const { session, staff } = await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId, agencyId: staff.agencyId });

    const [[issue]] = await db.batch([
      db
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
        .returning(),

      db
        .update(visaApplicationTable)
        .set({
          agencyStatus: AGENCY_CASE_STATUS.IN_REVIEW,
          status: VISA_APPLICATION_STATUS.IN_PROGRESS,
          reviewCompletedAt: null,
        })
        .where(
          and(
            eq(visaApplicationTable.id, input.applicationId),
            eq(visaApplicationTable.agencyId, staff.agencyId),
          ),
        ),

      ...getAgencyReportInvalidationQueries({ db, applicationId: input.applicationId }),
    ]);

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/issues");
    return issue;
  });

export const updateReviewIssueStatusAction = createServerAction()
  .input(
    z.object({
      issueId: z.string().min(1),
      status: z
        .union([z.enum(reviewIssueStatusTuple), z.literal("accepted")])
        .transform(normalizeReviewIssueStatus),
    }),
  )
  .handler(async ({ input }) => {
    const { staff } = await requireAgencyStaff();
    const db = getDB();

    const issue = await db.query.reviewIssueTable.findFirst({
      where: eq(reviewIssueTable.id, input.issueId),
      columns: { applicationId: true },
    });

    if (!issue) {
      throw new ZSAError("NOT_FOUND", "Issue not found");
    }
    await requireAgencyCase({ db, applicationId: issue.applicationId, agencyId: staff.agencyId });

    await db.batch([
      db
        .update(reviewIssueTable)
        .set({
          status: input.status,
          resolvedAt:
            input.status === REVIEW_ISSUE_STATUS.RESOLVED ||
            input.status === REVIEW_ISSUE_STATUS.DISMISSED
              ? new Date()
              : null,
        })
        .where(eq(reviewIssueTable.id, input.issueId)),

      ...getAgencyReportInvalidationQueries({ db, applicationId: issue.applicationId }),
      ...(isOpenReviewIssueStatus(input.status)
        ? [
            db
              .update(visaApplicationTable)
              .set({
                agencyStatus: AGENCY_CASE_STATUS.IN_REVIEW,
                status: VISA_APPLICATION_STATUS.IN_PROGRESS,
                reviewCompletedAt: null,
              })
              .where(
                and(
                  eq(visaApplicationTable.id, issue.applicationId),
                  eq(visaApplicationTable.agencyId, staff.agencyId),
                ),
              ),
          ]
        : []),
    ]);
    revalidatePath(`/dashboard/${issue.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/issues");
    return { success: true };
  });

export const generateClientReportAction = createServerAction()
  .input(z.object({ applicationId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const { session, staff } = await requireAgencyStaff();
    const db = getDB();

    const original = await requireAgencyCase({
      db,
      applicationId: input.applicationId,
      agencyId: staff.agencyId,
    });
    await requireCurrentAgencyReview({
      db,
      applicationId: input.applicationId,
      userId: session.userId,
    });
    // Keep the version captured before validation. A later upload must not
    // become the baseline for publishing findings from the previous review.

    const [application, issues] = await Promise.all([
      db.query.visaApplicationTable.findFirst({
        where: and(
          eq(visaApplicationTable.id, input.applicationId),
          eq(visaApplicationTable.agencyId, staff.agencyId),
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
        : "No client issues remain. Check the required documents and review before you mark the case ready.";

    const report = await db.withTransaction(async () => {
      const updated = await db
        .update(visaApplicationTable)
        .set({
          clientReportStatus: CLIENT_REPORT_STATUS.READY,
          ...(actionItems.length > 0
            ? {
                agencyStatus: AGENCY_CASE_STATUS.NEEDS_CLIENT,
                status: VISA_APPLICATION_STATUS.IN_PROGRESS,
                reviewCompletedAt: null,
              }
            : {}),
        })
        .where(
          and(
            eq(visaApplicationTable.id, input.applicationId),
            eq(visaApplicationTable.agencyId, staff.agencyId),
            sql`${visaApplicationTable.updateCounter} IS NOT DISTINCT FROM ${original.updateCounter}`,
          ),
        )
        .returning({ id: visaApplicationTable.id });
      if (!updated.length)
        throw new ZSAError(
          "PRECONDITION_FAILED",
          "The case changed. Run review again before you prepare the report.",
        );
      await db
        .update(clientReportTable)
        .set({ status: CLIENT_REPORT_DELIVERY_STATUS.DRAFT })
        .where(
          and(
            eq(clientReportTable.applicationId, input.applicationId),
            eq(clientReportTable.status, CLIENT_REPORT_DELIVERY_STATUS.READY),
          ),
        );
      const [created] = await db
        .insert(clientReportTable)
        .values({
          applicationId: input.applicationId,
          status: CLIENT_REPORT_DELIVERY_STATUS.READY,
          summary,
          actionItems,
          createdById: session.userId,
        })
        .returning();
      return created;
    });

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/reports");
    return report;
  });

export const updateClientReportRecipientAction = createServerAction()
  .input(
    z.object({
      reportId: z.string().min(1),
      email: z.string().trim().email(),
      csrfToken: z.string().min(1),
    }),
  )
  .handler(async ({ input }) => {
    if (!(await validateCsrfToken(input.csrfToken)))
      throw new ZSAError("FORBIDDEN", "Invalid security token. Refresh the page.");
    const result = await updateClientReportRecipient({
      reportId: input.reportId,
      email: input.email,
    });
    revalidatePath("/dashboard/reports");
    revalidatePath(`/dashboard/reports/${input.reportId}`);
    return result;
  });

export const sendClientReportAction = createServerAction()
  .input(z.object({ reportId: z.string().min(1), csrfToken: z.string().min(1) }))
  .handler(async ({ input }) => {
    if (!(await validateCsrfToken(input.csrfToken)))
      throw new ZSAError("FORBIDDEN", "Invalid security token. Refresh the page.");
    const result = await deliverClientReport({ reportId: input.reportId });
    revalidatePath("/dashboard/reports");
    revalidatePath(`/dashboard/reports/${input.reportId}`);
    return result;
  });

export const finalizeReviewAction = createServerAction()
  .input(z.object({ applicationId: z.string().min(1) }))
  .handler(async ({ input }) => {
    const { session, staff } = await requireAgencyStaff();
    const db = getDB();
    await requireAgencyCase({ db, applicationId: input.applicationId, agencyId: staff.agencyId });

    await markAgencyCaseReady({ db, applicationId: input.applicationId, userId: session.userId });

    revalidatePath(`/dashboard/${input.applicationId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/applications");
    return { success: true };
  });

async function requireStaffMutation({
  db,
  agencyId,
  userId,
  staffMemberId,
}: {
  db: ReturnType<typeof getDB>;
  agencyId: string;
  userId: string;
  staffMemberId: string;
}) {
  // All membership changes share this lock, including ownership and departure.
  await db.execute(sql`select id from ${agencyTable} where id = ${agencyId} for update`);
  const caller = await db.query.agencyTeamMemberTable.findFirst({
    where: and(
      eq(agencyTeamMemberTable.agencyId, agencyId),
      eq(agencyTeamMemberTable.userId, userId),
      eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
      eq(agencyTeamMemberTable.role, AGENCY_STAFF_ROLE.ADMIN),
    ),
  });
  if (!caller) {
    throw new ZSAError("FORBIDDEN", "Your admin access has changed. Refresh the page.");
  }
  const [agency, member] = await Promise.all([
    db.query.agencyTable.findFirst({ where: eq(agencyTable.id, agencyId) }),
    db.query.agencyTeamMemberTable.findFirst({
      where: and(
        eq(agencyTeamMemberTable.id, staffMemberId),
        eq(agencyTeamMemberTable.agencyId, agencyId),
      ),
    }),
  ]);
  if (!agency || !member) throw new ZSAError("NOT_FOUND", "Staff member not found.");
  return { agency, member };
}

async function requireAnotherAdmin({
  db,
  agencyId,
  member,
}: {
  db: ReturnType<typeof getDB>;
  agencyId: string;
  member: { role: string; status: string };
}) {
  if (member.role !== AGENCY_STAFF_ROLE.ADMIN || member.status !== AGENCY_STAFF_STATUS.ACTIVE)
    return;
  const [admins] = await db
    .select({ total: count() })
    .from(agencyTeamMemberTable)
    .where(
      and(
        eq(agencyTeamMemberTable.agencyId, agencyId),
        eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
        eq(agencyTeamMemberTable.role, AGENCY_STAFF_ROLE.ADMIN),
      ),
    );
  if (admins.total <= 1)
    throw new ZSAError("FORBIDDEN", "Assign another admin before removing this admin access.");
}

export const updateAgencyStaffRoleAction = createServerAction()
  .input(
    z.object({
      staffMemberId: z.string().min(1),
      role: z.enum([AGENCY_STAFF_ROLE.ADMIN, AGENCY_STAFF_ROLE.MEMBER]),
      csrfToken: z.string().min(1),
    }),
  )
  .handler(async ({ input }) => {
    if (!(await validateCsrfToken(input.csrfToken)))
      throw new ZSAError("FORBIDDEN", "Invalid security token. Refresh the page.");
    const { session, staff } = await requireAgencyAdmin();
    const db = getDB();
    await db.withTransaction(async () => {
      const { agency, member } = await requireStaffMutation({
        db,
        agencyId: staff.agencyId,
        userId: session.userId,
        staffMemberId: input.staffMemberId,
      });
      if (input.role !== AGENCY_STAFF_ROLE.ADMIN) {
        if (member.userId && member.userId === agency.ownerUserId)
          throw new ZSAError(
            "FORBIDDEN",
            "Transfer agency ownership before changing the owner's admin role.",
          );
        await requireAnotherAdmin({ db, agencyId: staff.agencyId, member });
        if (member.userId === session.userId)
          throw new ZSAError("FORBIDDEN", "You cannot remove your own admin access.");
      }
      await db
        .update(agencyTeamMemberTable)
        .set({ role: input.role, updatedAt: new Date() })
        .where(
          and(
            eq(agencyTeamMemberTable.id, member.id),
            eq(agencyTeamMemberTable.agencyId, staff.agencyId),
          ),
        );
    });
    revalidatePath("/dashboard/team");
    revalidatePath("/settings/agency");
    return { success: true };
  });

export const disableAgencyStaffAction = createServerAction()
  .input(z.object({ staffMemberId: z.string().min(1), csrfToken: z.string().min(1) }))
  .handler(async ({ input }) => {
    if (!(await validateCsrfToken(input.csrfToken)))
      throw new ZSAError("FORBIDDEN", "Invalid security token. Refresh the page.");
    const { session, staff } = await requireAgencyAdmin();
    const db = getDB();
    await db.withTransaction(async () => {
      const { agency, member } = await requireStaffMutation({
        db,
        agencyId: staff.agencyId,
        userId: session.userId,
        staffMemberId: input.staffMemberId,
      });
      if (member.userId && member.userId === agency.ownerUserId)
        throw new ZSAError("FORBIDDEN", "Transfer agency ownership before disabling the owner.");
      await requireAnotherAdmin({ db, agencyId: staff.agencyId, member });
      if (member.userId === session.userId)
        throw new ZSAError("FORBIDDEN", "You cannot disable your own account.");
      if (member.userId) {
        await db
          .update(visaApplicationTable)
          .set({ assignedReviewerId: session.userId, updatedAt: new Date() })
          .where(
            and(
              eq(visaApplicationTable.agencyId, staff.agencyId),
              eq(visaApplicationTable.assignedReviewerId, member.userId),
              isNull(visaApplicationTable.finalSubmissionAt),
            ),
          );
        const agencyCases = db
          .select({ id: visaApplicationTable.id })
          .from(visaApplicationTable)
          .where(eq(visaApplicationTable.agencyId, staff.agencyId));
        await db
          .update(reviewIssueTable)
          .set({ assignedToId: session.userId, updatedAt: new Date() })
          .where(
            and(
              eq(reviewIssueTable.assignedToId, member.userId),
              sql`${reviewIssueTable.applicationId} in (${agencyCases})`,
              sql`${reviewIssueTable.status} in (${REVIEW_ISSUE_STATUS.OPEN}, ${REVIEW_ISSUE_STATUS.CLIENT_REQUESTED})`,
            ),
          );
      }
      await db
        .update(agencyTeamMemberTable)
        .set({ status: AGENCY_STAFF_STATUS.DISABLED, updatedAt: new Date() })
        .where(
          and(
            eq(agencyTeamMemberTable.id, member.id),
            eq(agencyTeamMemberTable.agencyId, staff.agencyId),
          ),
        );
    });
    revalidatePath("/dashboard/team");
    revalidatePath("/settings/agency");
    revalidatePath("/dashboard");
    return { success: true };
  });
