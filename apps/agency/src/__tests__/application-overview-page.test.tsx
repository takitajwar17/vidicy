import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const {
  mockRequireApplicationPagePermission,
  mockGetAgencyDashboardData,
  mockGetAgencyCaseDetail,
  mockNotFound,
} = vi.hoisted(() => ({
  mockRequireApplicationPagePermission: vi.fn(),
  mockGetAgencyDashboardData: vi.fn(),
  mockGetAgencyCaseDetail: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}));

vi.mock("@/utils/application-page-auth", () => ({
  requireApplicationPagePermission: mockRequireApplicationPagePermission,
}));

vi.mock("@/server/agency-data", () => ({
  getAgencyDashboardData: mockGetAgencyDashboardData,
  getAgencyCaseDetail: mockGetAgencyCaseDetail,
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: () => null,
}));

vi.mock("@/components/agency/agency-case-actions", () => ({
  AgencyCaseToolbar: () => <div>Agency toolbar</div>,
  AgencyCaseStatusSelect: () => <div>Case status select</div>,
  ReviewIssueStatusSelect: () => <div>Issue status select</div>,
  AddReviewIssueForm: () => <div>Add issue form</div>,
}));

vi.mock("@/components/visa/checklist-generator", () => ({
  ChecklistGenerator: () => <div>Generate checklist</div>,
}));

vi.mock("@/components/visa/document-upload", () => ({
  DocumentUpload: () => <button>Upload</button>,
}));

vi.mock("@/components/visa/evaluation-trigger", () => ({
  EvaluationTrigger: () => <button>Run Review</button>,
}));

vi.mock("@/components/visa/document-preview-drawer", () => ({
  DocumentPreviewDrawer: ({ children, fileName }: { children?: React.ReactNode; fileName: string }) => (
    <div>{fileName}{children}</div>
  ),
}));

vi.mock("@/components/visa/delete-document-button", () => ({
  DeleteDocumentButton: () => <button>Delete</button>,
}));

vi.mock("@/components/visa/set-document-active-button", () => ({
  SetDocumentActiveButton: () => <button>Set active</button>,
}));

import DashboardPage from "@/app/(dashboard)/dashboard/page";
import ApplicationDetailPage from "@/app/(workspace)/dashboard/[appId]/page";

const application = {
  id: "vapp_123",
  userId: "user_123",
  caseNumber: "VA-2026-ABC123",
  clientId: "acl_1",
  clientName: "Global Visa Co.",
  clientEmail: "client@example.com",
  clientPhone: null,
  destinationCountry: "United States",
  visaType: "B1/B2 Visitor",
  embassy: "US Embassy Dhaka",
  homeCountry: "Bangladesh",
  currentCountry: "Bangladesh",
  status: "in_progress",
  agencyStatus: "in_review",
  priority: "high",
  assignedReviewerId: "user_reviewer",
  intakeSource: "manual",
  submittedAt: new Date("2026-10-16T00:00:00.000Z"),
  dueAt: new Date("2026-10-18T00:00:00.000Z"),
  reviewCompletedAt: null,
  finalSubmissionAt: null,
  clientReportStatus: "ready",
  readinessScore: 82,
  riskLevel: "low",
  trashedAt: null,
  name: "Rahul Mehta - United States B1/B2 Visitor",
  settings: "{}",
  checklistSource: null,
  checklistGeneratedAt: null,
  checklistCitations: null,
  actualOutcome: null,
  outcomeDate: null,
  outcomeNotes: null,
  createdAt: new Date("2026-10-16T00:00:00.000Z"),
  updatedAt: new Date("2026-10-16T00:00:00.000Z"),
  updateCounter: 0,
};

const primaryApplicant = {
  id: "appl_1",
  applicationId: "vapp_123",
  name: "Rahul Mehta",
  relationship: "primary",
  role: "owner",
  dateOfBirth: null,
  passportNumber: null,
  nationality: "Bangladesh",
  readinessScore: 82,
  riskLevel: "low",
  email: "rahul@example.com",
  userId: null,
  approvedBefore: null,
  approvedVisaType: null,
  approvedYear: null,
  rejectedBefore: null,
  rejectedVisaType: null,
  rejectedYear: null,
  rejectedReason: null,
  createdAt: new Date("2026-10-16T00:00:00.000Z"),
  updatedAt: new Date("2026-10-16T00:00:00.000Z"),
  updateCounter: 0,
};

const reviewer = {
  id: "user_reviewer",
  firstName: "Maya",
  lastName: "Singh",
  email: "maya@example.com",
  avatar: null,
};

describe("agency application pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireApplicationPagePermission.mockResolvedValue({
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
        emailVerified: new Date(),
      },
    });

    mockGetAgencyDashboardData.mockResolvedValue({
      cases: [
        {
          application,
          primaryApplicant,
          reviewer,
          latestEvaluation: { overallScore: 82, riskLevel: "low" },
          documentCount: 2,
          openIssueCount: 1,
          highIssueCount: 1,
        },
      ],
      recentCases: [
        {
          application,
          primaryApplicant,
          reviewer,
          latestEvaluation: { overallScore: 82, riskLevel: "low" },
          documentCount: 2,
          openIssueCount: 1,
          highIssueCount: 1,
        },
      ],
      staff: [],
      workload: [],
      topFlaggedIssues: [{ label: "High-priority file issues", count: 1, high: 1 }],
      stats: {
        totalApplications: 1,
        completed: 0,
        readyToSubmit: 0,
        inReview: 1,
        needsClient: 0,
        flagged: 1,
        openIssueCases: 1,
        approvalReadyRate: 0,
        readyRate: 0,
        scoredCases: 1,
      },
    });

    mockGetAgencyCaseDetail.mockResolvedValue({
      application,
      applicants: [primaryApplicant],
      primaryApplicant,
      checklistItems: [
        {
          id: "c1",
          applicationId: "vapp_123",
          applicantId: "appl_1",
          documentName: "Passport",
          description: "Readable passport scan",
          commonMistakes: null,
          isRequired: true,
          status: "uploaded",
          sortOrder: 1,
          createdAt: new Date("2026-10-16T00:00:00.000Z"),
          updatedAt: new Date("2026-10-16T00:00:00.000Z"),
          updateCounter: 0,
        },
      ],
      documents: [
        {
          id: "udoc_1",
          applicationId: "vapp_123",
          applicantId: "appl_1",
          checklistItemId: "c1",
          fileName: "passport.pdf",
          fileKey: "passport.pdf",
          fileSize: 1024,
          mimeType: "application/pdf",
          uploadedAt: new Date("2026-10-16T00:00:00.000Z"),
          chunkCount: 1,
          extractionStatus: "completed",
          indexingStatus: "completed",
          extractionMethod: null,
          extractedAt: null,
          indexingAttemptedAt: null,
          pageCount: 1,
          imageDescription: null,
          extractionPayload: null,
          textContent: null,
        },
      ],
      latestEvaluation: {
        id: "deval_1",
        applicationId: "vapp_123",
        applicantId: "appl_1",
        overallScore: 82,
        riskLevel: "low",
        summary: "Strong file overall.",
        redFlags: ["Bank statement needs review"],
        strengths: ["Clear passport scan"],
        recommendations: ["Ask for updated bank statement"],
        itemFeedback: {},
        docSnapshots: {},
        scoreConfidence: null,
        ensembleDivergence: null,
        atlasPreview: null,
        createdAt: new Date("2026-10-16T00:00:00.000Z"),
      },
      issues: [
        {
          id: "rissue_1",
          applicationId: "vapp_123",
          applicantId: "appl_1",
          checklistItemId: "c1",
          documentId: "udoc_1",
          title: "Bank statement needs review",
          description: "Statement is older than the agency threshold.",
          recommendation: "Ask client for a fresh statement.",
          category: "document_quality",
          severity: "high",
          status: "open",
          source: "ai",
          confidence: 90,
          clientVisible: true,
          assignedToId: "user_reviewer",
          createdById: "user_reviewer",
          resolvedAt: null,
          createdAt: new Date("2026-10-16T00:00:00.000Z"),
          updatedAt: new Date("2026-10-16T00:00:00.000Z"),
          updateCounter: 0,
        },
      ],
      latestReport: {
        id: "crep_1",
        applicationId: "vapp_123",
        status: "ready",
        summary: "Client needs one updated statement.",
        actionItems: [{ title: "Bank statement", detail: "Upload a fresh statement.", severity: "high" }],
        createdById: "user_reviewer",
        sentAt: null,
        createdAt: new Date("2026-10-16T00:00:00.000Z"),
        updatedAt: new Date("2026-10-16T00:00:00.000Z"),
        updateCounter: 0,
      },
      staff: [
        {
          id: "atm_1",
          userId: "user_reviewer",
          role: "member",
          status: "active",
          joinedAt: new Date("2026-10-16T00:00:00.000Z"),
          invitedAt: null,
          user: reviewer,
        },
      ],
    });
  });

  it("renders the dashboard root as an agency operations dashboard", async () => {
    const markup = renderToStaticMarkup(await DashboardPage());

    expect(markup).toContain("Today&#x27;s queue: files in review, clients waiting on fixes, and reviewers carrying the work.");
    expect(markup).toContain("Files moving this week");
    expect(markup).toContain("Recent applications");
    expect(markup).toContain("VA-2026-ABC123");
    expect(markup).not.toContain("Start Your First Application");
  });

  it("renders an agency case review desk at the application root route", async () => {
    const page = await ApplicationDetailPage({
      params: Promise.resolve({ appId: "vapp_123" }),
    });

    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Case #VA-2026-ABC123");
    expect(markup).toContain("Review");
    expect(markup).toContain("Case readiness score");
    expect(markup).toContain("Client fix list");
    expect(markup).toContain("Review issues");
    expect(markup).toContain("Bank statement needs review");
    expect(markup).not.toContain("Atlas");
    expect(markup).not.toContain("Checkout");
  });
});
