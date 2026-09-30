import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionFromCookie, mockGetAnnouncementsUnreadCountForUser } = vi.hoisted(() => ({
  mockGetSessionFromCookie: vi.fn(),
  mockGetAnnouncementsUnreadCountForUser: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

vi.mock("@/server/announcements", () => ({
  getAnnouncementsUnreadCountForUser: mockGetAnnouncementsUnreadCountForUser,
}));

vi.mock("@/components/app-sidebar", () => {
  function AppSidebar() {
    return null;
  }
  return { AppSidebar };
});

import { SiteSidebar } from "@/components/site-sidebar";

const baseSession = {
  user: {
    id: "usr_test_123",
    firstName: "Taki",
    lastName: "Khan",
    email: "taki@example.com",
    avatar: "",
    role: "user",
    emailVerified: new Date(),
  },
};

describe("SiteSidebar", () => {
  beforeEach(() => {
    mockGetSessionFromCookie.mockReset();
    mockGetAnnouncementsUnreadCountForUser.mockReset();
    mockGetAnnouncementsUnreadCountForUser.mockResolvedValue(0);
  });

  it("returns null when no session exists", async () => {
    mockGetSessionFromCookie.mockResolvedValue(null);

    const result = await SiteSidebar();

    expect(result).toBeNull();
    expect(mockGetAnnouncementsUnreadCountForUser).not.toHaveBeenCalled();
  });

  it("always renders the agency AppSidebar for authenticated users", async () => {
    mockGetSessionFromCookie.mockResolvedValue(baseSession);
    mockGetAnnouncementsUnreadCountForUser.mockResolvedValue(4);

    const result = await SiteSidebar();

    expect((result as any)?.props?.appId).toBeUndefined();
    expect((result as any)?.props?.user?.email).toBe("taki@example.com");
    expect((result as any)?.props?.announcementsUnreadCount).toBe(4);
  });
});
