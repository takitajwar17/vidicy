import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { csrf } = vi.hoisted(() => ({ csrf: { token: "csrf-token" as string | undefined } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("zsa-react", () => ({ useServerAction: () => ({ execute: vi.fn(), isPending: false }) }));
vi.mock("@/components/csrf-provider", () => ({ useCsrfToken: () => csrf.token }));
vi.mock("@/actions/agency-membership.action", () => ({
  deleteEmptyAgencyAction: vi.fn(),
  leaveAgencyAction: vi.fn(),
  transferAgencyOwnershipAction: vi.fn(),
  updateAgencySettingsAction: vi.fn(),
}));
vi.mock("@/actions/agency-invitation.action", () => ({
  createAgencyInvitationAction: vi.fn(),
  resendAgencyInvitationAction: vi.fn(),
  revokeAgencyInvitationAction: vi.fn(),
}));

import AgencySettingsClient from "@/app/(dashboard)/dashboard/agency/agency-settings.client";

const props = {
  agency: { id: "agency-1", name: "Test agency", ownerUserId: "owner" },
  members: [
    { id: "member-1", userId: "owner", email: "owner@example.com", name: "Owner", role: "admin" },
    {
      id: "member-2",
      userId: "member",
      email: "member@example.com",
      name: "Member",
      role: "member",
    },
  ],
  invitations: [
    {
      id: "invitation-1",
      recipientEmail: "new@example.com",
      expiresAt: "2099-01-01T00:00:00Z",
      redeemedAt: null,
      revokedAt: null,
      deliveryStatus: "sent",
      lastDeliveryError: null,
      sentAt: "2026-10-21T00:00:00Z",
      retryAvailableAt: null,
    },
  ],
  isAdmin: false,
  isOwner: false,
  userId: "member",
  canDeleteAgency: false,
};

describe("agency settings access and invitation controls", () => {
  beforeEach(() => {
    csrf.token = "csrf-token";
  });

  it("gives members read-only agency details and a leave control", () => {
    const html = renderToStaticMarkup(<AgencySettingsClient {...props} />);
    expect(html).toContain("Test agency");
    expect(html).toContain("Leave agency");
    expect(html).not.toContain("Save agency name");
    expect(html).not.toContain("Create invitation");
    expect(html).not.toContain("Transfer ownership");
  });

  it("gives admins editable details and states the invite limits", () => {
    const html = renderToStaticMarkup(<AgencySettingsClient {...props} isAdmin />);
    expect(html).toContain("Save agency name");
    expect(html).toContain("Create invitation");
    expect(html).toContain("Invite codes expire after 7 days and can be used once.");
    expect(html).toContain("Resend email");
    expect(html).toContain("Cancel invitation");
  });

  it("shows transfer controls to owners before they can leave", () => {
    const html = renderToStaticMarkup(
      <AgencySettingsClient {...props} isAdmin isOwner userId="owner" />,
    );
    expect(html).toContain("Transfer ownership");
    expect(html).toContain("You must transfer ownership before you can leave");
    expect(html).not.toContain(">Leave agency<");
  });

  it("disables resending during the server cooldown", () => {
    const invitations = [{ ...props.invitations[0], retryAvailableAt: "2098-12-31T00:00:00Z" }];
    const html = renderToStaticMarkup(
      <AgencySettingsClient {...props} isAdmin invitations={invitations} />,
    );
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Wait two minutes before resending<\/button>/,
    );
    expect(html).toContain("Cancel invitation");
  });

  it("removes resend and cancel controls from used invitations", () => {
    const invitations = [{ ...props.invitations[0], redeemedAt: "2026-10-21T00:00:00Z" }];
    const html = renderToStaticMarkup(
      <AgencySettingsClient {...props} isAdmin invitations={invitations} />,
    );
    expect(html).toContain("Used");
    expect(html).not.toContain("Resend email");
    expect(html).not.toContain("Cancel invitation");
  });

  it("does not enable mutations before a security token is available", () => {
    csrf.token = undefined;
    const html = renderToStaticMarkup(<AgencySettingsClient {...props} isAdmin />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save agency name<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create invitation<\/button>/);
  });
});
