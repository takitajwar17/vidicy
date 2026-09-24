import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSessionFromCookie, mockCookies, mockFindFirst } = vi.hoisted(() => ({
  mockGetSessionFromCookie: vi.fn(),
  mockCookies: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

vi.mock("next/headers", () => ({
  cookies: mockCookies,
}));

vi.mock("@/db", () => ({
  getDB: () => ({
    query: {
      visaApplicationTable: {
        findFirst: mockFindFirst,
      },
    },
  }),
}));

vi.mock("@/components/app-sidebar", () => {
  function AppSidebar() {
    return null;
  }
  return { AppSidebar };
});

vi.mock("@/components/workspace-sidebar", () => {
  function WorkspaceSidebar() {
    return null;
  }
  return { WorkspaceSidebar };
});

import { SiteSidebar } from "@/components/site-sidebar";

const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

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
    mockCookies.mockReset();
    mockFindFirst.mockReset();
    warnSpy.mockClear();
  });

  afterAll(() => {
    warnSpy.mockRestore();
  });

  it("returns null when no session exists", async () => {
    mockGetSessionFromCookie.mockResolvedValue(null);
    mockCookies.mockResolvedValue({ get: vi.fn() });

    const result = await SiteSidebar();

    expect(result).toBeNull();
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it("renders AppSidebar for unverified users without validating lastActiveApp", async () => {
    mockGetSessionFromCookie.mockResolvedValue({
      ...baseSession,
      user: {
        ...baseSession.user,
        emailVerified: null,
      },
    });
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "vapp_abc123" }),
    });

    const result = await SiteSidebar();

    expect(mockFindFirst).not.toHaveBeenCalled();
    expect((result as any)?.props?.appId).toBeUndefined();
    expect((result as any)?.props?.user?.email).toBe("taki@example.com");
  });

  it("renders WorkspaceSidebar when lastActiveApp belongs to the user", async () => {
    const cookieGet = vi.fn().mockReturnValue({ value: "vapp_abc123" });
    mockGetSessionFromCookie.mockResolvedValue(baseSession);
    mockCookies.mockResolvedValue({ get: cookieGet });
    mockFindFirst.mockResolvedValue({ id: "vapp_abc123" });

    const result = await SiteSidebar();

    expect(cookieGet).toHaveBeenCalledWith("lastActiveApp");
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect((result as any)?.props?.appId).toBe("vapp_abc123");
  });

  it("skips DB lookup for malformed lastActiveApp cookie and renders AppSidebar", async () => {
    const cookieGet = vi.fn().mockReturnValue({ value: "../../bad" });
    mockGetSessionFromCookie.mockResolvedValue(baseSession);
    mockCookies.mockResolvedValue({ get: cookieGet });

    const result = await SiteSidebar();

    expect(mockFindFirst).not.toHaveBeenCalled();
    expect((result as any)?.props?.appId).toBeUndefined();
    expect((result as any)?.props?.user?.email).toBe("taki@example.com");
  });

  it("retries once on transient D1 timeout and still renders WorkspaceSidebar", async () => {
    mockGetSessionFromCookie.mockResolvedValue(baseSession);
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "vapp_abc123" }),
    });
    mockFindFirst
      .mockRejectedValueOnce(
        new Error("D1 DB storage operation exceeded timeout which caused object to be reset."),
      )
      .mockResolvedValueOnce({ id: "vapp_abc123" });

    const result = await SiteSidebar();

    expect(mockFindFirst).toHaveBeenCalledTimes(2);
    expect(warnSpy).not.toHaveBeenCalled();
    expect((result as any)?.props?.appId).toBe("vapp_abc123");
  });

  it("falls back to AppSidebar when transient D1 timeout persists", async () => {
    mockGetSessionFromCookie.mockResolvedValue(baseSession);
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "vapp_abc123" }),
    });
    mockFindFirst.mockRejectedValue(
      new Error("D1_ERROR: D1 DB storage operation exceeded timeout which caused object to be reset."),
    );

    const result = await SiteSidebar();

    expect(mockFindFirst).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect((result as any)?.props?.appId).toBeUndefined();
  });

  it("does not retry non-transient DB errors", async () => {
    mockGetSessionFromCookie.mockResolvedValue(baseSession);
    mockCookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "vapp_abc123" }),
    });
    mockFindFirst.mockRejectedValue(new Error("Unexpected DB failure"));

    const result = await SiteSidebar();

    expect(mockFindFirst).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect((result as any)?.props?.appId).toBeUndefined();
  });
});
