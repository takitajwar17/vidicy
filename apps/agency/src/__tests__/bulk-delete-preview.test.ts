import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startTestPostgres } from "./helpers/postgres";
const mocks = vi.hoisted(() => ({ db: vi.fn(), admin: vi.fn() }));
vi.mock("zsa", () => ({
  ZSAError: class extends Error {},
  createServerAction: () => {
    const chain = {
      input: () => chain,
      handler: (fn: (args: { input: unknown }) => unknown) => (input: unknown) => fn({ input }),
    };
    return chain;
  },
}));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: mocks.db,
}));
vi.mock("@/utils/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/server/application-server", () => ({ adminDeleteUser: vi.fn() }));
vi.mock("@/infra/kv-session", () => ({ updateAllSessionsOfUser: vi.fn() }));
vi.mock("@/infra/csrf", () => ({ validateCsrfToken: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { previewDeleteUsersAction } from "@/app/(admin)/admin/_actions/bulk-actions";
import { getDBFromDatabase } from "@/db";
import { userTable, agencyTeamMemberTable, visaApplicationTable } from "@/db/schema";
let postgres: ReturnType<typeof startTestPostgres>;
let adminPool: ReturnType<ReturnType<typeof startTestPostgres>["createPool"]>;
beforeAll(() => {
  postgres = startTestPostgres();
  adminPool = postgres.createPool();
}, 30000);
afterAll(async () => {
  await adminPool?.end();
  postgres?.stop();
});

describe("bulk deletion impact", () => {
  it("predicts the final case impact when all active staff are selected", async () => {
    vi.stubEnv("DB_SQL_LOG", "false");
    const name = `test_${randomUUID().replaceAll("-", "")}`;
    await adminPool.query(`CREATE DATABASE "${name}"`);
    const pool = postgres.createPool(name);
    try {
      const dir = new URL("../db/postgres-migrations/", import.meta.url);
      for (const file of readdirSync(dir)
        .filter((file) => file.endsWith(".sql"))
        .sort())
        await pool.query(readFileSync(new URL(file, dir), "utf8"));
      const db = getDBFromDatabase(pool);
      mocks.db.mockReturnValue(db);
      const [admin, first, second] = await db
        .insert(userTable)
        .values([
          { email: "admin@example.com", role: "admin" },
          { email: "first@example.com" },
          { email: "second@example.com" },
        ])
        .returning();
      mocks.admin.mockResolvedValue({ userId: admin.id });
      await db.insert(agencyTeamMemberTable).values([
        { userId: first.id, email: first.email!, role: "member", status: "active" },
        { userId: second.id, email: second.email!, role: "member", status: "active" },
        { email: "invited@example.com", role: "member", status: "active" },
      ]);
      await db.insert(visaApplicationTable).values(
        [first, second].map((user) => ({
          userId: user.id,
          homeCountry: "Bangladesh",
          currentCountry: "Bangladesh",
          destinationCountry: "Japan",
          visaType: "Tourist",
          embassy: "Dhaka",
        })),
      );
      const input = { userIds: [first.id, second.id], csrfToken: "token" };
      await expect(previewDeleteUsersAction(input)).resolves.toEqual({
        usersToDelete: 2,
        appsToTransfer: 0,
        appsToDelete: 2,
      });
      // A linked, active member who survives the deletion can receive both cases.
      await db
        .insert(agencyTeamMemberTable)
        .values({ userId: admin.id, email: admin.email!, role: "admin", status: "active" });
      await expect(previewDeleteUsersAction(input)).resolves.toEqual({
        usersToDelete: 2,
        appsToTransfer: 2,
        appsToDelete: 0,
      });
      await expect(
        previewDeleteUsersAction({ ...input, userIds: [first.id, first.id, second.id, admin.id] }),
      ).resolves.toEqual({ usersToDelete: 2, appsToTransfer: 2, appsToDelete: 0 });
    } finally {
      await pool.end();
      await adminPool.query(`DROP DATABASE "${name}"`);
      vi.unstubAllEnvs();
    }
  });
});
