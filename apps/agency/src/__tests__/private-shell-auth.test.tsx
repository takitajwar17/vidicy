import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSessionFromCookie,
  mockRequirePageSession,
  mockRequireVerifiedPageSession,
  mockGetCsrfToken,
  mockGetUserSupportTicketSummaries,
  mockGetSupportTicketById,
  mockMarkTicketAsViewed,
  mockEnsureAgencyTeamMembership,
  mockRedirect,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetSessionFromCookie: vi.fn(() => {
    throw new Error("RAW_SESSION_CHECK");
  }),
  mockRequirePageSession: vi.fn(),
  mockRequireVerifiedPageSession: vi.fn(),
  mockGetCsrfToken: vi.fn(),
  mockGetUserSupportTicketSummaries: vi.fn(),
  mockGetSupportTicketById: vi.fn(),
  mockMarkTicketAsViewed: vi.fn(),
  mockEnsureAgencyTeamMembership: vi.fn(),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  mockNotFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

vi.mock("@/utils/auth-page", () => ({
  requirePageSession: mockRequirePageSession,
  requireVerifiedPageSession: mockRequireVerifiedPageSession,
}));

vi.mock("@/infra/csrf", () => ({
  getCsrfToken: mockGetCsrfToken,
}));

vi.mock("@/components/csrf-provider", () => ({
  CsrfProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/site-sidebar", () => ({
  SiteSidebar: () => null,
}));

vi.mock("@/server/agency-team", () => ({
  ensureAgencyTeamMembership: mockEnsureAgencyTeamMembership,
}));

vi.mock("@/server/support", () => ({
  getUserSupportTicketSummaries: mockGetUserSupportTicketSummaries,
  getSupportTicketById: mockGetSupportTicketById,
  markTicketAsViewed: mockMarkTicketAsViewed,
}));

vi.mock("@/components/support/user-inbox-client", () => ({
  UserInboxClient: () => null,
}));

vi.mock("@/components/page-header", () => ({
  PageHeader: () => null,
}));

vi.mock("@/components/support/user-ticket-detail", () => ({
  UserTicketDetail: () => null,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

import DashboardLayout from "@/app/(dashboard)/layout";
import SupportLayout from "@/app/(support)/dashboard/layout";
import SupportPage from "@/app/(support)/dashboard/support/page";
import TicketPage from "@/app/(support)/dashboard/support/[ticketId]/page";
import WorkspaceLayout from "@/app/(workspace)/dashboard/[appId]/layout";

describe("private shell auth boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCsrfToken.mockResolvedValue("csrf-token");
    mockEnsureAgencyTeamMembership.mockResolvedValue({ role: "admin", isAdmin: true });
    mockRequirePageSession.mockResolvedValue({
      userId: "user_1",
      user: {
        id: "user_1",
        email: "member@example.com",
        emailVerified: null,
      },
    });
    mockRequireVerifiedPageSession.mockResolvedValue({
      userId: "user_2",
      user: {
        id: "user_2",
        email: "verified@example.com",
        emailVerified: new Date(),
      },
    });
    mockGetUserSupportTicketSummaries.mockResolvedValue({
      tickets: [
        {
          id: "ticket_1",
          subject: "Test ticket",
          description: "Need help with my application",
          category: "question",
          status: "open",
          priority: "medium",
          screenshotUrls: null,
          adminNote: null,
          resolvedAt: null,
          lastViewedAt: null,
          adminLastViewedAt: null,
          lastUpdatedAt: new Date("2026-10-06T10:00:00.000Z"),
          userAgent: null,
          ipAddress: null,
          createdAt: new Date("2026-10-06T09:00:00.000Z"),
          updatedAt: new Date("2026-10-06T10:00:00.000Z"),
          userId: "user_1",
          lastMessageContent: "Latest reply from support",
          lastMessageIsAdminReply: true,
          lastMessageIsSystemMessage: false,
          messageSearchText: "Need help with my application\nLatest reply from support",
        },
      ],
      totalCount: 0,
    });
    mockGetSupportTicketById.mockResolvedValue({
      id: "ticket_1",
      subject: "Test ticket",
    });
    mockMarkTicketAsViewed.mockResolvedValue(undefined);
  });

  it("uses the shared verified-page helper in the dashboard shell", async () => {
    await expect(DashboardLayout({ children: <div /> })).resolves.toBeDefined();
    expect(mockRequireVerifiedPageSession).toHaveBeenCalledTimes(1);
    expect(mockEnsureAgencyTeamMembership).toHaveBeenCalledTimes(1);
  });

  it("uses the shared verified-page helper in the workspace shell", async () => {
    await expect(
      WorkspaceLayout({
        children: <div />,
        params: Promise.resolve({ appId: "vapp_123" }),
      }),
    ).resolves.toBeDefined();
    expect(mockRequireVerifiedPageSession).toHaveBeenCalledWith("/dashboard/vapp_123");
    expect(mockEnsureAgencyTeamMembership).toHaveBeenCalledTimes(1);
  });

  it("redirects the dashboard shell when the verified user is not agency staff", async () => {
    mockEnsureAgencyTeamMembership.mockResolvedValueOnce(null);

    await expect(DashboardLayout({ children: <div /> })).rejects.toThrow("NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("redirects the workspace shell when the verified user is not agency staff", async () => {
    mockEnsureAgencyTeamMembership.mockResolvedValueOnce(null);

    await expect(
      WorkspaceLayout({
        children: <div />,
        params: Promise.resolve({ appId: "vapp_123" }),
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(mockNotFound).toHaveBeenCalled();
  });

  it("uses the shared session-only helper in the support shell", async () => {
    await expect(SupportLayout({ children: <div /> })).resolves.toBeDefined();
    expect(mockRequirePageSession).toHaveBeenCalledTimes(1);
  });

  it("uses the shared session-only helper in the support inbox page", async () => {
    const page = await SupportPage();
    expect(mockRequirePageSession).toHaveBeenCalledTimes(1);
    expect(mockGetUserSupportTicketSummaries).toHaveBeenCalledTimes(1);
    const inboxProps = (page as any).props.children.props;
    expect(inboxProps).toMatchObject({
      initialTickets: [
        expect.objectContaining({
          id: "ticket_1",
          lastMessageContent: "Latest reply from support",
        }),
      ],
      totalCount: 0,
    });
    expect(inboxProps.initialTickets[0]?.messages).toBeUndefined();
    expect(mockGetSessionFromCookie).not.toHaveBeenCalled();
  });

  it("uses the shared session-only helper in the support ticket page", async () => {
    await expect(
      TicketPage({ params: Promise.resolve({ ticketId: "ticket_1" }) }),
    ).resolves.toBeDefined();
    expect(mockRequirePageSession).toHaveBeenCalledTimes(1);
    expect(mockGetSessionFromCookie).not.toHaveBeenCalled();
  });
});
