import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(),
  admin: vi.fn(),
  create: vi.fn(),
  resend: vi.fn(),
  revoke: vi.fn(),
  limit: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("zsa", () => ({
  ZSAError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  createServerAction: () => {
    const chain = {
      input: () => chain,
      handler: (handler: (args: { input: unknown }) => unknown) => (input: unknown) =>
        handler({ input }),
    };
    return chain;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/infra/csrf", () => ({ validateCsrfToken: mocks.csrf }));
vi.mock("@/server/agency-team", () => ({ requireAgencyAdmin: mocks.admin }));
vi.mock("@/infra/with-rate-limit", () => ({
  withRateLimit: mocks.limit,
  RATE_LIMITS: { TEAM_INVITE: {}, EMAIL: {}, SETTINGS: {} },
}));
vi.mock("@/server/agency-invitations", () => ({
  createAgencyInvitation: mocks.create,
  resendAgencyInvitation: mocks.resend,
  revokeAgencyInvitation: mocks.revoke,
}));
import {
  createAgencyInvitationAction,
  resendAgencyInvitationAction,
  revokeAgencyInvitationAction,
} from "@/actions/agency-invitation.action";

const operations = [
  {
    name: "create",
    run: () => createAgencyInvitationAction({ email: "member@example.test", csrfToken: "token" }),
    handler: mocks.create,
  },
  {
    name: "resend",
    run: () => resendAgencyInvitationAction({ invitationId: "invitation", csrfToken: "token" }),
    handler: mocks.resend,
  },
  {
    name: "revoke",
    run: () => revokeAgencyInvitationAction({ invitationId: "invitation", csrfToken: "token" }),
    handler: mocks.revoke,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.csrf.mockResolvedValue(true);
  mocks.admin.mockResolvedValue({ session: { userId: "admin-user" } });
  mocks.limit.mockImplementation(async (operation: () => Promise<unknown>) => operation());
});

describe.each(operations)("$name agency invitation action", ({ name, run, handler }) => {
  it("rejects an invalid security token before access or delivery work", async () => {
    mocks.csrf.mockResolvedValue(false);
    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("requires agency admin access before rate-limited delivery work", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("Admin access required"));
    await expect(run()).rejects.toThrow("Admin access required");
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("limits requests by the authenticated user and refreshes the agency settings", async () => {
    await run();
    expect(mocks.limit).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        identifier: `agency-invitation-${name}`,
        userIdentifier: "admin-user",
      }),
    );
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).toHaveBeenCalledWith("/settings/agency");
  });
});
