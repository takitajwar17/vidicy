import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  csrf: vi.fn(),
  save: vi.fn(),
  transfer: vi.fn(),
  leave: vi.fn(),
  remove: vi.fn(),
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
vi.mock("@/server/agency-membership", () => ({
  createAgency: vi.fn(),
  previewAgencyInvite: vi.fn(),
  joinAgency: vi.fn(),
  updateAgencySettings: mocks.save,
  transferAgencyOwnership: mocks.transfer,
  leaveAgency: mocks.leave,
  deleteEmptyAgency: mocks.remove,
}));
import {
  updateAgencySettingsAction,
  transferAgencyOwnershipAction,
  leaveAgencyAction,
  deleteEmptyAgencyAction,
} from "@/actions/agency-membership.action";

const operations = [
  {
    name: "save",
    run: () => updateAgencySettingsAction({ name: "New name", csrfToken: "token" }),
    handler: mocks.save,
  },
  {
    name: "transfer",
    run: () => transferAgencyOwnershipAction({ memberId: "member", csrfToken: "token" }),
    handler: mocks.transfer,
  },
  { name: "leave", run: () => leaveAgencyAction({ csrfToken: "token" }), handler: mocks.leave },
  {
    name: "delete",
    run: () => deleteEmptyAgencyAction({ csrfToken: "token" }),
    handler: mocks.remove,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.csrf.mockResolvedValue(true);
});

describe.each(operations)("$name agency settings action", ({ run, handler }) => {
  it("rejects an invalid security token before membership changes", async () => {
    mocks.csrf.mockResolvedValue(false);
    await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("refreshes settings and workspace access after success", async () => {
    handler.mockResolvedValue({ success: true });
    await expect(run()).resolves.toEqual({ success: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/agency");
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard", "layout");
    expect(mocks.revalidate).toHaveBeenCalledWith("/agency-setup");
  });

  it("returns a service failure without claiming a successful change", async () => {
    handler.mockRejectedValue(new Error("Permission changed"));
    await expect(run()).rejects.toThrow("Permission changed");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
