import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSessionFromCookie,
  mockGetAnnouncementsUnreadCountForUser,
  mockGetAgencyNameForSession,
} = vi.hoisted(() => ({
  mockGetSessionFromCookie: vi.fn(),
  mockGetAnnouncementsUnreadCountForUser: vi.fn(),
  mockGetAgencyNameForSession: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

vi.mock("@/server/announcements", () => ({
  getAnnouncementsUnreadCountForUser: mockGetAnnouncementsUnreadCountForUser,
}));

vi.mock("@/server/agency-team", () => ({
  getAgencyNameForSession: mockGetAgencyNameForSession,
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
    mockGetAgencyNameForSession.mockReset();
    mockGetAgencyNameForSession.mockResolvedValue(null);
  });

  it("returns null when no session exists", async () => {
    mockGetSessionFromCookie.mockResolvedValue(null);

    const result = await SiteSidebar();

    expect(result).toBeNull();
    expect(mockGetAnnouncementsUnreadCountForUser).not.toHaveBeenCalled();
    expect(mockGetAgencyNameForSession).not.toHaveBeenCalled();
  });

  it("always renders the agency AppSidebar for authenticated users", async () => {
    mockGetSessionFromCookie.mockResolvedValue(baseSession);
    mockGetAnnouncementsUnreadCountForUser.mockResolvedValue(4);
    mockGetAgencyNameForSession.mockResolvedValue("Northstar Visas");

    const result = await SiteSidebar();

    expect((result as any)?.props?.appId).toBeUndefined();
    expect((result as any)?.props?.user?.email).toBe("taki@example.com");
    expect((result as any)?.props?.announcementsUnreadCount).toBe(4);
    expect((result as any)?.props?.agencyName).toBe("Northstar Visas");
    expect(mockGetAgencyNameForSession).toHaveBeenCalledWith(baseSession);
  });
});
