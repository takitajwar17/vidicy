import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const {
  mockRequireVerifiedPageSession,
  mockRequireApplicationPagePermission,
  mockGetDB,
  mockCookies,
  mockRedirect,
  mockNotFound,
} = vi.hoisted(() => ({
  mockRequireVerifiedPageSession: vi.fn(),
  mockRequireApplicationPagePermission: vi.fn(),
  mockGetDB: vi.fn(),
  mockCookies: vi.fn(),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  mockNotFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("@/utils/auth-page", () => ({
  requireVerifiedPageSession: mockRequireVerifiedPageSession,
}));

vi.mock("@/utils/application-page-auth", () => ({
  requireApplicationPagePermission: mockRequireApplicationPagePermission,
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: () => null,
}));

import DashboardPage from "@/app/(dashboard)/dashboard/page";
import ApplicationDetailPage from "@/app/(workspace)/dashboard/[appId]/page";

function makeSelectChain<T>(
  result: T,
  options: { orderBy?: boolean; limit?: boolean } = {},
) {
  const limitChain = {
    limit: vi.fn(async () => result),
  };

  const orderByChain = {
    orderBy: vi.fn(() => (options.limit ? limitChain : Promise.resolve(result))),
  };

  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => (options.orderBy ? orderByChain : Promise.resolve(result))),
  };

  return chain;
}

describe("application overview routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireVerifiedPageSession.mockResolvedValue({
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
        emailVerified: new Date(),
      },
    });

    mockRequireApplicationPagePermission.mockResolvedValue({
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
        emailVerified: new Date(),
      },
    });

    mockCookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
  });

  it("redirects the dashboard root to the application overview instead of checklist", async () => {
    mockGetDB.mockReturnValue({
      select: vi
        .fn()
        .mockImplementationOnce(() =>
          makeSelectChain([{ id: "vapp_123" }], { orderBy: true, limit: true }),
        )
        .mockImplementationOnce(() => makeSelectChain([], {}))
        .mockImplementationOnce(() => makeSelectChain([], {})),
    });

    await expect(DashboardPage()).rejects.toMatchObject({
      message: "REDIRECT:/dashboard/vapp_123",
    });
  });

  it("renders an application overview at the application root route", async () => {
    mockGetDB.mockReturnValue({
      query: {
        visaApplicationTable: {
          findFirst: vi.fn().mockResolvedValue({
            id: "vapp_123",
            userId: "user_123",
            destinationCountry: "United States",
            visaType: "Tourist",
            embassy: "US Embassy Dhaka",
            homeCountry: "Bangladesh",
            currentCountry: "Bangladesh",
            status: "in_progress",
            paymentStatus: "paid",
            isFreeTrialApp: false,
            paidApplicantCount: 1,
            readinessScore: 82,
            riskLevel: "low",
            trashedAt: null,
          }),
        },
        applicantTable: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "appl_1",
              name: "Taki Tajwar",
              relationship: "primary",
              readinessScore: 82,
              riskLevel: "low",
            },
          ]),
        },
        checklistItemTable: {
          findMany: vi.fn().mockResolvedValue([
            { id: "c1", isRequired: true, status: "uploaded" },
            { id: "c2", isRequired: true, status: "pending" },
          ]),
        },
        documentEvaluationTable: {
          findFirst: vi.fn().mockResolvedValue({
            id: "deval_1",
            overallScore: 82,
            riskLevel: "low",
            summary: "Strong file overall.",
            createdAt: new Date("2026-10-01T08:00:00.000Z"),
          }),
        },
      },
    });

    const page = await ApplicationDetailPage({
      params: Promise.resolve({ appId: "vapp_123" }),
    });

    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("Overview");
    expect(markup).toContain("United States");
    expect(markup).toContain("United States Tourist Application");
    expect(markup).toContain("Next step");
    expect(markup).toContain("Workflow map");
    expect(markup).toContain("Upload 1 Doc");
    expect(markup).toContain("Manage Applicants");
    expect(markup).toContain("lucide-layout-list");
    expect(markup).toContain("lucide-aperture");
    expect(markup).toContain("lucide-scan-text");
    expect(markup).not.toContain("lucide-upload");
    expect(markup).not.toContain("lucide-sparkles");
    expect(markup).not.toContain("lucide-settings-2");
    expect(markup).toContain("Taki Tajwar");
    expect(markup).not.toContain("Paid");
    expect(markup).not.toContain("Full workspace unlocked");
    expect(markup).not.toContain(
      "Checklist, evaluation reruns, Atlas chat, and applicant management are all available.",
    );
  });
});
