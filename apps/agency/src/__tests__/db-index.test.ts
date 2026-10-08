import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { constructed } = vi.hoisted(() => ({ constructed: vi.fn() }));
vi.mock("pg", () => ({
  Pool: class {
    constructor(options: unknown) { constructed(options); }
    on() {}
  },
}));

describe("PostgreSQL configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    constructed.mockClear();
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PGHOST", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires explicit PostgreSQL configuration", async () => {
    const { getDB } = await import("@/db");
    expect(() => getDB()).toThrow("Set DATABASE_URL or PGHOST");
    expect(constructed).not.toHaveBeenCalled();
  });

  it("uses one pool for repeated calls with Cloud SQL socket configuration", async () => {
    vi.stubEnv("PGHOST", "/cloudsql/test-instance");
    const { getDB } = await import("@/db");
    expect(getDB()).toBe(getDB());
    expect(constructed).toHaveBeenCalledTimes(1);
    expect(constructed).toHaveBeenCalledWith(expect.objectContaining({ connectionTimeoutMillis: 10_000 }));
  });
});
