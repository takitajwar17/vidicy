import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, like, ne, or } from "drizzle-orm";

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
import {
  formatReviewerDisplayName,
  isOpenReviewIssueStatus,
  normalizeAgencyCaseStatus,
  normalizeReviewIssueStatus,
} from "@/lib/agency-workflow";

type VisaApplicationRow = typeof visaApplicationTable.$inferSelect;
type ApplicantRow = typeof applicantTable.$inferSelect;
type EvaluationRow = typeof documentEvaluationTable.$inferSelect;
type ClientReportRow = typeof clientReportTable.$inferSelect;
type ReviewIssueRow = typeof reviewIssueTable.$inferSelect;

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

export interface AgencyIssuePattern {
  label: string;
  count: number;
  high: number;
  caseCount: number;
}

function getAgencyCaseFilters() {
  return [isNull(visaApplicationTable.trashedAt), isNotNull(visaApplicationTable.clientId)];
}

function normalizeSearchQuery(query?: string | null) {
  return query?.trim() || "";
}

function getPrimaryApplicantByApplication(applicants: ApplicantRow[]) {
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

  return primaryApplicantByApp;
}

function getAgencyTopIssuePatterns(issues: ReviewIssueRow[]): AgencyIssuePattern[] {
  const issueBuckets = new Map<
    string,
    {
      label: string;
      count: number;
      high: number;
      caseIds: Set<string>;
    }
  >();

  for (const issue of issues) {
    if (!isOpenReviewIssueStatus(issue.status)) continue;

    const label = issue.title.trim() || "Untitled issue";
    const key = label.toLowerCase();
    const current =
      issueBuckets.get(key) ?? {
        label,
        count: 0,
        high: 0,
        caseIds: new Set<string>(),
      };

    current.count += 1;
    current.caseIds.add(issue.applicationId);
    if (issue.severity === "high") {
      current.high += 1;
    }
    issueBuckets.set(key, current);
  }

  return Array.from(issueBuckets.values())
    .map((pattern) => ({
      label: pattern.label,
      count: pattern.count,
      high: pattern.high,
      caseCount: pattern.caseIds.size,
    }))
    .sort((a, b) => b.count - a.count || b.high - a.high || a.label.localeCompare(b.label))
    .slice(0, 5);
}

async function getApplicantSearchMatches(query: string): Promise<{
  applicationIds: string[];
  applicantIds: string[];
}> {
  if (!query) return { applicationIds: [], applicantIds: [] };

  const db = getDB();
  const applicants = await db.query.applicantTable.findMany({
    where: like(applicantTable.name, `%${query}%`),
    columns: {
      id: true,
      applicationId: true,
    },
    limit: 500,
  });

  return {
    applicationIds: Array.from(new Set(applicants.map((applicant) => applicant.applicationId))),
    applicantIds: Array.from(new Set(applicants.map((applicant) => applicant.id))),
  };
}

async function getApplicationSearchMatches(query: string): Promise<string[]> {
  if (!query) return [];

  const db = getDB();
  const applications = await db.query.visaApplicationTable.findMany({
    where: and(
      ...getAgencyCaseFilters(),
      or(
        like(visaApplicationTable.caseNumber, `%${query}%`),
        like(visaApplicationTable.clientName, `%${query}%`),
        like(visaApplicationTable.clientEmail, `%${query}%`),
        like(visaApplicationTable.destinationCountry, `%${query}%`),
        like(visaApplicationTable.visaType, `%${query}%`),
      ),
    ),
    columns: {
      id: true,
    },
    limit: 500,
  });

  return applications.map((application) => application.id);
}

function matchesReportSearch(report: ClientReportRow, query: string) {
  if (!query) return true;

  const normalizedQuery = query.toLowerCase();
  const actionItemText = report.actionItems
    .map((item) => `${item.title} ${item.detail}`)
    .join(" ")
    .toLowerCase();

  return (
    report.summary.toLowerCase().includes(normalizedQuery) ||
    actionItemText.includes(normalizedQuery)
  );
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

export interface AgencyTeamWorkloadRow {
  rowId: string;
  staff: AgencyStaffRow | null;
  displayName: string;
  assignedCases: number;
  activeCases: number;
  needsClientCases: number;
  readyCases: number;
  openIssues: number;
  lastActivityAt: Date | null;
}

export async function getAgencyCaseRows({
  limit = 200,
  offset = 0,
  query: rawQuery = null,
  statuses,
}: {
  limit?: number;
  offset?: number;
  query?: string | null;
  statuses?: string[];
} = {}): Promise<AgencyCaseRow[]> {
  const db = getDB();
  const query = normalizeSearchQuery(rawQuery);
  const applicantMatches = await getApplicantSearchMatches(query);

  const filters = getAgencyCaseFilters();
  if (statuses?.length) {
    filters.push(inArray(visaApplicationTable.agencyStatus, statuses));
  }
  if (query) {
    const queryFilters = [
      like(visaApplicationTable.caseNumber, `%${query}%`),
      like(visaApplicationTable.clientName, `%${query}%`),
      like(visaApplicationTable.clientEmail, `%${query}%`),
      like(visaApplicationTable.destinationCountry, `%${query}%`),
      like(visaApplicationTable.visaType, `%${query}%`),
    ];

    if (applicantMatches.applicationIds.length) {
      queryFilters.push(inArray(visaApplicationTable.id, applicantMatches.applicationIds));
    }

    filters.push(or(...queryFilters)!);
  }

  const applications = await db.query.visaApplicationTable.findMany({
    where: and(...filters),
    orderBy: [desc(visaApplicationTable.createdAt)],
    limit,
    offset,
  });

  if (applications.length === 0) return [];

  const applicationIds = applications.map((application) => application.id);
  const reviewerIds = Array.from(
    new Set(applications.map((application) => application.assignedReviewerId).filter(Boolean)),
  ) as string[];

  const [applicants, documents, issues, evaluations, reviewers] = await Promise.all([
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

  const primaryApplicantByApp = getPrimaryApplicantByApplication(applicants);

  const documentCountByApp = new Map<string, number>();
  for (const document of documents) {
    documentCountByApp.set(
      document.applicationId,
      (documentCountByApp.get(document.applicationId) ?? 0) + 1,
    );
  }

  const openIssueCountByApp = new Map<string, number>();
  const highIssueCountByApp = new Map<string, number>();
  for (const issue of issues) {
    if (isOpenReviewIssueStatus(issue.status)) {
      openIssueCountByApp.set(
        issue.applicationId,
        (openIssueCountByApp.get(issue.applicationId) ?? 0) + 1,
      );
    }
    if (issue.severity === "high" && isOpenReviewIssueStatus(issue.status)) {
      highIssueCountByApp.set(
        issue.applicationId,
        (highIssueCountByApp.get(issue.applicationId) ?? 0) + 1,
      );
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

export async function getAgencyTeamWorkloadRows(): Promise<AgencyTeamWorkloadRow[]> {
  const [staff, cases] = await Promise.all([
    getActiveAgencyStaffRows(),
    getAgencyCaseRows({ limit: 1000 }),
  ]);

  function buildWorkloadRow({
    rowId,
    staffMember,
    displayName,
    assignedCases,
  }: {
    rowId: string;
    staffMember: AgencyStaffRow | null;
    displayName: string;
    assignedCases: AgencyCaseRow[];
  }): AgencyTeamWorkloadRow {
    const statusCounts = assignedCases.reduce(
      (counts, row) => {
        const status = normalizeAgencyCaseStatus(row.application.agencyStatus);
        if (status === AGENCY_CASE_STATUS.INTAKE) counts.intake += 1;
        if (status === AGENCY_CASE_STATUS.IN_REVIEW) counts.inReview += 1;
        if (status === AGENCY_CASE_STATUS.NEEDS_CLIENT) counts.needsClient += 1;
        if (status === AGENCY_CASE_STATUS.READY_TO_SUBMIT) counts.ready += 1;
        return counts;
      },
      { intake: 0, inReview: 0, needsClient: 0, ready: 0 },
    );
    const lastActivityAt = assignedCases.reduce<Date | null>((latest, row) => {
      const activityDate = row.application.updatedAt ?? row.application.createdAt;
      if (!latest || activityDate > latest) return activityDate;
      return latest;
    }, null);

    return {
      rowId,
      staff: staffMember,
      displayName,
      assignedCases: assignedCases.length,
      activeCases: statusCounts.intake + statusCounts.inReview + statusCounts.needsClient,
      needsClientCases: statusCounts.needsClient,
      readyCases: statusCounts.ready,
      openIssues: assignedCases.reduce((sum, row) => sum + row.openIssueCount, 0),
      lastActivityAt,
    };
  }

  const staffRows = staff.map((member) => {
    const assignedCases = member.userId
      ? cases.filter((row) => row.application.assignedReviewerId === member.userId)
      : [];
    return buildWorkloadRow({
      rowId: member.id,
      staffMember: member,
      displayName: member.user
        ? formatReviewerDisplayName(member.user)
        : (member.email ?? "Reviewer"),
      assignedCases,
    });
  });
  const unassignedCases = cases.filter((row) => !row.application.assignedReviewerId);
  const workloadRows =
    unassignedCases.length > 0
      ? [
          buildWorkloadRow({
            rowId: "unassigned",
            staffMember: null,
            displayName: "Unassigned",
            assignedCases: unassignedCases,
          }),
          ...staffRows,
        ]
      : staffRows;

  return workloadRows.sort(
    (a, b) =>
      b.activeCases - a.activeCases ||
      b.openIssues - a.openIssues ||
      b.assignedCases - a.assignedCases ||
      a.displayName.localeCompare(b.displayName),
  );
}

export async function getAgencyDashboardData() {
  const [cases, staff] = await Promise.all([
    getAgencyCaseRows({ limit: 500 }),
    getActiveAgencyStaffRows(),
  ]);
  const caseIds = cases.map((row) => row.application.id);
  const issueRows = caseIds.length
    ? await getDB().query.reviewIssueTable.findMany({
        where: and(
          inArray(reviewIssueTable.applicationId, caseIds),
          ne(reviewIssueTable.status, REVIEW_ISSUE_STATUS.DISMISSED),
        ),
        orderBy: [desc(reviewIssueTable.createdAt)],
      })
    : [];

  const totalApplications = cases.length;
  const readyToSubmit = cases.filter(
    ({ application }) =>
      normalizeAgencyCaseStatus(application.agencyStatus) === AGENCY_CASE_STATUS.READY_TO_SUBMIT,
  ).length;
  const inReview = cases.filter(
    ({ application }) =>
      normalizeAgencyCaseStatus(application.agencyStatus) === AGENCY_CASE_STATUS.IN_REVIEW,
  ).length;
  const needsClient = cases.filter(
    ({ application }) =>
      normalizeAgencyCaseStatus(application.agencyStatus) === AGENCY_CASE_STATUS.NEEDS_CLIENT,
  ).length;
  const openIssueCases = cases.filter(
    (row) =>
      row.highIssueCount > 0 ||
      normalizeAgencyCaseStatus(row.application.agencyStatus) === AGENCY_CASE_STATUS.NEEDS_CLIENT,
  ).length;
  const scoredCases = cases.filter((row) => row.latestEvaluation);
  const readyRate =
    totalApplications > 0 ? Math.round((readyToSubmit / totalApplications) * 1000) / 10 : 0;

  const topFlaggedIssues = getAgencyTopIssuePatterns(issueRows);

  const workload = staff
    .filter((member) => member.userId && member.user)
    .map((member) => {
      const assigned = cases.filter((row) => row.application.assignedReviewerId === member.userId);
      const reviewerCompleted = assigned.filter(
        ({ application }) =>
          normalizeAgencyCaseStatus(application.agencyStatus) ===
          AGENCY_CASE_STATUS.READY_TO_SUBMIT,
      ).length;
      const reviewerInReview = assigned.filter(({ application }) => {
        const status = normalizeAgencyCaseStatus(application.agencyStatus);
        return (
          status === AGENCY_CASE_STATUS.IN_REVIEW || status === AGENCY_CASE_STATUS.NEEDS_CLIENT
        );
      }).length;

      return {
        ...member,
        displayName: member.user ? formatReviewerDisplayName(member.user) : null,
        inReview: reviewerInReview,
        completed: reviewerCompleted,
      };
    })
  const unassignedCases = cases.filter((row) => !row.application.assignedReviewerId);
  if (unassignedCases.length > 0) {
    const unassignedReady = unassignedCases.filter(
      ({ application }) =>
        normalizeAgencyCaseStatus(application.agencyStatus) ===
        AGENCY_CASE_STATUS.READY_TO_SUBMIT,
    ).length;
    const unassignedActive = unassignedCases.filter(({ application }) => {
      const status = normalizeAgencyCaseStatus(application.agencyStatus);
      return (
        status === AGENCY_CASE_STATUS.INTAKE ||
        status === AGENCY_CASE_STATUS.IN_REVIEW ||
        status === AGENCY_CASE_STATUS.NEEDS_CLIENT
      );
    }).length;

    workload.push({
      id: "unassigned",
      userId: null,
      email: null,
      role: "member",
      status: AGENCY_STAFF_STATUS.ACTIVE,
      joinedAt: null,
      invitedAt: null,
      user: null,
      displayName: "Unassigned",
      inReview: unassignedActive,
      completed: unassignedReady,
    });
  }

  workload.sort(
      (a, b) =>
        b.inReview - a.inReview ||
        b.completed - a.completed ||
        (a.displayName ?? "").localeCompare(b.displayName ?? ""),
    );

  return {
    cases,
    recentCases: cases.slice(0, 8),
    staff,
    workload,
    topFlaggedIssues,
    stats: {
      totalApplications,
      completed: readyToSubmit,
      readyToSubmit,
      inReview,
      needsClient,
      flagged: openIssueCases,
      openIssueCases,
      approvalReadyRate: readyRate,
      readyRate,
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
    issues: issues.map((issue) => ({
      ...issue,
      status: normalizeReviewIssueStatus(issue.status),
    })),
    latestReport: reports[0] ?? null,
    staff,
  };
}

export async function getAgencyClientsWithCounts({
  limit = 100,
  offset = 0,
  query: rawQuery = null,
}: {
  limit?: number;
  offset?: number;
  query?: string | null;
} = {}) {
  const db = getDB();
  const query = normalizeSearchQuery(rawQuery);
  const clientFilters = query
    ? or(
        like(agencyClientTable.name, `%${query}%`),
        like(agencyClientTable.email, `%${query}%`),
        like(agencyClientTable.phone, `%${query}%`),
        like(agencyClientTable.country, `%${query}%`),
      )
    : undefined;
  const [clients, cases] = await Promise.all([
    db.query.agencyClientTable.findMany({
      where: clientFilters,
      orderBy: [desc(agencyClientTable.updatedAt)],
      limit,
      offset,
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
          normalizeAgencyCaseStatus(application.agencyStatus) !==
          AGENCY_CASE_STATUS.READY_TO_SUBMIT,
      ).length,
      lastCaseAt: clientCases[0]?.updatedAt ?? clientCases[0]?.createdAt ?? null,
    };
  });
}

export async function getAgencyDocuments({
  limit = 100,
  offset = 0,
  query: rawQuery = null,
}: {
  limit?: number;
  offset?: number;
  query?: string | null;
} = {}) {
  const db = getDB();
  const query = normalizeSearchQuery(rawQuery);
  const applicantMatches = await getApplicantSearchMatches(query);
  const filters = getAgencyCaseFilters();

  if (query) {
    const queryFilters = [
      like(uploadedDocumentTable.fileName, `%${query}%`),
      like(uploadedDocumentTable.mimeType, `%${query}%`),
      like(visaApplicationTable.caseNumber, `%${query}%`),
      like(visaApplicationTable.clientName, `%${query}%`),
      like(visaApplicationTable.destinationCountry, `%${query}%`),
      like(visaApplicationTable.visaType, `%${query}%`),
    ];

    if (applicantMatches.applicationIds.length) {
      queryFilters.push(inArray(visaApplicationTable.id, applicantMatches.applicationIds));
    }
    if (applicantMatches.applicantIds.length) {
      queryFilters.push(inArray(uploadedDocumentTable.applicantId, applicantMatches.applicantIds));
    }

    filters.push(or(...queryFilters)!);
  }

  const documentRows = await db
    .select({
      application: visaApplicationTable,
      document: uploadedDocumentTable,
    })
    .from(uploadedDocumentTable)
    .innerJoin(visaApplicationTable, eq(uploadedDocumentTable.applicationId, visaApplicationTable.id))
    .where(and(...filters))
    .orderBy(desc(uploadedDocumentTable.uploadedAt))
    .limit(limit)
    .offset(offset);

  if (documentRows.length === 0) return [];

  const applicationIds = Array.from(
    new Set(documentRows.map(({ application }) => application.id)),
  );
  const applicants = await db.query.applicantTable.findMany({
    where: inArray(applicantTable.applicationId, applicationIds),
    orderBy: [desc(applicantTable.createdAt)],
  });

  const applicantById = new Map(applicants.map((applicant) => [applicant.id, applicant]));
  const primaryApplicantByApp = getPrimaryApplicantByApplication(applicants);

  return documentRows.map(({ application, document }) => ({
    document,
    application,
    applicant: document.applicantId
      ? (applicantById.get(document.applicantId) ?? primaryApplicantByApp.get(application.id) ?? null)
      : (primaryApplicantByApp.get(application.id) ?? null),
  }));
}

export async function getAgencyReviewIssueRows({
  limit = 100,
  offset = 0,
  query: rawQuery = null,
}: {
  limit?: number;
  offset?: number;
  query?: string | null;
} = {}) {
  const db = getDB();
  const query = normalizeSearchQuery(rawQuery);
  const applicantMatches = await getApplicantSearchMatches(query);
  const applicationMatches = await getApplicationSearchMatches(query);
  const issueFilters = [ne(reviewIssueTable.status, REVIEW_ISSUE_STATUS.DISMISSED)];

  if (query) {
    const queryFilters = [
      like(reviewIssueTable.title, `%${query}%`),
      like(reviewIssueTable.description, `%${query}%`),
      like(reviewIssueTable.recommendation, `%${query}%`),
    ];

    if (applicantMatches.applicationIds.length) {
      queryFilters.push(inArray(reviewIssueTable.applicationId, applicantMatches.applicationIds));
    }
    if (applicationMatches.length) {
      queryFilters.push(inArray(reviewIssueTable.applicationId, applicationMatches));
    }
    if (applicantMatches.applicantIds.length) {
      queryFilters.push(inArray(reviewIssueTable.applicantId, applicantMatches.applicantIds));
    }

    issueFilters.push(or(...queryFilters)!);
  }

  const issues = await db.query.reviewIssueTable.findMany({
    where: and(...issueFilters),
    orderBy: [desc(reviewIssueTable.createdAt)],
    limit,
    offset,
  });

  if (issues.length === 0) return [];

  const applicationIds = Array.from(new Set(issues.map((issue) => issue.applicationId)));
  const documentIds = Array.from(
    new Set(issues.map((issue) => issue.documentId).filter(Boolean)),
  ) as string[];

  const [applications, applicants, documents] = await Promise.all([
    db.query.visaApplicationTable.findMany({
      where: and(
        inArray(visaApplicationTable.id, applicationIds),
        isNull(visaApplicationTable.trashedAt),
        isNotNull(visaApplicationTable.clientId),
      ),
    }),
    db.query.applicantTable.findMany({
      where: inArray(applicantTable.applicationId, applicationIds),
      orderBy: [desc(applicantTable.createdAt)],
    }),
    documentIds.length
      ? db.query.uploadedDocumentTable.findMany({
          where: inArray(uploadedDocumentTable.id, documentIds),
        })
      : Promise.resolve([]),
  ]);

  const applicationById = new Map(applications.map((application) => [application.id, application]));
  const agencyApplicationIds = new Set(applicationById.keys());
  const applicantById = new Map(applicants.map((applicant) => [applicant.id, applicant]));
  const primaryApplicantByApp = getPrimaryApplicantByApplication(applicants);
  const documentById = new Map(documents.map((document) => [document.id, document]));

  return issues
    .filter((issue) => agencyApplicationIds.has(issue.applicationId))
    .map((issue) => ({
      issue: {
        ...issue,
        status: normalizeReviewIssueStatus(issue.status),
      },
      application: applicationById.get(issue.applicationId) ?? null,
      applicant: issue.applicantId
        ? (applicantById.get(issue.applicantId) ??
          primaryApplicantByApp.get(issue.applicationId) ??
          null)
        : (primaryApplicantByApp.get(issue.applicationId) ?? null),
      document: issue.documentId ? (documentById.get(issue.documentId) ?? null) : null,
    }));
}

export async function getAgencyReports({
  limit = 75,
  offset = 0,
  query: rawQuery = null,
}: {
  limit?: number;
  offset?: number;
  query?: string | null;
} = {}) {
  const db = getDB();
  const query = normalizeSearchQuery(rawQuery);

  const reports = await db.query.clientReportTable.findMany({
    orderBy: [desc(clientReportTable.createdAt)],
    limit: 500,
  });

  const allCases = await getAgencyCaseRows({ limit: 500 });
  const cases = query
    ? allCases.filter((row) => {
        const searchableCaseText = [
          row.application.caseNumber,
          row.application.clientName,
          row.application.clientEmail,
          row.application.destinationCountry,
          row.application.visaType,
          row.primaryApplicant?.name,
          row.primaryApplicant?.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        const normalizedQuery = query.toLowerCase();
        return (
          searchableCaseText.includes(normalizedQuery) ||
          reports.some(
            (report) =>
              report.applicationId === row.application.id && matchesReportSearch(report, query),
          )
        );
      })
    : allCases;
  const casesById = new Map(cases.map((row) => [row.application.id, row]));
  const agencyReports = reports.filter((report) => casesById.has(report.applicationId));
  const latestReportByApplicationId = new Map<string, ClientReportRow>();

  for (const report of agencyReports) {
    if (!latestReportByApplicationId.has(report.applicationId)) {
      latestReportByApplicationId.set(report.applicationId, report);
    }
  }

  const latestReports = Array.from(latestReportByApplicationId.values());

  const reportRows = latestReports.slice(offset, offset + limit).map((report) => ({
    report,
    caseRow: casesById.get(report.applicationId) ?? null,
  }));

  const readyCount = latestReports.filter(
    (report) => report.status === CLIENT_REPORT_DELIVERY_STATUS.READY,
  ).length;
  const sentCount = latestReports.filter(
    (report) => report.status === CLIENT_REPORT_DELIVERY_STATUS.SENT,
  ).length;

  return {
    reports: reportRows,
    casesWithoutReports: cases.filter(
      (row) => !latestReportByApplicationId.has(row.application.id),
    ),
    stats: {
      total: latestReports.length,
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
