import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startTestPostgres } from "./helpers/postgres";
import { currentReviewMetadata } from "./helpers/workflow-fixture";
import { loadReviewSnapshot } from "@/server/review-context";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  staff: vi.fn(),
  send: vi.fn(),
  current: vi.fn(),
  render: vi.fn(),
}));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: mocks.db,
}));
vi.mock("@/server/agency-team", () => ({ requireAgencyStaff: mocks.staff }));
vi.mock("@/utils/email", async (original) => ({
  ...(await original<typeof import("@/utils/email")>()),
  sendClientReportEmail: mocks.send,
}));
vi.mock("@/server/agency-review", async (original) => ({
  ...(await original<typeof import("@/server/agency-review")>()),
  requireCurrentAgencyReview: mocks.current,
}));
import { getDBFromDatabase } from "@/db";
import {
  agencyTable,
  agencyClientTable,
  applicantTable,
  checklistItemTable,
  clientReportTable,
  documentEvaluationTable,
  uploadedDocumentTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema";
import {
  deliverClientReport,
  getClientReport,
  updateClientReportRecipient,
} from "@/server/client-reports";
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
  const [agency] = await db
    .insert(agencyTable)
    .values({ ownerUserId: user.id, name: "Test agency" })
    .returning();
  mocks.staff.mockResolvedValue({
    session: { userId: user.id },
    staff: { agencyId: agency.id, role: "admin", isAdmin: true },
  });
  const [client] = await db
    .insert(agencyClientTable)
    .values({ agencyId: agency.id, name: "Client" })
    .returning();
  const [application] = await db
    .insert(visaApplicationTable)
    .values({
      userId: user.id,
      agencyId: agency.id,
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
  const [applicant] = await db
    .insert(applicantTable)
    .values({ applicationId, name: "Applicant", relationship: "primary" })
    .returning();
  const [item] = await db
    .insert(checklistItemTable)
    .values({
      applicationId,
      applicantId: applicant.id,
      documentName: "Passport",
      description: "Valid passport",
      isRequired: true,
    })
    .returning();
  const [document] = await db
    .insert(uploadedDocumentTable)
    .values({
      applicationId,
      applicantId: applicant.id,
      checklistItemId: item.id,
      fileName: "passport.pdf",
      fileKey: "synthetic/passport",
      fileSize: 100,
      mimeType: "application/pdf",
      extractionStatus: "completed",
      textContent: "Readable synthetic evidence",
    })
    .returning();
  await db.insert(documentEvaluationTable).values({
    ...(await currentReviewMetadata({ db, applicationId, applicantId: applicant.id })),
    applicationId,
    applicantId: applicant.id,
    reviewStatus: "complete",
    overallScore: 70,
    riskLevel: "medium",
    summary: "Completed model review",
    redFlags: [],
    strengths: [],
    recommendations: [],
    docSnapshots: { [item.id]: `${document.id}:synthetic` },
    itemFeedback: {
      [item.id]: {
        status: "needs_review",
        hasDocument: true,
        hasContent: true,
        feedback: "Replace passport",
      },
    },
  });
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
  it("delivers an initial collection request without requiring an AI review", async () => {
    await db.delete(documentEvaluationTable);
    await db.delete(uploadedDocumentTable);
    const snapshot = await loadReviewSnapshot({ db, applicationId });
    await db
      .update(clientReportTable)
      .set({ kind: "collection", reviewContextHash: snapshot.reviewContextHash });
    mocks.current
      .mockClear()
      .mockRejectedValue(new Error("A collection request must not require a review"));
    await expect(deliverClientReport({ reportId })).resolves.toEqual({ alreadySent: false });
    expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledOnce();
  });
  it("blocks delivery when applicant facts change during PDF preparation without a case counter change", async () => {
    mocks.render.mockImplementationOnce(async () => {
      await db.update(applicantTable).set({ nationality: "India" });
      return Buffer.from("%PDF-1.7\nreport attachment");
    });
    await expect(deliverClientReport({ reportId })).rejects.toThrow(/changed|out of date/i);
    expect(mocks.send).not.toHaveBeenCalled();
    expect((await db.query.clientReportTable.findFirst())?.status).toBe("ready");
  });

  it("keeps an accepted email historical when applicant facts change during provider delivery", async () => {
    mocks.send.mockImplementationOnce(async () => {
      await db.update(applicantTable).set({ nationality: "India" });
      return { id: "accepted-before-change" };
    });
    await deliverClientReport({ reportId });
    expect((await db.query.clientReportTable.findFirst())?.status).toBe("sent");
    expect((await db.query.visaApplicationTable.findFirst())?.clientReportStatus).toBe("draft");
    expect((await getClientReport({ reportId })).isStale).toBe(true);
  });
  it("does not let a legacy review block a complete review of the current checklist", async () => {
    await db.insert(documentEvaluationTable).values({
      applicationId,
      overallScore: 40,
      riskLevel: "high",
      summary: "Legacy review",
      redFlags: [],
      strengths: [],
      recommendations: [],
    });
    expect((await getClientReport({ reportId })).isStale).toBe(false);
  });
  it("shows reports from incomplete reviews as stale and blocks delivery", async () => {
    await db.update(documentEvaluationTable).set({ reviewStatus: "incomplete" });
    expect((await getClientReport({ reportId })).isStale).toBe(true);
    await expect(deliverClientReport({ reportId })).rejects.toThrow("out of date");
    expect(mocks.send).not.toHaveBeenCalled();
  });
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
  it("retries a frozen pending request after case facts change without treating the case as sent", async () => {
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await expect(deliverClientReport({ reportId })).rejects.toThrow("timeout");
    const original = mocks.send.mock.calls[0][0];
    await pool.query(
      `UPDATE client_report SET "deliveryStartedAt" = NOW() - INTERVAL '3 minutes', "updatedAt" = NOW() - INTERVAL '3 minutes' WHERE id = $1`,
      [reportId],
    );
    await db.update(visaApplicationTable).set({ clientName: "Changed client" });
    expect((await getClientReport({ reportId })).isStale).toBe(true);
    mocks.current.mockClear();
    mocks.render.mockRejectedValue(new Error("Do not regenerate a pending PDF"));
    await deliverClientReport({ reportId });
    expect(mocks.send.mock.calls[1][0]).toEqual(original);
    expect(mocks.render).toHaveBeenCalledTimes(1);
    expect(mocks.current).not.toHaveBeenCalled();
    expect((await db.query.clientReportTable.findFirst())?.status).toBe("sent");
    expect((await db.query.visaApplicationTable.findFirst())?.clientReportStatus).toBe("draft");
  });
  it("keeps a newer report ready when an older pending request is accepted", async () => {
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await expect(deliverClientReport({ reportId })).rejects.toThrow("timeout");
    const original = mocks.send.mock.calls[0][0];
    await pool.query(
      `UPDATE client_report SET "deliveryStartedAt" = NOW() - INTERVAL '3 minutes', "updatedAt" = NOW() - INTERVAL '3 minutes', "createdAt" = NOW() - INTERVAL '1 hour' WHERE id = $1`,
      [reportId],
    );
    const [newReport] = await db
      .insert(clientReportTable)
      .values({
        applicationId,
        summary: "New report",
        actionItems: [],
        status: "ready",
      })
      .returning();
    await deliverClientReport({ reportId });
    expect(mocks.send.mock.calls[1][0]).toEqual(original);
    expect((await getClientReport({ reportId })).report.status).toBe("sent");
    expect((await db.query.visaApplicationTable.findFirst())?.clientReportStatus).toBe("ready");
    expect((await getClientReport({ reportId: newReport.id })).isStale).toBe(false);
  });
  it("blocks a pending retry when the original idempotency key is missing", async () => {
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await expect(deliverClientReport({ reportId })).rejects.toThrow("timeout");
    await pool.query(
      `UPDATE client_report SET "deliveryKey" = NULL, "deliveryStartedAt" = NOW() - INTERVAL '3 minutes', "updatedAt" = NOW() - INTERVAL '3 minutes' WHERE id = $1`,
      [reportId],
    );
    await expect(deliverClientReport({ reportId })).rejects.toThrow(/original.*key/i);
    expect(mocks.send).toHaveBeenCalledTimes(1);
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

  it("adds a missing case recipient before the first send", async () => {
    await pool.query('UPDATE visa_application SET "clientEmail" = NULL WHERE id = $1', [
      applicationId,
    ]);
    await updateClientReportRecipient({ reportId, email: " New.Client@Example.COM " });
    expect((await db.query.visaApplicationTable.findFirst())?.clientEmail).toBe(
      "new.client@example.com",
    );
    await deliverClientReport({ reportId });
    expect(mocks.send.mock.calls[0][0].request.to).toEqual(["new.client@example.com"]);
  });

  it("rejects recipient changes after an attempt starts", async () => {
    mocks.send.mockRejectedValueOnce(new Error("timeout"));
    await expect(deliverClientReport({ reportId })).rejects.toThrow();
    await expect(
      updateClientReportRecipient({ reportId, email: "other@example.com" }),
    ).rejects.toThrow("delivery has started");
    expect((await db.query.visaApplicationTable.findFirst())?.clientEmail).toBe(
      "client@example.com",
    );
  });

  it("blocks recipient changes for stale reports and users without staff access", async () => {
    mocks.staff.mockRejectedValueOnce(new Error("forbidden"));
    await expect(
      updateClientReportRecipient({ reportId, email: "other@example.com" }),
    ).rejects.toThrow("forbidden");
    await pool.query('UPDATE visa_application SET "clientReportStatus" = $1 WHERE id = $2', [
      "draft",
      applicationId,
    ]);
    await expect(
      updateClientReportRecipient({ reportId, email: "other@example.com" }),
    ).rejects.toThrow("out of date");
  });

  it("rejects malformed recipient addresses before changing the case", async () => {
    await expect(updateClientReportRecipient({ reportId, email: "invalid" })).rejects.toThrow();
    expect((await db.query.visaApplicationTable.findFirst())?.clientEmail).toBe(
      "client@example.com",
    );
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

  it("blocks report reading, recipient changes, and delivery from another agency", async () => {
    const [otherUser] = await db
      .insert(userTable)
      .values({ email: "other-agency@example.test" })
      .returning();
    const [otherAgency] = await db
      .insert(agencyTable)
      .values({ ownerUserId: otherUser.id, name: "Other agency" })
      .returning();
    mocks.staff.mockResolvedValue({
      session: { userId: otherUser.id },
      staff: { agencyId: otherAgency.id, role: "admin", isAdmin: true },
    });
    await expect(getClientReport({ reportId })).rejects.toThrow("Case not found");
    await expect(
      updateClientReportRecipient({ reportId, email: "other@example.test" }),
    ).rejects.toThrow("Case not found");
    await expect(deliverClientReport({ reportId })).rejects.toThrow("Case not found");
    expect(mocks.send).not.toHaveBeenCalled();
    expect((await db.query.visaApplicationTable.findFirst())?.clientEmail).toBe(
      "client@example.com",
    );
  });
});
