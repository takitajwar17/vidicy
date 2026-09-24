import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCloudflareContext = vi.fn();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: mockGetCloudflareContext,
}));

describe("database binding contract", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetCloudflareContext.mockReset();
  });

  it("mentions the primary D1 binding in the error message when the binding is missing", async () => {
    mockGetCloudflareContext.mockReturnValue({
      env: {},
    });

    const { getDB } = await import("@/db");

    expect(() => getDB()).toThrow("APP_D1");
  });

  it("falls back to the OpenNext D1 binding when the app alias is unavailable", async () => {
    const database = {} as D1Database;

    mockGetCloudflareContext.mockReturnValue({
      env: {
        NEXT_TAG_CACHE_D1: database,
      },
    });

    const { getDB } = await import("@/db");

    expect(() => getDB()).not.toThrow();
  });
});
