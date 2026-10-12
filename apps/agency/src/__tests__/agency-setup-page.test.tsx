import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireVerifiedPageSession,
  ensureAgencyTeamMembership,
  getDisabledAgencyMembershipForSession,
  redirect,
} = vi.hoisted(() => ({
  requireVerifiedPageSession: vi.fn(),
  ensureAgencyTeamMembership: vi.fn(),
  getDisabledAgencyMembershipForSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("@/utils/auth-page", () => ({ requireVerifiedPageSession }));
vi.mock("@/server/agency-team", () => ({
  ensureAgencyTeamMembership,
  getDisabledAgencyMembershipForSession,
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/app/(auth)/agency-setup/agency-setup.client", () => ({ default: () => null }));

import AgencySetupPage from "@/app/(auth)/agency-setup/page";

describe("agency setup page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVerifiedPageSession.mockResolvedValue({ user: { id: "new-user" } });
    ensureAgencyTeamMembership.mockResolvedValue(null);
    getDisabledAgencyMembershipForSession.mockResolvedValue(null);
  });

  it("requires verified access and supplies the invite code for explicit review", async () => {
    const page = await AgencySetupPage({ searchParams: Promise.resolve({ code: "ABC-123" }) });
    expect(requireVerifiedPageSession).toHaveBeenCalledWith("/agency-setup?code=ABC-123");
    expect(page.props).toMatchObject({ initialCode: "ABC-123", redirectPath: "/dashboard" });
  });

  it("keeps the requested page through verification and setup", async () => {
    const destination = "/dashboard/case-1?tab=documents";
    const page = await AgencySetupPage({
      searchParams: Promise.resolve({ code: "ABC-123", redirect: destination }),
    });
    expect(requireVerifiedPageSession).toHaveBeenCalledWith(
      `/agency-setup?code=ABC-123&redirect=${encodeURIComponent(destination)}`,
    );
    expect(page.props.redirectPath).toBe(destination);
  });

  it("rejects an external return destination", async () => {
    const page = await AgencySetupPage({
      searchParams: Promise.resolve({ redirect: "//example.com" }),
    });
    expect(page.props.redirectPath).toBe("/dashboard");
  });

  it("prevents a setup return loop", async () => {
    const page = await AgencySetupPage({
      searchParams: Promise.resolve({ redirect: "/agency-setup?code=ABC-123" }),
    });
    expect(page.props.redirectPath).toBe("/dashboard");
  });

  it("passes a disabled membership to the recovery form", async () => {
    getDisabledAgencyMembershipForSession.mockResolvedValue({ agencyName: "Existing agency" });
    const page = await AgencySetupPage({ searchParams: Promise.resolve({}) });
    expect(getDisabledAgencyMembershipForSession).toHaveBeenCalledWith({
      user: { id: "new-user" },
    });
    expect(page.props.disabledMembership).toEqual({ agencyName: "Existing agency" });
  });

  it("sends existing staff to their requested page", async () => {
    ensureAgencyTeamMembership.mockResolvedValue({ agencyId: "agency-1" });
    await expect(
      AgencySetupPage({ searchParams: Promise.resolve({ redirect: "/settings/agency" }) }),
    ).rejects.toThrow("REDIRECT:/settings/agency");
  });
});
