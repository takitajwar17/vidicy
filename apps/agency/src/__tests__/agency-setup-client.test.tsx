import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("zsa-react", () => ({ useServerAction: () => ({ execute: vi.fn(), isPending: false }) }));
vi.mock("@/components/csrf-provider", () => ({ useCsrfToken: () => "csrf-token" }));
vi.mock("@/actions/agency-membership.action", () => ({
  createAgencyAction: vi.fn(),
  joinAgencyAction: vi.fn(),
  previewAgencyInviteAction: vi.fn(),
  leaveAgencyAction: vi.fn(),
}));
vi.mock("@/app/(auth)/_components/auth-shell", () => ({
  AuthShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import AgencySetupClient from "@/app/(auth)/agency-setup/agency-setup.client";

describe("agency setup membership recovery", () => {
  it("blocks create and join choices until a disabled member leaves", () => {
    const html = renderToStaticMarkup(
      <AgencySetupClient disabledMembership={{ agencyName: "Existing agency" }} />,
    );
    expect(html).toContain("Your agency access is disabled");
    expect(html).toContain("You still belong to Existing agency");
    expect(html).toContain("Leave agency");
    expect(html).not.toContain("Create agency");
    expect(html).not.toContain("Join agency");
    expect(html).not.toContain("Check invite code");
  });

  it("shows create and join choices when there is no membership", () => {
    const html = renderToStaticMarkup(<AgencySetupClient />);
    expect(html).toContain("Create agency");
    expect(html).toContain("Join agency");
    expect(html).not.toContain("Your agency access is disabled");
  });
});
