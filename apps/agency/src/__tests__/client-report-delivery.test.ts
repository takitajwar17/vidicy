import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestPostgres } from "./helpers/postgres";
const mocks = vi.hoisted(() => ({ db: vi.fn(), staff: vi.fn(), send: vi.fn(), current: vi.fn() }));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: mocks.db,
}));
vi.mock("@/server/agency-team", () => ({ requireAgencyStaff: mocks.staff }));
vi.mock("@/utils/email", async (original) => ({
  ...(await original<typeof import("@/utils/email")>()),
  sendClientReportEmail: mocks.send,
}));
vi.mock("@/server/agency-review", () => ({ requireCurrentAgencyReview: mocks.current }));
import { getDBFromDatabase } from "@/db";
import { agencyClientTable, clientReportTable, userTable, visaApplicationTable } from "@/db/schema";
import { deliverClientReport, getClientReport } from "@/server/client-reports";
let postgres: ReturnType<typeof startTestPostgres>;
let pool: ReturnType<typeof postgres.createPool>;
function createDatabase(pool: ReturnType<ReturnType<typeof startTestPostgres>["createPool"]>) {
  return getDBFromDatabase(pool);
}
let db: ReturnType<typeof createDatabase>;
let reportId: string;
let applicationId: string;
beforeAll(async () => {
  vi.stubEnv("DB_SQL_LOG", "false");
  postgres = startTestPostgres();
  pool = postgres.createPool();
  db = createDatabase(pool);
  const directory = new URL("../db/postgres-migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await pool.query(readFileSync(new URL(file, directory), "utf8"));
}, 30000);
afterAll(async () => {
  await pool?.end();
  postgres?.stop();
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  vi.stubEnv("EMAIL_FROM", "reports@example.test");
  vi.stubEnv("EMAIL_FROM_NAME", "Test Agency");
  vi.stubEnv("EMAIL_REPLY_TO", "reply@example.test");
  await pool.query('TRUNCATE "user" CASCADE');
  mocks.db.mockReturnValue(db);
  mocks.current.mockResolvedValue({});
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({ id: "provider_1" });
  const [user] = await db.insert(userTable).values({ email: "staff@example.com" }).returning();
  mocks.staff.mockResolvedValue({ session: { userId: user.id } });
  const [client] = await db.insert(agencyClientTable).values({ name: "Client" }).returning();
  const [application] = await db
    .insert(visaApplicationTable)
    .values({
      userId: user.id,
      clientId: client.id,
      clientName: "Client",
      clientEmail: "client@example.com",
      homeCountry: "Bangladesh",
      currentCountry: "Bangladesh",
      destinationCountry: "Japan",
      visaType: "Tourist",
      embassy: "Dhaka",
      clientReportStatus: "ready",
    })
    .returning();
  applicationId = application.id;
  const [report] = await db
    .insert(clientReportTable)
    .values({
      applicationId,
      summary: "Please replace the bank statement.",
      actionItems: [{ title: "Bank statement", detail: "Upload all pages", severity: "high" }],
      status: "ready",
    })
    .returning();
  reportId = report.id;
});
describe("client report delivery", () => {
  it("sends the full report and records provider acceptance", async () => {
    await deliverClientReport({ reportId });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          to: ["client@example.com"],
          text: expect.stringContaining("Upload all pages"),
        }),
        idempotencyKey: expect.any(String),
      }),
    );
    expect((await db.query.clientReportTable.findFirst())?.status).toBe("sent");
    expect((await db.query.visaApplicationTable.findFirst())?.clientReportStatus).toBe("sent");
  });
  it("allows only one concurrent send and never resends an accepted report", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.send.mockImplementation(async () => {
      await gate;
      return { id: "provider_1" };
    });
    const first = deliverClientReport({ reportId });
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1));
    await expect(deliverClientReport({ reportId })).rejects.toThrow("in progress");
    release();
    await first;
    await deliverClientReport({ reportId });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("does not record delivery when the provider fails", async () => {
    mocks.send.mockRejectedValue(new Error("provider unavailable"));
    await expect(deliverClientReport({ reportId })).rejects.toThrow();
    const report = await db.query.clientReportTable.findFirst();
    expect(report?.sentAt).toBeNull();
    expect(report?.status).not.toBe("sent");
    expect((await db.query.visaApplicationTable.findFirst())?.clientReportStatus).toBe("ready");
  });
  it("retries the identical stored message and key after an ambiguous failure", async () => {
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await expect(deliverClientReport({ reportId })).rejects.toThrow();
    const first = mocks.send.mock.calls[0][0];
    await pool.query(
      'UPDATE "client_report" SET "deliveryStartedAt" = NOW() - INTERVAL \'3 minutes\', "updatedAt" = NOW() - INTERVAL \'3 minutes\' WHERE id = $1',
      [reportId],
    );
    await pool.query('UPDATE "visa_application" SET "clientEmail" = $1 WHERE id = $2', [
      "other@example.com",
      applicationId,
    ]);
    vi.stubEnv("EMAIL_FROM", "new@example.test");
    vi.stubEnv("EMAIL_REPLY_TO", "new-reply@example.test");
    await deliverClientReport({ reportId });
    expect(mocks.send.mock.calls[1][0]).toEqual(first);
  });
  it("keeps accepted delivery as history if the case changes while sending", async () => {
    mocks.send.mockImplementationOnce(async () => {
      await pool.query(
        'UPDATE "visa_application" SET "clientReportStatus" = $1, "updateCounter" = "updateCounter" + 1 WHERE id = $2',
        ["draft", applicationId],
      );
      return { id: "accepted_before_change" };
    });
    await deliverClientReport({ reportId });
    expect((await db.query.clientReportTable.findFirst())?.providerMessageId).toBe(
      "accepted_before_change",
    );
    expect((await db.query.visaApplicationTable.findFirst())?.clientReportStatus).toBe("draft");
  });
  it("stops ambiguous retries before the provider forgets its idempotency key", async () => {
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await expect(deliverClientReport({ reportId })).rejects.toThrow();
    await pool.query(
      'UPDATE "client_report" SET "deliveryStartedAt" = NOW() - INTERVAL \'24 hours\' WHERE id = $1',
      [reportId],
    );
    await expect(deliverClientReport({ reportId })).rejects.toThrow("outcome is unknown");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("rejects an overlapping retry after the initial wait has elapsed", async () => {
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await expect(deliverClientReport({ reportId })).rejects.toThrow();
    await pool.query(
      'UPDATE "client_report" SET "deliveryStartedAt" = NOW() - INTERVAL \'3 minutes\', "updatedAt" = NOW() - INTERVAL \'3 minutes\' WHERE id = $1',
      [reportId],
    );
    let release!: () => void;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    mocks.send.mockImplementationOnce(async () => {
      await gate;
      return { id: "retry_accepted" };
    });
    const retry = deliverClientReport({ reportId });
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(2));
    try {
      await expect(deliverClientReport({ reportId })).rejects.toThrow("in progress");
      expect(mocks.send).toHaveBeenCalledTimes(2);
    } finally {
      release();
      await retry;
    }
  });
  it("stores the complete provider request before the provider call", async () => {
    mocks.send.mockImplementationOnce(async ({ request }) => {
      const row = (
        await pool.query('SELECT status, "deliveryRequest" FROM client_report WHERE id = $1', [
          reportId,
        ])
      ).rows[0];
      expect(row.status).toBe("sending");
      expect(row.deliveryRequest).toEqual(request);
      return { id: "provider_1" };
    });
    await deliverClientReport({ reportId });
    const row = (
      await pool.query(
        "SELECT to_jsonb(client_report) AS report FROM client_report WHERE id = $1",
        [reportId],
      )
    ).rows[0].report;
    expect(row.deliveryRequest).toMatchObject({
      from: "Test Agency <reports@example.test>",
      to: ["client@example.com"],
      reply_to: "reply@example.test",
      subject: expect.any(String),
      text: expect.stringContaining("Upload all pages"),
      tags: [{ name: "type", value: "client-report" }],
    });
    expect(mocks.send.mock.calls[0][0].request).toEqual(row.deliveryRequest);
  });

  it("blocks legacy pending requests whose original sender was not saved", async () => {
    await pool.query(
      `UPDATE client_report SET status = 'sending', "deliveryKey" = 'legacy/key',
      "deliveryPayload" = $1, "deliveryStartedAt" = NOW() - INTERVAL '3 minutes',
      "updatedAt" = NOW() - INTERVAL '3 minutes' WHERE id = $2`,
      [
        JSON.stringify({ to: "client@example.com", subject: "Old report", text: "Old content" }),
        reportId,
      ],
    );
    await expect(deliverClientReport({ reportId })).rejects.toThrow("original sender");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("blocks stale reports and users without staff access", async () => {
    await pool.query('UPDATE "visa_application" SET "clientReportStatus" = $1 WHERE id = $2', [
      "draft",
      applicationId,
    ]);
    await expect(deliverClientReport({ reportId })).rejects.toThrow("out of date");
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.staff.mockRejectedValueOnce(new Error("forbidden"));
    await expect(getClientReport({ reportId })).rejects.toThrow("forbidden");
  });
});
