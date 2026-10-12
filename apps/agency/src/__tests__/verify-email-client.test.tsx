import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface VerificationSuccess {
  data: { redirectTo: string };
}
const { success, replace, refresh, push } = vi.hoisted(() => ({
  success: { handler: undefined as ((response: VerificationSuccess) => void) | undefined },
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock("zsa-react", () => ({
  useServerAction: (
    _action: unknown,
    options: { onSuccess: (response: VerificationSuccess) => void },
  ) => {
    success.handler = options.onSuccess;
    return { execute: vi.fn(), isPending: true, error: null };
  },
}));
vi.mock("@/app/(auth)/verify-email/verify-email.action", () => ({ verifyEmailAction: vi.fn() }));
vi.mock("@/app/(auth)/_components/auth-shell", () => ({
  AuthShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/state/session", () => ({ useSessionStore: { getState: () => ({ session: null }) } }));
vi.mock("sonner", () => ({ toast: { dismiss: vi.fn(), success: vi.fn() } }));

import VerifyEmailClient from "@/app/(auth)/verify-email/verify-email.client";

describe("email verification completion navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { replace } });
    renderToStaticMarkup(<VerifyEmailClient token="test-token" />);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens the saved invite destination in a fresh request", () => {
    success.handler!({ data: { redirectTo: "/agency-setup?code=ABC123" } });
    expect(replace).toHaveBeenCalledWith("/agency-setup?code=ABC123");
    expect(refresh).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("uses the dashboard when a completion destination is unsafe", () => {
    success.handler!({ data: { redirectTo: "//external.example" } });
    expect(replace).toHaveBeenCalledWith("/dashboard");
  });
});
