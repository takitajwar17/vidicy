import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireAdminPageSession,
  mockRedirect,
  mockGetCsrfToken,
  mockGetAllSupportTicketSummaries,
  mockGetSupportTicketById,
  mockGetDB,
} = vi.hoisted(() => ({
  mockRequireAdminPageSession: vi.fn(),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
  mockGetCsrfToken: vi.fn(),
  mockGetAllSupportTicketSummaries: vi.fn(),
  mockGetSupportTicketById: vi.fn(),
  mockGetDB: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("@/utils/auth-page", () => ({
  requireAdminPageSession: mockRequireAdminPageSession,
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

vi.mock("@/components/page-header", () => ({
  PageHeader: () => null,
}));

vi.mock("@/components/admin/support-inbox-client", () => ({
  SupportInboxClient: () => null,
}));

vi.mock("@/components/admin/enterprise-inquiries-client", () => ({
  EnterpriseInquiriesClient: () => null,
}));

vi.mock("@/server/support", () => ({
  getAllSupportTicketSummaries: mockGetAllSupportTicketSummaries,
  getSupportTicketById: mockGetSupportTicketById,
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("@/db/schema", () => ({
  enterpriseInquiryTable: {},
  ENTERPRISE_INQUIRY_STATUS: { NEW: "new" },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("nuqs/adapters/next/app", () => ({
  NuqsAdapter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AdminLayout from "@/app/(admin)/admin/layout";
import AdminSupportPage from "@/app/(admin)/admin/support/page";
import AdminEnterpriseInquiriesPage from "@/app/(admin)/admin/enterprise/page";

describe("admin page auth boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCsrfToken.mockResolvedValue("csrf-token");
    mockRequireAdminPageSession.mockResolvedValue({
      userId: "admin_1",
      user: {
        id: "admin_1",
        email: "admin@example.com",
        role: "admin",
      },
    });
    mockGetAllSupportTicketSummaries.mockResolvedValue({
      tickets: [
        {
          id: "ticket_1",
          subject: "Cannot upload documents",
          category: "bug",
          status: "open",
          priority: "medium",
          description: "Upload flow fails on the checklist step",
          screenshotUrls: null,
          adminNote: null,
          resolvedAt: null,
          lastViewedAt: null,
          adminLastViewedAt: null,
          lastUpdatedAt: new Date("2026-10-06T10:30:00.000Z"),
          userAgent: null,
          ipAddress: null,
          createdAt: new Date("2026-10-06T09:30:00.000Z"),
          updatedAt: new Date("2026-10-06T10:30:00.000Z"),
          userId: "user_1",
          userFirstName: "Ava",
          userLastName: "Stone",
          userEmail: "ava@example.com",
          userAvatar: null,
          lastMessageContent: "The upload button keeps spinning.",
          lastMessageIsAdminReply: false,
          lastMessageIsSystemMessage: false,
          messageSearchText: "The upload button keeps spinning.",
        },
      ],
      totalCount: 0,
    });
    mockGetSupportTicketById.mockResolvedValue({
      id: "ticket_1",
      subject: "Cannot upload documents",
      description: "Upload flow fails on the checklist step",
      category: "bug",
      status: "open",
      priority: "medium",
      screenshotUrls: null,
      adminNote: null,
      resolvedAt: null,
      lastViewedAt: null,
      adminLastViewedAt: null,
      lastUpdatedAt: new Date("2026-10-06T10:30:00.000Z"),
      userAgent: null,
      ipAddress: null,
      createdAt: new Date("2026-10-06T09:30:00.000Z"),
      updatedAt: new Date("2026-10-06T10:30:00.000Z"),
      userId: "user_1",
      userFirstName: "Ava",
      userLastName: "Stone",
      userEmail: "ava@example.com",
      userAvatar: null,
      messages: [
        {
          id: "message_1",
          ticketId: "ticket_1",
          userId: "user_1",
          content: "The upload button keeps spinning.",
          isAdminReply: false,
          isSystemMessage: false,
          screenshotUrls: null,
          createdAt: new Date("2026-10-06T09:45:00.000Z"),
          updatedAt: new Date("2026-10-06T09:45:00.000Z"),
        },
      ],
    });
    mockGetDB.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
  });

  it("uses the shared admin page helper in the admin shell", async () => {
    await expect(AdminLayout({ children: <div /> })).resolves.toBeDefined();
    expect(mockRequireAdminPageSession).toHaveBeenCalledTimes(1);
  });

  it("uses the shared admin page helper in admin support", async () => {
    const page = await AdminSupportPage({
      searchParams: Promise.resolve({ id: "ticket_1" }),
    });
    expect(mockRequireAdminPageSession).toHaveBeenCalledTimes(1);
    expect(mockGetAllSupportTicketSummaries).toHaveBeenCalledWith({ page: 1 });
    expect(mockGetSupportTicketById).toHaveBeenCalledWith({ ticketId: "ticket_1" });
    const inboxProps = (page as any).props.children.props;
    expect(inboxProps).toMatchObject({
      initialTickets: [
        expect.objectContaining({
          id: "ticket_1",
          lastMessageContent: "The upload button keeps spinning.",
        }),
      ],
      totalCount: 0,
      initialSelectedId: "ticket_1",
      initialSelectedTicket: expect.objectContaining({
        id: "ticket_1",
        messages: [
          expect.objectContaining({
            id: "message_1",
            content: "The upload button keeps spinning.",
          }),
        ],
      }),
    });
  });

  it("uses the shared admin page helper in admin enterprise", async () => {
    await expect(AdminEnterpriseInquiriesPage()).resolves.toBeDefined();
    expect(mockRequireAdminPageSession).toHaveBeenCalledTimes(1);
  });
});
