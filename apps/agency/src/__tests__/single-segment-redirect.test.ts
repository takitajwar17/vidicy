import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock, notFoundMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error("redirected");
  }),
  notFoundMock: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: notFoundMock,
}));

import SingleSegmentFallbackPage from "@/app/[slug]/page";

describe("single segment root fallback", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    notFoundMock.mockClear();
  });

  it("404s ordinary one-segment marketing fallthroughs instead of soft-redirecting", async () => {
    await expect(
      Promise.resolve().then(() =>
        SingleSegmentFallbackPage({
          params: Promise.resolve({ slug: "unknown-marketing-page" }),
        }),
      ),
    ).rejects.toThrow("not-found");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("404s file-like slugs so missing metadata assets do not render homepage HTML", async () => {
    await expect(
      Promise.resolve().then(() =>
        SingleSegmentFallbackPage({
          params: Promise.resolve({ slug: "manifest.webmanifest" }),
        }),
      ),
    ).rejects.toThrow("not-found");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
