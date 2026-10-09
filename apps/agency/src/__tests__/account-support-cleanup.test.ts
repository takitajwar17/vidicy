import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestPostgres } from "./helpers/postgres";

const mocks = vi.hoisted(() => ({
  getDB: vi.fn(),
  session: vi.fn(),
  head: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: mocks.getDB,
}));
vi.mock("zsa", () => ({
  ZSAError: class extends Error {},
  createServerAction: () => {
    const chain = {
      input: () => chain,
      handler: (handler: (args: { input: unknown }) => unknown) => (input: unknown) =>
        handler({ input }),
    };
    return chain;
  },
}));
vi.mock("@/utils/auth", () => ({ requireVerifiedEmail: mocks.session }));
vi.mock("@/utils/application-auth", () => ({ requireApplicationPermission: vi.fn() }));
vi.mock("@/infra/kv-session", () => ({
  deleteAllSessionsOfUser: vi.fn(),
  updateAllSessionsOfUser: vi.fn(),
}));
vi.mock("@/infra/csrf", () => ({ validateCsrfToken: async () => true }));
vi.mock("@/infra/action-rate-limit", () => ({ checkActionRateLimit: vi.fn() }));
vi.mock("@/infra/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ delete: vi.fn() }) }));
vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: async () => ({ env: { R2: { head: mocks.head, delete: mocks.remove } } }),
}));

import { getDB, getDBFromDatabase } from "@/db";
import { supportMessageTable, supportTicketTable, userTable } from "@/db/schema";
import { adminDeleteUser } from "@/server/application-server";
import { deleteAccountAction } from "@/actions/account.action";

let postgres: ReturnType<typeof startTestPostgres>;
let pool: ReturnType<ReturnType<typeof startTestPostgres>["createPool"]>;
let db: ReturnType<typeof getDB>;

beforeAll(async () => {
  vi.stubEnv("DB_SQL_LOG", "false");
  postgres = startTestPostgres();
  pool = postgres.createPool();
  const directory = new URL("../db/postgres-migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    await pool.query(readFileSync(new URL(file, directory), "utf8"));
  }
  db = getDBFromDatabase(pool);
}, 30_000);

afterAll(async () => {
  await pool?.end();
  postgres?.stop();
});

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.getDB.mockReturnValue(db);
  mocks.remove.mockResolvedValue(undefined);
  await pool.query('TRUNCATE "user" CASCADE');
});

describe("account support cleanup with PostgreSQL", () => {
  it("cleans an admin's replies when that admin has no tickets", async () => {
    const [admin, customer] = await db
      .insert(userTable)
      .values([{ email: "admin@example.com", role: "admin" }, { email: "customer@example.com" }])
      .returning();
    const [ticket] = await db
      .insert(supportTicketTable)
      .values({
        userId: customer.id,
        subject: "Keep",
        description: "Keep",
        category: "bug",
      })
      .returning();
    const key = "support-screenshots/admin/reply.png";
    await db.insert(supportMessageTable).values({
      ticketId: ticket.id,
      userId: admin.id,
      content: "Reply",
      isAdminReply: true,
      screenshotUrls: [key],
    });
    mocks.head.mockResolvedValue({ customMetadata: { uploadedBy: admin.id } });

    await adminDeleteUser({ userId: admin.id });

    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(key);
    expect(await db.query.supportMessageTable.findMany()).toEqual([]);
    expect(await db.query.supportTicketTable.findMany()).toEqual([
      expect.objectContaining({ id: ticket.id }),
    ]);
  });

  it.each(["self", "admin"])(
    "protects shared and unrelated uploads during %s deletion",
    async (path) => {
      const [owner, other, admin] = await db
        .insert(userTable)
        .values([
          { email: "owner@example.com" },
          { email: "other@example.com" },
          { email: "admin@example.com", role: "admin" },
        ])
        .returning();
      mocks.session.mockResolvedValue({ userId: owner.id });
      const ownKey = `support-screenshots/${owner.id}/own.png`;
      const authoredKey = `support-screenshots/${owner.id}/other-ticket.png`;
      const otherKey = `support-screenshots/${other.id}/private.png`;
      const mismatchKey = `support-screenshots/${owner.id}/mismatch.png`;
      const adminKey = "support-screenshots/admin/unshared.png";
      const sharedKey = "support-screenshots/admin/shared.png";
      const documentKey = `visa-documents/${other.id}/private.pdf`;
      const missingMetadataKey = `support-screenshots/${owner.id}/legacy.png`;
      const [deletedTicket, retainedTicket] = await db
        .insert(supportTicketTable)
        .values([
          {
            userId: owner.id,
            subject: "Delete",
            description: "Delete",
            category: "bug",
            screenshotUrls: [ownKey, otherKey, documentKey, mismatchKey, missingMetadataKey],
          },
          { userId: other.id, subject: "Keep", description: "Keep", category: "bug" },
        ])
        .returning();
      await db.insert(supportMessageTable).values([
        {
          ticketId: deletedTicket.id,
          userId: admin.id,
          content: "Reply",
          screenshotUrls: [adminKey, sharedKey],
          isAdminReply: true,
        },
        {
          ticketId: retainedTicket.id,
          userId: admin.id,
          content: "Shared reply",
          screenshotUrls: [sharedKey],
          isAdminReply: true,
        },
        {
          ticketId: retainedTicket.id,
          userId: owner.id,
          content: "Removed author",
          screenshotUrls: [authoredKey],
        },
      ]);
      mocks.head.mockImplementation(async (key: string) => ({
        customMetadata: {
          ...(key === missingMetadataKey
            ? {}
            : {
                uploadedBy: key.includes("/admin/")
                  ? admin.id
                  : key === ownKey || key === authoredKey
                    ? owner.id
                    : other.id,
              }),
        },
      }));

      if (path === "self") await deleteAccountAction({ confirmationText: "DELETE MY ACCOUNT" });
      else await adminDeleteUser({ userId: owner.id });

      expect(mocks.remove.mock.calls.map(([key]) => key).sort()).toEqual(
        [ownKey, authoredKey, adminKey].sort(),
      );
      expect(mocks.head).not.toHaveBeenCalledWith(documentKey);
      expect(await db.query.userTable.findMany()).toHaveLength(2);
      expect(await db.query.supportTicketTable.findMany()).toEqual([
        expect.objectContaining({ id: retainedTicket.id }),
      ]);
      expect(await db.query.supportMessageTable.findMany()).toEqual([
        expect.objectContaining({ screenshotUrls: [sharedKey], userId: admin.id }),
      ]);
    },
  );
});
