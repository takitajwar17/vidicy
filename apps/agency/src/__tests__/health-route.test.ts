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
