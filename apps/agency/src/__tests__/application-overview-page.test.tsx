import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";

function renderToStaticMarkup(node: ReactNode) {
  return renderMarkup(<NuqsTestingAdapter>{node}</NuqsTestingAdapter>);
}

const {
  mockRequireApplicationPagePermission,
  mockGetAgencyDashboardData,
  mockRequireAgencyPageSession,
  mockGetAgencyCaseDetail,
  mockNotFound,
} = vi.hoisted(() => ({
  mockRequireApplicationPagePermission: vi.fn(),
  mockGetAgencyDashboardData: vi.fn(),
  mockRequireAgencyPageSession: vi.fn(),
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

vi.mock("@/utils/auth-page", () => ({ requireAgencyPageSession: mockRequireAgencyPageSession }));

vi.mock("@/server/agency-data", () => ({
  getAgencyDashboardData: mockGetAgencyDashboardData,
  getAgencyCaseDetail: mockGetAgencyCaseDetail,
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: ({ items }: { items: { href: string; label: string }[] }) => (
    <header>
      {items.map((item) => (
        <a key={item.href} href={item.href}>
          {item.label}
        </a>
      ))}
    </header>
  ),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button>Toggle sidebar</button>,
}));

vi.mock("@/components/agency/agency-case-actions", () => ({
  AgencyCaseToolbar: () => <div>Agency toolbar</div>,
  AgencyCaseReadiness: () => <section aria-label="Review readiness">Mark ready to submit</section>,
  AgencyCaseStatusSelect: () => <div>Case status select</div>,
  AgencyCaseAssignmentSelect: () => <div>Reviewer assignment</div>,
  ReviewIssueStatusSelect: () => <div>Issue status select</div>,
  AddReviewIssueForm: () => <div>Add issue form</div>,
  AddReviewIssueDialog: () => <button>Add issue</button>,
}));

vi.mock("@/components/visa/checklist-generator", () => ({
  ChecklistGenerator: () => <div>Generate checklist</div>,
}));
vi.mock("@/components/agency/checklist-research-details", () => ({
  ChecklistResearchDetails: () => <div>Checklist sources</div>,
}));
vi.mock("@/components/agency/route-review-details", () => ({
  RouteReviewDetails: () => <div>Case details for this route</div>,
}));
vi.mock("@/components/agency/checklist-item-editor", () => ({
  ChecklistItemEditor: () => <div>Checklist item controls</div>,
}));

vi.mock("@/components/visa/document-upload", () => ({
  DocumentUpload: () => <button>Upload</button>,
}));

vi.mock("@/components/visa/evaluation-trigger", () => ({
  EvaluationTrigger: () => <button>Run Review</button>,
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
  it("redirects accounts without agency access before fetching dashboard data", async () => {
    mockRequireAgencyPageSession.mockRejectedValueOnce(new Error("REDIRECT:/agency-setup"));
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/agency-setup");
    expect(mockGetAgencyDashboardData).not.toHaveBeenCalled();
  });

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
          requiredDocumentCount: 3,
          uploadedRequiredDocumentCount: 2,
          hasChecklist: true,
          reviewState: "outdated",
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
      topFlaggedIssues: [{ label: "Bank statement needs review", count: 1, high: 1, caseCount: 1 }],
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
        actionItems: [
          { title: "Bank statement", detail: "Upload a fresh statement.", severity: "high" },
        ],
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

    expect(markup).toContain("Client files, deadlines, and the next step.");
    expect(markup).toContain("Needs attention");
    expect(markup).toContain("Required files");
    expect(markup).toContain("Add missing files");
    expect(markup).toContain("Review out of date");
    expect(markup).not.toContain("Files moving this week");
    expect(markup).not.toContain("Most repeated issues");
    expect(markup).not.toContain("Ready rate");
    expect(markup).toContain("VA-2026-ABC123");
    expect(markup).not.toContain("Start Your First Application");
  });

  it("renders an agency case review desk at the application root route", async () => {
    const page = await ApplicationDetailPage({
      params: Promise.resolve({ appId: "vapp_123" }),
    });

    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Case VA-2026-ABC123");
    expect(markup).toContain("Review");
    expect(markup).toContain('aria-label="Case actions"');
    expect(markup).toContain('aria-label="Review readiness"');
    expect(markup).not.toContain("<footer");
    expect(markup).not.toContain("Readiness score");
    expect(markup).not.toContain("Case route.");
    expect(markup).toContain("Review issues");
    expect(markup).toContain('aria-label="Review issues"');
    expect(markup).toContain("Bank statement needs review");
    expect(markup).not.toContain("AI finding");
    expect(markup).not.toContain("Atlas");
    expect(markup).not.toContain("Checkout");
  });

  it("shows uploaded file rows under their checklist item, including older versions", async () => {
    const detail = await mockGetAgencyCaseDetail("vapp_123");
    mockGetAgencyCaseDetail.mockResolvedValue({
      ...detail,
      checklistItems: [
        ...detail.checklistItems,
        { ...detail.checklistItems[0], id: "c2", documentName: "Bank statement" },
        {
          ...detail.checklistItems[0],
          id: "c3",
          documentName: "Admission letter",
          isRequired: false,
        },
      ],
      documents: [
        detail.documents[0],
        {
          ...detail.documents[0],
          id: "udoc_old",
          fileName: "passport-previous.pdf",
          uploadedAt: new Date("2026-10-10T00:00:00Z"),
        },
        {
          ...detail.documents[0],
          id: "udoc_bank",
          checklistItemId: "c2",
          fileName: "bank-statement.png",
          mimeType: "image/png",
        },
      ],
    });
    const markup = renderMarkup(
      <NuqsTestingAdapter searchParams="?tab=checklist">
        {await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) })}
      </NuqsTestingAdapter>,
    );
    expect(markup).toContain('aria-label="Uploaded files for Passport"');
    const passportFiles = markup
      .split('aria-label="Uploaded files for Passport"')[1]
      ?.split("</ul>")[0];
    expect(passportFiles).toContain('aria-label="Preview document: passport.pdf"');
    expect(passportFiles).toContain('aria-label="Preview document: passport-previous.pdf"');
    expect(passportFiles).toContain("1.0 KB");
    expect(passportFiles).toContain("In use");
    expect(passportFiles).toContain("Older");
    expect(passportFiles).not.toContain("bank-statement.png");
    const bankFiles = markup
      .split('aria-label="Uploaded files for Bank statement"')[1]
      ?.split("</ul>")[0];
    expect(bankFiles).toContain('aria-label="Preview document: bank-statement.png"');
    expect(bankFiles).not.toContain("passport.pdf");
    expect(markup).not.toContain('aria-label="Uploaded files for Admission letter"');
    expect(markup.indexOf("Required files uploaded")).toBeLessThan(
      markup.indexOf('aria-label="Uploaded files for Passport"'),
    );
    expect(markup.indexOf("Checklist sources")).toBeLessThan(
      markup.indexOf("Required files uploaded"),
    );
  });

  it("keeps a single applicant name in the header without repeating it on checklist rows", async () => {
    const markup = renderMarkup(
      <NuqsTestingAdapter searchParams="?tab=checklist">
        {await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) })}
      </NuqsTestingAdapter>,
    );
    expect(markup.split(primaryApplicant.name)).toHaveLength(2);
  });

  it("keeps issue actions and the latest client report in Review", async () => {
    const markup = renderToStaticMarkup(
      await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) }),
    );
    expect(markup).toContain(">Add issue<");
    expect(markup).toContain('href="/dashboard/reports/crep_1"');
    expect(markup).toContain("Open client report");
    expect(markup).not.toContain("Record case details and check the sources");
    expect(markup).not.toContain(">Notes<");
  });

  it.each(["details", "notes", "activity"])(
    "shows case facts in %s without issue actions or evidence",
    async (tab) => {
      const markup = renderMarkup(
        <NuqsTestingAdapter searchParams={`?tab=${tab}`}>
          {await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) })}
        </NuqsTestingAdapter>,
      );
      expect(markup).toContain("Case details for this route");
      expect(markup).toContain("Route requirements");
      expect(markup).toContain("Previous approvals:");
      expect(markup).toContain("Case activity");
      expect(markup).toContain('data-state="active"');
      expect(markup).not.toContain(">Activity<");
      expect(markup).not.toContain(">Add issue<");
      expect(markup).not.toContain("Open client report");
      expect(markup).not.toContain("Supporting evidence");
      expect(markup.indexOf("Case details for this route")).toBeLessThan(
        markup.indexOf("Route requirements"),
      );
    },
  );

  it("keeps all applicant records and activity beside the form, with source guidance in a disclosure", async () => {
    const detail = await mockGetAgencyCaseDetail("vapp_123");
    mockGetAgencyCaseDetail.mockResolvedValue({
      ...detail,
      applicants: [
        primaryApplicant,
        {
          ...primaryApplicant,
          id: "appl_child",
          name: "Case child",
          relationship: "child",
          passportNumber: "TEST-CHILD-001",
        },
      ],
    });
    const markup = renderMarkup(
      <NuqsTestingAdapter searchParams="?tab=details">
        {await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) })}
      </NuqsTestingAdapter>,
    );
    const sidebar = markup.split('<aside aria-label="Case information"')[1]?.split("</aside>")[0];
    expect(sidebar).toContain("Case child");
    expect(sidebar).toContain("TEST-CHILD-001");
    expect(sidebar).toContain("Reviewer");
    expect(sidebar).toContain("Case activity");
    expect(sidebar).not.toContain("Nationality:");
    expect(markup).toContain('<details aria-label="Route guidance and official sources"');
    expect(markup.indexOf("Case details for this route")).toBeLessThan(markup.indexOf("<aside"));
  });

  it("shows recorded case milestones after the case details", async () => {
    const markup = renderMarkup(
      <NuqsTestingAdapter searchParams="?tab=details">
        {await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) })}
      </NuqsTestingAdapter>,
    );
    expect(markup).toContain("Case created");
    expect(markup).toContain("Client submitted files");
    expect(markup.indexOf("Route requirements")).toBeLessThan(markup.indexOf("Case activity"));
    expect(markup).not.toContain("Review completed");
    expect(markup).not.toContain("Tracked issues");
    expect(markup).not.toContain("Issue status select");
    expect(markup).not.toContain(">Add issue<");
    expect(markup).not.toContain("Supporting evidence");
  });

  it("shows the most recent recorded milestone first", async () => {
    const detail = await mockGetAgencyCaseDetail("vapp_123");
    mockGetAgencyCaseDetail.mockResolvedValue({
      ...detail,
      application: {
        ...detail.application,
        reviewCompletedAt: new Date("2026-10-18T00:00:00Z"),
      },
    });
    const markup = renderMarkup(
      <NuqsTestingAdapter searchParams="?tab=activity">
        {await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) })}
      </NuqsTestingAdapter>,
    );
    expect(markup.indexOf("Review completed")).toBeLessThan(markup.indexOf("Case created"));
  });

  it("shows checklist generation as the first step for an empty case", async () => {
    const detail = await mockGetAgencyCaseDetail("vapp_123");
    mockGetAgencyCaseDetail.mockResolvedValue({
      ...detail,
      checklistItems: [],
      documents: [],
      latestEvaluation: null,
      issues: [],
      latestReport: null,
    });
    const markup = renderToStaticMarkup(
      await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) }),
    );
    expect(markup).toContain("Generate checklist");
    expect(markup).not.toContain("Upload More");
    expect(markup).not.toContain('type="file"');
    expect(markup).not.toContain("Checklist sources");
    expect(markup).not.toContain("Required files uploaded");
    expect(markup).not.toContain("Record case details and check the sources");
    const detailsMarkup = renderMarkup(
      <NuqsTestingAdapter searchParams="?tab=details">
        {await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) })}
      </NuqsTestingAdapter>,
    );
    expect(detailsMarkup).toContain("Previous approvals:");
    expect(detailsMarkup).toContain("Route requirements");
    expect(detailsMarkup).toContain("Case details for this route");
  });

  it("shows file coverage without a zero required-document total for supporting items", async () => {
    const detail = await mockGetAgencyCaseDetail("vapp_123");
    mockGetAgencyCaseDetail.mockResolvedValue({
      ...detail,
      checklistItems: detail.checklistItems.map((item: { isRequired: boolean }) => ({
        ...item,
        isRequired: false,
      })),
      documents: [],
      latestEvaluation: null,
      issues: [],
    });
    const markup = renderToStaticMarkup(
      await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) }),
    );
    expect(markup).toContain("Checklist files");
    expect(markup).toContain("0/1");
    expect(markup).toContain("checklist items have files.");
    expect(markup).not.toContain("0 / 0");
    expect(markup).not.toContain("required files missing");
  });

  it("shows saved issues with status controls instead of a separate AI flag list", async () => {
    const detail = await mockGetAgencyCaseDetail("vapp_123");
    mockGetAgencyCaseDetail.mockResolvedValue({
      ...detail,
      latestEvaluation: {
        ...detail.latestEvaluation,
        redFlags: ["Untracked flag must not be shown"],
      },
    });
    const markup = renderToStaticMarkup(
      await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) }),
    );
    expect(markup).toContain("Bank statement needs review");
    expect(markup).toContain("Issue status select");
    expect(markup).not.toContain("Untracked flag must not be shown");
    expect(markup).toContain("Supporting evidence");
  });

  it("hides the score and marks findings from an old review", async () => {
    const detail = await mockGetAgencyCaseDetail("vapp_123");
    mockGetAgencyCaseDetail.mockResolvedValue({
      ...detail,
      latestEvaluation: null,
      isReviewStale: true,
      latestReport: null,
    });
    const markup = renderToStaticMarkup(
      await ApplicationDetailPage({ params: Promise.resolve({ appId: "vapp_123" }) }),
    );
    expect(markup).toContain("incomplete or no longer matches the documents");
    expect(markup).toContain("previous review");
    expect(markup).not.toContain("Required files uploaded");
    expect(markup).not.toContain("82 / 100");
  });
});
