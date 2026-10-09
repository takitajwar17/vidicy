import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdmin, mockGetDB, mockGetRuntimeContext } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetDB: vi.fn(),
  mockGetRuntimeContext: vi.fn(),
}));

vi.mock("@/app/api/_utils/request-auth", () => ({
  requireAdminRouteSession: mockRequireAdmin,
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: mockGetRuntimeContext,
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for anonymous requests", async () => {
    mockRequireAdmin.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      }),
    });

    const response = await GET();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not Found" });
    expect(mockGetDB).not.toHaveBeenCalled();
    expect(mockGetRuntimeContext).not.toHaveBeenCalled();
  });

  it("isolates concurrent Redis checks and removes each request key", async () => {
    mockRequireAdmin.mockResolvedValue({ session: { userId: "admin" } });
    mockGetDB.mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    const values = new Map<string, string>();
    let reads = 0;
    let release!: () => void;
    const bothReads = new Promise<void>((resolve) => {
      release = resolve;
    });
    const put = vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    });
    const get = vi.fn(async (key: string) => {
      if (++reads === 2) release();
      await bothReads;
      const value = values.get(key) ?? null;
      values.delete(key);
      return value;
    });
    const remove = vi.fn(async (key: string) => {
      values.delete(key);
    });
    mockGetRuntimeContext.mockResolvedValue({
      env: { APP_KV: { put, get, delete: remove }, R2: { list: async () => ({ objects: [] }) } },
    });
    const responses = await Promise.all([GET(), GET()]);
    for (const response of responses)
      expect(
        ((await response.json()) as { components: { memorystore: { status: string } } }).components
          .memorystore.status,
      ).toBe("ok");
    expect(new Set(put.mock.calls.map(([key]) => key)).size).toBe(2);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(values.size).toBe(0);
  });

  it("cleans up the Redis canary when read-back fails", async () => {
    mockRequireAdmin.mockResolvedValue({ session: { userId: "admin" } });
    mockGetDB.mockReturnValue({ execute: vi.fn().mockResolvedValue(undefined) });
    const remove = vi.fn();
    mockGetRuntimeContext.mockResolvedValue({
      env: {
        APP_KV: {
          put: vi.fn(),
          get: async () => {
            throw new Error("read failed");
          },
          delete: remove,
        },
        R2: { list: vi.fn() },
      },
    });
    const response = await GET();
    expect(
      ((await response.json()) as { components: { memorystore: { status: string } } }).components
        .memorystore.status,
    ).toBe("down");
    expect(remove).toHaveBeenCalledOnce();
  });

  it("returns detailed health data for admins", async () => {
    mockRequireAdmin.mockResolvedValue({
      session: {
        userId: "admin_123",
        user: { id: "admin_123", role: "admin" },
      },
    });
    const kvStore = new Map<string, string>();
    mockGetDB.mockReturnValue({
      execute: vi.fn().mockResolvedValue(undefined),
    });
    mockGetRuntimeContext.mockResolvedValue({
      env: {
        APP_KV: {
          put: vi.fn().mockImplementation(async (key: string, value: string) => {
            kvStore.set(key, value);
          }),
          get: vi.fn().mockImplementation(async (key: string) => kvStore.get(key) ?? null),
          delete: vi.fn().mockImplementation(async (key: string) => {
            kvStore.delete(key);
          }),
        },
        R2: {
          list: vi.fn().mockResolvedValue({ objects: [] }),
        },
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      components: {
        postgres: { status: string };
        memorystore: { status: string };
        cloudStorage: { status: string };
      };
    };
    expect(body.status).toBe("healthy");
    expect(body.components.postgres.status).toBe("ok");
    expect(body.components.memorystore.status).toBe("ok");
    expect(body.components.cloudStorage.status).toBe("ok");
  });
});
