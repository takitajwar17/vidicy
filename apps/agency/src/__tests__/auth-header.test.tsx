import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    usePathname: mockUsePathname,
  };
});

import Header from "@/components/sections/header";

describe("auth header CTA behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides the signup CTA on the signup route", () => {
    mockUsePathname.mockReturnValue("/sign-up");

    const markup = renderToStaticMarkup(<Header />);

    expect(markup).not.toContain("Get My Free Review");
    expect(markup).toContain("Sign in");
  });

  it("keeps the signup CTA on non-auth routes", () => {
    mockUsePathname.mockReturnValue("/");

    const markup = renderToStaticMarkup(<Header />);

    expect(markup).toContain("Get My Free Review");
  });
});
