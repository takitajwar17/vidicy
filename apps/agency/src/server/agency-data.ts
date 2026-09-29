import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";

import { getDB } from "@/db";
import {
  AGENCY_CASE_STATUS,
  AGENCY_STAFF_STATUS,
  APPLICANT_RELATIONSHIP,
  CLIENT_REPORT_DELIVERY_STATUS,
  REVIEW_ISSUE_STATUS,
  agencyClientTable,
  agencyTeamMemberTable,
  applicantTable,
  checklistItemTable,
  clientReportTable,
  documentEvaluationTable,
  reviewIssueTable,
  uploadedDocumentTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema";

type VisaApplicationRow = typeof visaApplicationTable.$inferSelect;
type ApplicantRow = typeof applicantTable.$inferSelect;
type EvaluationRow = typeof documentEvaluationTable.$inferSelect;
type ClientReportRow = typeof clientReportTable.$inferSelect;

export interface AgencyStaffRow {
  id: string;
  userId: string | null;
  email: string | null;
  role: string;
  status: string;
  joinedAt: Date | null;
  invitedAt: Date | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    avatar: string | null;
  } | null;
}

export interface AgencyCaseRow {
  application: VisaApplicationRow;
  primaryApplicant: ApplicantRow | null;
  reviewer: AgencyStaffRow["user"] | null;
  latestEvaluation: EvaluationRow | null;
  documentCount: number;
  openIssueCount: number;
  highIssueCount: number;
}

function getDisplayName(user: AgencyStaffRow["user"] | null) {
  if (!user) return null;
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Reviewer";
}

function getAgencyCaseFilters() {
  return [
    isNull(visaApplicationTable.trashedAt),
    isNotNull(visaApplicationTable.clientId),
  ];
}

export async function getActiveAgencyStaffRows(): Promise<AgencyStaffRow[]> {
  const db = getDB();

  const rows = await db
    .select({
      id: agencyTeamMemberTable.id,
      userId: agencyTeamMemberTable.userId,
	      email: agencyTeamMemberTable.email,
	      role: agencyTeamMemberTable.role,
	      status: agencyTeamMemberTable.status,
      joinedAt: agencyTeamMemberTable.joinedAt,
      invitedAt: agencyTeamMemberTable.invitedAt,
      user: {
        id: userTable.id,
        firstName: userTable.firstName,
        lastName: userTable.lastName,
        email: userTable.email,
        avatar: userTable.avatar,
      },
    })
    .from(agencyTeamMemberTable)
	    .leftJoin(userTable, eq(agencyTeamMemberTable.userId, userTable.id))
	    .where(eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE))
	    .orderBy(desc(agencyTeamMemberTable.joinedAt));

  return rows.map((row) => ({
    ...row,
    user: row.user?.id
      ? {
          id: row.user.id,
          firstName: row.user.firstName,
          lastName: row.user.lastName,
          email: row.user.email,
          avatar: row.user.avatar,
        }
      : null,
  }));
}

export async function getAgencyCaseRows({
  limit = 200,
  statuses,
}: {
  limit?: number;
  statuses?: string[];
} = {}): Promise<AgencyCaseRow[]> {
  const db = getDB();

  const filters = getAgencyCaseFilters();
  if (statuses?.length) {
    filters.push(inArray(visaApplicationTable.agencyStatus, statuses));
  }

  const applications = await db.query.visaApplicationTable.findMany({
    where: filters.length > 1 ? and(...filters) : filters[0],
    orderBy: [desc(visaApplicationTable.createdAt)],
    limit,
  });

  if (applications.length === 0) return [];

  const applicationIds = applications.map((application) => application.id);
  const reviewerIds = Array.from(
    new Set(applications.map((application) => application.assignedReviewerId).filter(Boolean)),
  ) as string[];

  const [
    applicants,
    documents,
    issues,
    evaluations,
    reviewers,
  ] = await Promise.all([
    db.query.applicantTable.findMany({
      where: inArray(applicantTable.applicationId, applicationIds),
      orderBy: [desc(applicantTable.createdAt)],
    }),
    db.query.uploadedDocumentTable.findMany({
      where: inArray(uploadedDocumentTable.applicationId, applicationIds),
      columns: {
        id: true,
        applicationId: true,
        fileSize: true,
      },
    }),
    db.query.reviewIssueTable.findMany({
      where: and(
        inArray(reviewIssueTable.applicationId, applicationIds),
        ne(reviewIssueTable.status, REVIEW_ISSUE_STATUS.DISMISSED),
      ),
    }),
    db.query.documentEvaluationTable.findMany({
      where: inArray(documentEvaluationTable.applicationId, applicationIds),
      orderBy: [desc(documentEvaluationTable.createdAt)],
    }),
    reviewerIds.length
      ? db
          .select({
            id: userTable.id,
            firstName: userTable.firstName,
            lastName: userTable.lastName,
            email: userTable.email,
            avatar: userTable.avatar,
          })
          .from(userTable)
          .where(inArray(userTable.id, reviewerIds))
      : Promise.resolve([]),
  ]);

  const primaryApplicantByApp = new Map<string, ApplicantRow>();
  for (const applicant of applicants) {
    if (applicant.relationship !== APPLICANT_RELATIONSHIP.PRIMARY) continue;
    if (!primaryApplicantByApp.has(applicant.applicationId)) {
      primaryApplicantByApp.set(applicant.applicationId, applicant);
    }
  }

  for (const applicant of applicants) {
    if (!primaryApplicantByApp.has(applicant.applicationId)) {
      primaryApplicantByApp.set(applicant.applicationId, applicant);
    }
  }

  const documentCountByApp = new Map<string, number>();
  for (const document of documents) {
    documentCountByApp.set(document.applicationId, (documentCountByApp.get(document.applicationId) ?? 0) + 1);
  }

  const openIssueCountByApp = new Map<string, number>();
  const highIssueCountByApp = new Map<string, number>();
  for (const issue of issues) {
    if (issue.status !== REVIEW_ISSUE_STATUS.RESOLVED) {
      openIssueCountByApp.set(issue.applicationId, (openIssueCountByApp.get(issue.applicationId) ?? 0) + 1);
    }
    if (issue.severity === "high" && issue.status !== REVIEW_ISSUE_STATUS.RESOLVED) {
      highIssueCountByApp.set(issue.applicationId, (highIssueCountByApp.get(issue.applicationId) ?? 0) + 1);
    }
  }

  const latestEvaluationByApp = new Map<string, EvaluationRow>();
  for (const evaluation of evaluations) {
    if (!latestEvaluationByApp.has(evaluation.applicationId)) {
      latestEvaluationByApp.set(evaluation.applicationId, evaluation);
    }
  }

  const reviewerById = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer]));

  return applications.map((application) => ({
    application,
    primaryApplicant: primaryApplicantByApp.get(application.id) ?? null,
    reviewer: application.assignedReviewerId
      ? (reviewerById.get(application.assignedReviewerId) ?? null)
      : null,
    latestEvaluation: latestEvaluationByApp.get(application.id) ?? null,
    documentCount: documentCountByApp.get(application.id) ?? 0,
    openIssueCount: openIssueCountByApp.get(application.id) ?? 0,
    highIssueCount: highIssueCountByApp.get(application.id) ?? 0,
  }));
}

export async function getAgencyDashboardData() {
  const [cases, staff] = await Promise.all([
    getAgencyCaseRows({ limit: 500 }),
    getActiveAgencyStaffRows(),
  ]);

  const completedStatuses = new Set<string>([
    AGENCY_CASE_STATUS.READY_TO_SUBMIT,
    AGENCY_CASE_STATUS.SUBMITTED,
    AGENCY_CASE_STATUS.COMPLETED,
  ]);

  const inReviewStatuses = new Set<string>([
    AGENCY_CASE_STATUS.READY_FOR_REVIEW,
    AGENCY_CASE_STATUS.AI_REVIEWED,
    AGENCY_CASE_STATUS.IN_REVIEW,
    AGENCY_CASE_STATUS.NEEDS_CLIENT,
  ]);

  const totalApplications = cases.length;
  const completed = cases.filter(({ application }) => completedStatuses.has(application.agencyStatus)).length;
  const inReview = cases.filter(({ application }) => inReviewStatuses.has(application.agencyStatus)).length;
  const flagged = cases.filter((row) => row.highIssueCount > 0 || row.application.agencyStatus === AGENCY_CASE_STATUS.NEEDS_CLIENT).length;
  const scoredCases = cases.filter((row) => row.latestEvaluation);
  const approvalReadyRate =
    totalApplications > 0 ? Math.round((completed / totalApplications) * 1000) / 10 : 0;

  const issueBuckets = new Map<string, { count: number; high: number }>();
  for (const row of cases) {
    if (row.openIssueCount === 0) continue;
    const key = row.highIssueCount > 0 ? "High-priority file issues" : "Review issues";
    const current = issueBuckets.get(key) ?? { count: 0, high: 0 };
    current.count += row.openIssueCount;
    current.high += row.highIssueCount;
    issueBuckets.set(key, current);
  }

  const topFlaggedIssues = Array.from(issueBuckets.entries())
    .map(([label, value]) => ({ label, ...value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const workload = staff.filter((member) => member.userId && member.user).map((member) => {
    const assigned = cases.filter((row) => row.application.assignedReviewerId === member.userId);
    const reviewerCompleted = assigned.filter(({ application }) =>
      completedStatuses.has(application.agencyStatus),
    ).length;
    const reviewerInReview = assigned.filter(({ application }) =>
      inReviewStatuses.has(application.agencyStatus),
    ).length;

    return {
	      ...member,
	      displayName: getDisplayName(member.user),
      inReview: reviewerInReview,
      completed: reviewerCompleted,
      sla: reviewerInReview > 12 ? "At risk" : "On track",
    };
  });

  return {
    cases,
    recentCases: cases.slice(0, 8),
    staff,
    workload,
    topFlaggedIssues,
    stats: {
      totalApplications,
      completed,
      inReview,
      flagged,
      approvalReadyRate,
      scoredCases: scoredCases.length,
    },
  };
}

export async function getAgencyCaseDetail(appId: string) {
  const db = getDB();

  const [
    application,
    applicants,
    checklistItems,
    documents,
    latestEvaluation,
    issues,
    reports,
    staff,
  ] = await Promise.all([
    db.query.visaApplicationTable.findFirst({
      where: and(
        eq(visaApplicationTable.id, appId),
        isNull(visaApplicationTable.trashedAt),
        isNotNull(visaApplicationTable.clientId),
      ),
    }),
    db.query.applicantTable.findMany({
      where: eq(applicantTable.applicationId, appId),
      orderBy: [desc(applicantTable.createdAt)],
    }),
    db.query.checklistItemTable.findMany({
      where: eq(checklistItemTable.applicationId, appId),
      orderBy: [checklistItemTable.sortOrder],
    }),
    db.query.uploadedDocumentTable.findMany({
      where: eq(uploadedDocumentTable.applicationId, appId),
      orderBy: [desc(uploadedDocumentTable.uploadedAt)],
    }),
    db.query.documentEvaluationTable.findFirst({
      where: eq(documentEvaluationTable.applicationId, appId),
      orderBy: [desc(documentEvaluationTable.createdAt)],
    }),
    db.query.reviewIssueTable.findMany({
      where: eq(reviewIssueTable.applicationId, appId),
      orderBy: [desc(reviewIssueTable.createdAt)],
    }),
    db.query.clientReportTable.findMany({
      where: eq(clientReportTable.applicationId, appId),
      orderBy: [desc(clientReportTable.createdAt)],
    }),
    getActiveAgencyStaffRows(),
  ]);

  return {
    application,
    applicants,
    primaryApplicant:
      applicants.find((applicant) => applicant.relationship === APPLICANT_RELATIONSHIP.PRIMARY) ??
      applicants[0] ??
      null,
    checklistItems,
    documents,
    latestEvaluation,
    issues,
    latestReport: reports[0] ?? null,
    staff,
  };
}

export async function getAgencyClientsWithCounts() {
  const db = getDB();
  const [clients, cases] = await Promise.all([
    db.query.agencyClientTable.findMany({
      orderBy: [desc(agencyClientTable.updatedAt)],
    }),
    db.query.visaApplicationTable.findMany({
      where: and(...getAgencyCaseFilters()),
      orderBy: [desc(visaApplicationTable.createdAt)],
    }),
  ]);

  return clients.map((client) => {
    const clientCases = cases.filter(
      (application) =>
        application.clientId === client.id ||
        (client.email && application.clientEmail === client.email),
    );

    return {
      client,
      caseCount: clientCases.length,
      openCaseCount: clientCases.filter(
        (application) =>
          application.agencyStatus !== AGENCY_CASE_STATUS.COMPLETED &&
          application.agencyStatus !== AGENCY_CASE_STATUS.ARCHIVED,
      ).length,
      lastCaseAt: clientCases[0]?.createdAt ?? null,
    };
  });
}

export async function getAgencyDocuments() {
  const db = getDB();

  const applications = await db.query.visaApplicationTable.findMany({
    where: and(...getAgencyCaseFilters()),
    orderBy: [desc(visaApplicationTable.createdAt)],
    limit: 500,
  });
  if (applications.length === 0) return [];

  const applicationIds = applications.map((application) => application.id);
  const documents = await db.query.uploadedDocumentTable.findMany({
    where: inArray(uploadedDocumentTable.applicationId, applicationIds),
    orderBy: [desc(uploadedDocumentTable.uploadedAt)],
    limit: 300,
  });

  if (documents.length === 0) return [];

  const applicantIds = Array.from(
    new Set(documents.map((document) => document.applicantId).filter(Boolean)),
  ) as string[];

  const applicants = applicantIds.length
    ? await db.query.applicantTable.findMany({
        where: inArray(applicantTable.id, applicantIds),
      })
    : [];

  const appById = new Map(applications.map((application) => [application.id, application]));
  const applicantById = new Map(applicants.map((applicant) => [applicant.id, applicant]));

  return documents.map((document) => ({
    document,
    application: appById.get(document.applicationId) ?? null,
    applicant: document.applicantId ? (applicantById.get(document.applicantId) ?? null) : null,
  }));
}

export async function getAgencyReviewIssueRows({ limit = 300 }: { limit?: number } = {}) {
  const db = getDB();

  const issues = await db.query.reviewIssueTable.findMany({
    where: ne(reviewIssueTable.status, REVIEW_ISSUE_STATUS.DISMISSED),
    orderBy: [desc(reviewIssueTable.createdAt)],
    limit,
  });

  if (issues.length === 0) return [];

  const applicationIds = Array.from(new Set(issues.map((issue) => issue.applicationId)));
  const applicantIds = Array.from(
    new Set(issues.map((issue) => issue.applicantId).filter(Boolean)),
  ) as string[];
  const documentIds = Array.from(new Set(issues.map((issue) => issue.documentId).filter(Boolean))) as string[];

  const [applications, applicants, documents] = await Promise.all([
    db.query.visaApplicationTable.findMany({
      where: and(
        inArray(visaApplicationTable.id, applicationIds),
        isNull(visaApplicationTable.trashedAt),
        isNotNull(visaApplicationTable.clientId),
      ),
    }),
    applicantIds.length
      ? db.query.applicantTable.findMany({
          where: inArray(applicantTable.id, applicantIds),
        })
      : Promise.resolve([]),
    documentIds.length
      ? db.query.uploadedDocumentTable.findMany({
          where: inArray(uploadedDocumentTable.id, documentIds),
        })
      : Promise.resolve([]),
  ]);

  const applicationById = new Map(applications.map((application) => [application.id, application]));
  const agencyApplicationIds = new Set(applicationById.keys());
  const applicantById = new Map(applicants.map((applicant) => [applicant.id, applicant]));
  const documentById = new Map(documents.map((document) => [document.id, document]));

  return issues
    .filter((issue) => agencyApplicationIds.has(issue.applicationId))
    .map((issue) => ({
      issue,
      application: applicationById.get(issue.applicationId) ?? null,
      applicant: issue.applicantId ? (applicantById.get(issue.applicantId) ?? null) : null,
      document: issue.documentId ? (documentById.get(issue.documentId) ?? null) : null,
    }));
}

export async function getAgencyReports() {
  const db = getDB();

  const reports = await db.query.clientReportTable.findMany({
    orderBy: [desc(clientReportTable.createdAt)],
    limit: 200,
  });

  const cases = await getAgencyCaseRows({ limit: 500 });
  const casesById = new Map(cases.map((row) => [row.application.id, row]));
  const agencyReports = reports.filter((report) => casesById.has(report.applicationId));

  const reportRows = agencyReports.map((report) => ({
    report,
    caseRow: casesById.get(report.applicationId) ?? null,
  }));

  const readyCount = agencyReports.filter((report) => report.status === CLIENT_REPORT_DELIVERY_STATUS.READY).length;
  const sentCount = agencyReports.filter((report) => report.status === CLIENT_REPORT_DELIVERY_STATUS.SENT).length;

  return {
    reports: reportRows,
    casesWithoutReports: cases.filter(
      (row) => !agencyReports.some((report) => report.applicationId === row.application.id),
    ),
    stats: {
      total: agencyReports.length,
      ready: readyCount,
      sent: sentCount,
    },
  };
}

export type AgencyCaseDetail = Awaited<ReturnType<typeof getAgencyCaseDetail>>;
export type AgencyDocumentRow = Awaited<ReturnType<typeof getAgencyDocuments>>[number];
export type AgencyReportRow = {
  report: ClientReportRow;
  caseRow: AgencyCaseRow | null;
};
export type AgencyReviewIssueRow = Awaited<ReturnType<typeof getAgencyReviewIssueRows>>[number];
