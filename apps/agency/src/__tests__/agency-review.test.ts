import { randomUUID } from "node:crypto";
import { startTestPostgres } from "./helpers/postgres";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDB,
  mockPermission,
  mockOpenAI,
  mockPerplexity,
  mockGemini,
  mockStorageHead,
  mockStorageDelete,
  mockExtractTextFromPdf,
} = vi.hoisted(() => ({
  mockGetDB: vi.fn(),
  mockPermission: vi.fn(),
  mockOpenAI: vi.fn(),
  mockPerplexity: vi.fn(),
  mockGemini: vi.fn(),
  mockStorageHead: vi.fn(),
  mockStorageDelete: vi.fn(),
  mockExtractTextFromPdf: vi.fn(),
}));
vi.mock("zsa", () => ({
  ZSAError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  createServerAction: () => {
    const chain = {
      input: () => chain,
      handler: (handler: (args: { input: unknown }) => unknown) => (input: unknown) =>
        handler({ input }),
    };
    return chain;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/agency-team", () => ({
  requireAgencyStaff: async () => ({ session: await mockPermission() }),
  requireAgencyAdmin: async () => ({ session: await mockPermission() }),
}));
vi.mock("@/utils/email", () => ({
  sendAgencyTeamAccessEmail: vi.fn(),
  sendSupportTicketAdminNotification: vi.fn(),
  sendSupportTicketReplyNotification: vi.fn(),
  sendSupportTicketUserReplyNotification: vi.fn(),
}));
vi.mock("@/utils/auth", () => ({ getSessionFromCookie: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/server/unread-counts", () => ({
  invalidateUnreadCount: vi.fn(),
  invalidateAdminUnreadCount: vi.fn(),
}));
vi.mock("@/lib/r2", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/r2")>()),
  getR2Bucket: async () => ({ head: mockStorageHead, delete: mockStorageDelete }),
  getFromR2: async () => ({ arrayBuffer: async () => new Uint8Array([1, 2]).buffer }),
}));
vi.mock("@/services/pdf-parser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/pdf-parser")>()),
  extractTextFromPdf: mockExtractTextFromPdf,
  getPdfPageCount: async () => 1,
  extractPdfMetadata: async () => ({ pageCount: 1 }),
  renderPdfPagesForExtraction: async () => ({
    success: false,
    pages: [],
    error: "No readable pages",
  }),
}));
vi.mock("@/utils/application-auth", () => ({ requireApplicationPermission: mockPermission }));
vi.mock("@/infra/action-rate-limit", () => ({ checkActionRateLimit: vi.fn() }));
vi.mock("@/infra/usage-tracking", () => ({
  trackUsage: vi.fn(),
  USAGE_EVENTS: { CHECKLIST_GENERATED: "checklist" },
}));
vi.mock("@/lib/openai", () => ({
  getOpenAIClient: () => ({ chat: { completions: { create: mockOpenAI } } }),
  getPerplexityClient: () => ({ chat: { completions: { create: mockPerplexity } } }),
}));
vi.mock("@/infra/runtime-context", () => ({ getRuntimeContext: () => ({ env: {} }) }));
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDB: mockGetDB,
}));
vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logAlert: vi.fn(),
}));

import {
  addReviewIssueAction,
  createAgencyCaseAction,
  finalizeReviewAction,
  generateClientReportAction,
  updateAgencyCaseStatusAction,
  updateReviewIssueStatusAction,
} from "@/actions/agency-case.action";
vi.mock("@/lib/gemini-evaluation", () => ({ createGeminiEvaluation: mockGemini }));
import { evaluateDocumentsAction } from "@/actions/evaluation.action";
import { generateChecklistAction } from "@/actions/checklist.action";
import { getDBFromDatabase } from "@/db";
import {
  agencyTeamMemberTable,
  agencyClientTable,
  applicantTable,
  checklistItemTable,
  clientReportTable,
  documentEvaluationTable,
  reviewIssueTable,
  supportTicketTable,
  supportMessageTable,
  uploadedDocumentTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema";
import {
  invalidateAgencyReports,
  invalidateAgencyReview,
  isEvaluationCurrent,
  markAgencyCaseReady,
  newestDocumentOrder,
  publishAgencyReview,
  syncAgencyReviewIssues,
} from "@/server/agency-review";
import { getAgencyCaseDetail, getAgencyCaseRows, getAgencyReports } from "@/server/agency-data";
import { updateClientReportRecipient } from "@/server/client-reports";

import { deleteTicket } from "@/server/support";
import { ensureDocumentExtraction } from "@/services/document-pipeline";

let postgres: ReturnType<typeof startTestPostgres>;
let adminPool: ReturnType<ReturnType<typeof startTestPostgres>["createPool"]>;
beforeAll(() => {
  postgres = startTestPostgres();
  adminPool = postgres.createPool();
}, 30_000);
afterAll(async () => {
  await adminPool?.end();
  postgres?.stop();
});

// Run the production PostgreSQL driver and migrations in an isolated database.
async function createDatabase({ lastMigration }: { lastMigration?: string } = {}) {
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  await adminPool.query(`CREATE DATABASE "${name}"`);
  const pool = postgres.createPool(name);
  let beforeQuery: ((query: string) => void | Promise<void>) | undefined;
  pool.on("connect", (client) => {
    client.query = new Proxy(client.query, {
      apply(target, receiver, args) {
        const query = typeof args[0] === "string" ? args[0] : args[0].text;
        return Promise.resolve(beforeQuery?.(query)).then(() =>
          Reflect.apply(target, receiver, args),
        );
      },
    });
  });
  const migrationDirectory = new URL("../db/postgres-migrations/", import.meta.url);
  for (const file of readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    if (!lastMigration || file.slice(0, 4) <= lastMigration) {
      await pool.query(readFileSync(new URL(file, migrationDirectory), "utf8"));
    }
  }
  return {
    db: getDBFromDatabase(pool),
    pool,
    setBeforeQuery(callback?: (query: string) => void | Promise<void>) {
      beforeQuery = callback;
    },
    async close() {
      beforeQuery = undefined;
      await pool.end();
      await adminPool.query(`DROP DATABASE "${name}"`);
    },
  };
}

describe("agency review workflow with the real database driver", () => {
  let fixture: Awaited<ReturnType<typeof createDatabase>>;
  let userId: string;
  let applicationId: string;
  let applicantId: string;
  let itemId: string;
  let documentId: string;
  let evaluation: typeof documentEvaluationTable.$inferSelect;
  let lastEvaluationTime = 0;

  beforeEach(async () => {
    vi.stubEnv("DB_SQL_LOG", "false");
    lastEvaluationTime = 0;
    fixture = await createDatabase();
    const { db } = fixture;
    mockGetDB.mockReturnValue(db);
    const [user] = await db.insert(userTable).values({ email: "reviewer@example.com" }).returning();
    userId = user.id;
    mockPermission.mockResolvedValue({ userId });
    mockPerplexity.mockResolvedValue({
      choices: [{ message: { content: "Official requirements" } }],
      citations: [],
    });
    mockOpenAI.mockReset();
    await db
      .insert(agencyTeamMemberTable)
      .values({ userId, email: "reviewer@example.com", role: "admin", status: "active" });
    const [application] = await db
      .insert(visaApplicationTable)
      .values({
        userId,
        clientId: "client",
        clientName: "Client",
        homeCountry: "Bangladesh",
        currentCountry: "Bangladesh",
        destinationCountry: "Japan",
        visaType: "Tourist",
        embassy: "Dhaka",
      })
      .returning();
    applicationId = application.id;
    const [applicant] = await db
      .insert(applicantTable)
      .values({ applicationId, name: "Applicant", relationship: "primary" })
      .returning();
    applicantId = applicant.id;
    const [item] = await db
      .insert(checklistItemTable)
      .values({
        applicationId,
        applicantId,
        documentName: "Passport",
        description: "Valid passport",
        isRequired: true,
      })
      .returning();
    itemId = item.id;
    const [document] = await db
      .insert(uploadedDocumentTable)
      .values({
        applicationId,
        applicantId,
        checklistItemId: itemId,
        fileName: "passport.pdf",
        fileKey: "passport",
        fileSize: 100,
        mimeType: "application/pdf",
        uploadedAt: new Date("2026-09-19T00:00:00Z"),
      })
      .returning();
    documentId = document.id;
    evaluation = await saveEvaluation();
  });
  afterEach(async () => {
    await fixture?.close();
    vi.unstubAllEnvs();
  });

  async function saveEvaluation(
    overrides: Partial<typeof documentEvaluationTable.$inferInsert> = {},
  ) {
    // Fixtures represent successive reviews, even when inserts share a millisecond.
    lastEvaluationTime = Math.max(Date.now(), lastEvaluationTime + 1);
    const [saved] = await fixture.db
      .insert(documentEvaluationTable)
      .values({
        applicationId,
        applicantId,
        overallScore: 95,
        riskLevel: "low",
        summary: "Reviewed",
        createdAt: new Date(lastEvaluationTime),
        redFlags: [],
        strengths: [],
        recommendations: [],
        docSnapshots: { [itemId]: `${documentId}:1:0` },
        itemFeedback: {
          [itemId]: {
            status: "ok",
            score: 95,
            hasDocument: true,
            hasContent: true,
            feedback: "Valid passport",
            issues: [],
          },
        },
        ...overrides,
      })
      .returning();
    return saved;
  }
  function context() {
    return { db: fixture.db, applicationId, userId };
  }
  async function sync() {
    return syncAgencyReviewIssues({ ...context(), evaluation });
  }
  async function addIssue(overrides: Partial<typeof reviewIssueTable.$inferInsert> = {}) {
    const [issue] = await fixture.db
      .insert(reviewIssueTable)
      .values({
        applicationId,
        applicantId,
        title: "Check evidence",
        description: "Check evidence",
        source: "reviewer",
        status: "open",
        ...overrides,
      })
      .returning();
    return issue;
  }

  async function prepareChecklistGeneration(items: unknown[]) {
    await fixture.db.delete(documentEvaluationTable);
    await fixture.db.delete(uploadedDocumentTable);
    await fixture.db.delete(checklistItemTable);
    mockOpenAI.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    });
  }

  it("keeps successful extraction when a concurrent attempt fails later", async () => {
    let finishSuccess!: (value: { success: boolean; text: string }) => void;
    let finishFailure!: (value: { success: boolean; text: string; error: string }) => void;
    let startedBoth!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      startedBoth = resolve;
    });
    let started = 0;
    mockExtractTextFromPdf.mockReset();
    mockExtractTextFromPdf.mockImplementationOnce(() => {
      if (++started === 2) startedBoth();
      return new Promise((resolve) => {
        finishSuccess = resolve;
      });
    });
    mockExtractTextFromPdf.mockImplementationOnce(() => {
      if (++started === 2) startedBoth();
      return new Promise((resolve) => {
        finishFailure = resolve;
      });
    });
    const successful = ensureDocumentExtraction({ documentId });
    const failed = ensureDocumentExtraction({ documentId });
    await bothStarted;
    finishSuccess({ success: true, text: "Valid passport evidence" });
    await successful;
    finishFailure({ success: false, text: "", error: "Provider failed" });
    const lateResult = await failed;
    expect(await fixture.db.query.uploadedDocumentTable.findFirst()).toMatchObject({
      textContent: "Valid passport evidence",
      extractionStatus: "completed",
      extractionMethod: "pdf_native",
    });
    expect(lateResult).toMatchObject({
      success: true,
      textContent: "Valid passport evidence",
      reusedStoredExtraction: true,
    });
  });

  const newCaseInput = {
    clientName: "New Client",
    clientEmail: "client@example.com",
    applicantName: "New Applicant",
    homeCountry: "Bangladesh",
    currentCountry: "Bangladesh",
    destinationCountry: "Japan",
    visaType: "Tourist",
    embassy: "Dhaka",
    priority: "normal" as const,
  };

  it.each([false, true])(
    "rolls back case creation and client changes on applicant failure (existing client: %s)",
    async (existingClient) => {
      if (existingClient) {
        await fixture.db
          .insert(agencyClientTable)
          .values({ name: "Original Client", email: newCaseInput.clientEmail });
      }
      fixture.setBeforeQuery((query) => {
        if (query.startsWith('insert into "applicant"')) throw new Error("Applicant write failed");
      });
      await expect(createAgencyCaseAction(newCaseInput)).rejects.toThrow();
      const clients = await fixture.db.query.agencyClientTable.findMany();
      expect(clients.map((client) => client.name)).toEqual(
        existingClient ? ["Original Client"] : [],
      );
      expect(await fixture.db.query.visaApplicationTable.findMany()).toHaveLength(1);
      expect(await fixture.db.query.applicantTable.findMany()).toHaveLength(1);
    },
  );

  it("creates a case and its primary applicant together", async () => {
    await createAgencyCaseAction(newCaseInput);
    const client = await fixture.db.query.agencyClientTable.findFirst();
    const application = (await fixture.db.query.visaApplicationTable.findMany()).find(
      (row) => row.clientId === client?.id,
    );
    expect(application).toBeDefined();
    expect(
      (await fixture.db.query.applicantTable.findMany()).find(
        (row) => row.applicationId === application?.id,
      ),
    ).toMatchObject({ name: newCaseInput.applicantName });
  });

  it("deletes only owned screenshots with no remaining ticket or message reference", async () => {
    const ticketKey = `support-screenshots/${userId}/shared-ticket.png`;
    const messageKey = `support-screenshots/${userId}/shared-message.png`;
    const unusedKey = `support-screenshots/${userId}/unused.png`;
    const foreignKey = "visa-documents/other/private.pdf";
    const adminKey = "support-screenshots/admin/other.png";
    mockStorageHead.mockImplementation(async (key: string) => ({
      customMetadata: { uploadedBy: key === adminKey ? "other" : userId },
    }));
    mockStorageDelete.mockReset();
    mockStorageDelete.mockResolvedValue(undefined);
    const [removed, retained] = await fixture.db
      .insert(supportTicketTable)
      .values([
        {
          userId,
          subject: "Remove",
          description: "Test",
          category: "bug",
          screenshotUrls: [ticketKey, messageKey, unusedKey, foreignKey, adminKey],
        },
        {
          userId,
          subject: "Retain",
          description: "Test",
          category: "bug",
          screenshotUrls: [ticketKey],
        },
      ])
      .returning();
    await fixture.db.insert(supportMessageTable).values({
      ticketId: retained.id,
      userId,
      content: "Shared image",
      screenshotUrls: [messageKey],
    });
    await deleteTicket({ ticketId: removed.id });
    expect(mockStorageDelete.mock.calls).toEqual([[unusedKey]]);
    expect(await fixture.db.query.supportTicketTable.findMany()).toHaveLength(1);
    expect(await fixture.db.query.supportMessageTable.findMany()).toHaveLength(1);
  });

  it("evaluates stored evidence and publishes the combined review", async () => {
    await fixture.db
      .update(uploadedDocumentTable)
      .set({ textContent: "Passport document text", extractionStatus: "completed" });
    mockGemini.mockReset();
    mockGemini.mockResolvedValueOnce(
      JSON.stringify({
        status: "ok",
        score: 98,
        feedback: "Valid passport",
        confidence: 95,
        issues: [],
        strengths: ["Valid identity"],
        extractedFields: { holderName: "Test User", language: "en" },
      }),
    );
    mockGemini.mockResolvedValueOnce(
      JSON.stringify({
        overallScore: 98,
        riskLevel: "low",
        summary: "Documents are ready",
        redFlags: [],
        strengths: ["Valid passport"],
        recommendations: [],
        itemFeedback: {},
      }),
    );
    await evaluateDocumentsAction({ applicationId, applicantId });
    const saved = await fixture.db.query.documentEvaluationTable.findMany();
    expect(saved).toHaveLength(2);
    const result = saved.find((row) => row.id !== evaluation.id)!;
    expect(result.overallScore).toBe(98);
    expect(result.itemFeedback?.[itemId]).toMatchObject({
      status: "ok",
      hasContent: true,
      confidence: 95,
    });
    expect(result.docSnapshots?.[itemId]).toContain(documentId);
    expect(mockGemini).toHaveBeenCalledTimes(2);
    expect(mockGemini.mock.calls[0][0].userContent).toContain("Passport document text");
  });

  it("saves document results when the orchestrator fails", async () => {
    await fixture.db
      .update(uploadedDocumentTable)
      .set({ textContent: "Passport evidence", extractionStatus: "completed" });
    mockGemini.mockReset();
    mockGemini.mockResolvedValueOnce(
      JSON.stringify({
        status: "ok",
        score: 98,
        feedback: "Valid passport",
        confidence: 95,
        issues: [],
        strengths: [],
      }),
    );
    mockGemini.mockRejectedValueOnce(new Error("Orchestrator unavailable"));
    await evaluateDocumentsAction({ applicationId, applicantId });
    const saved = (await fixture.db.query.documentEvaluationTable.findMany()).find(
      (row) => row.id !== evaluation.id,
    )!;
    expect(saved.overallScore).toBe(98);
    expect(saved.itemFeedback?.[itemId]).toMatchObject({ status: "ok", confidence: 95 });
    expect(saved.docSnapshots?.[itemId]).toContain(documentId);
    expect(mockGemini).toHaveBeenCalledTimes(2);
  });

  it("preserves the primary score when the adversarial pass fails", async () => {
    await fixture.db
      .update(uploadedDocumentTable)
      .set({ textContent: "Passport evidence", extractionStatus: "completed" });
    mockGemini.mockReset();
    mockGemini.mockResolvedValueOnce(
      JSON.stringify({
        status: "ok",
        score: 98,
        feedback: "Valid passport",
        confidence: 95,
        issues: [],
        strengths: [],
      }),
    );
    mockGemini.mockResolvedValueOnce(
      JSON.stringify({
        overallScore: 80,
        riskLevel: "medium",
        summary: "Needs review",
        redFlags: [],
        strengths: [],
        recommendations: [],
        itemFeedback: {},
      }),
    );
    mockGemini.mockRejectedValueOnce(new Error("Adversarial pass unavailable"));
    await evaluateDocumentsAction({ applicationId, applicantId });
    const saved = (await fixture.db.query.documentEvaluationTable.findMany()).find(
      (row) => row.id !== evaluation.id,
    )!;
    expect(saved).toMatchObject({
      overallScore: 80,
      scoreConfidence: null,
      ensembleDivergence: null,
    });
    expect(mockGemini).toHaveBeenCalledTimes(3);
    expect(mockGemini.mock.calls[2][0].userContent).toBe(mockGemini.mock.calls[1][0].userContent);
    expect(mockGemini.mock.calls[2][0].systemPrompt).toContain("skeptical");
  });

  it("rejects incomplete reviews and retries the documents after a provider failure", async () => {
    await fixture.db
      .update(uploadedDocumentTable)
      .set({ textContent: "Passport evidence", extractionStatus: "completed" });
    const [bankItem] = await fixture.db
      .insert(checklistItemTable)
      .values({
        applicationId,
        applicantId,
        documentName: "Bank statement",
        description: "Recent funds",
        isRequired: true,
      })
      .returning();
    const [bankDocument] = await fixture.db
      .insert(uploadedDocumentTable)
      .values({
        applicationId,
        applicantId,
        checklistItemId: bankItem.id,
        fileName: "bank.pdf",
        fileKey: "bank",
        fileSize: 100,
        mimeType: "application/pdf",
        textContent: "Bank evidence",
        extractionStatus: "completed",
      })
      .returning();
    let hasFailed = false;
    mockGemini.mockReset();
    mockGemini.mockImplementation(async (input: { schemaName: string; userContent: string }) => {
      if (input.schemaName === "orchestrator_evaluation") {
        return JSON.stringify({
          overallScore: 98,
          riskLevel: "low",
          summary: "Review",
          redFlags: [],
          strengths: [],
          recommendations: [],
          itemFeedback: {},
        });
      }
      if (input.userContent.includes("Bank evidence") && !hasFailed) {
        hasFailed = true;
        throw new Error("Temporary bank document failure");
      }
      return JSON.stringify({
        status: "ok",
        score: 98,
        feedback: "Valid evidence",
        confidence: 95,
        issues: [],
        strengths: [],
      });
    });
    await expect(evaluateDocumentsAction({ applicationId, applicantId })).rejects.toThrow(
      "could not evaluate",
    );
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(1);
    expect(
      mockGemini.mock.calls.every(([input]) => input.schemaName === "per_document_evaluation"),
    ).toBe(true);
    mockGemini.mockClear();
    await evaluateDocumentsAction({ applicationId, applicantId });
    const documentCalls = mockGemini.mock.calls.filter(
      ([input]) => input.schemaName === "per_document_evaluation",
    );
    expect(documentCalls).toHaveLength(2);
    expect(documentCalls.some(([input]) => input.userContent.includes("Bank evidence"))).toBe(true);
    const complete = (await fixture.db.query.documentEvaluationTable.findMany()).find(
      (row) => row.id !== evaluation.id,
    );
    expect(complete?.docSnapshots?.[bankItem.id]).toContain(bankDocument.id);
    expect(complete?.docSnapshots?.[itemId]).toContain(documentId);
  });

  it("does not save a new review when every document provider call fails", async () => {
    await fixture.db
      .update(uploadedDocumentTable)
      .set({ textContent: "Passport document text", extractionStatus: "completed" });
    mockGemini.mockReset();
    mockGemini.mockRejectedValue(new Error("Provider unavailable"));
    await expect(evaluateDocumentsAction({ applicationId, applicantId })).rejects.toThrow(
      "could not evaluate",
    );
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(1);
  });

  it("saves the full checklist in order", async () => {
    await prepareChecklistGeneration(
      Array.from({ length: 25 }, (_, index) => ({
        documentName: `Document ${index}`,
        description: "Requirement",
        commonMistakes: "Check validity",
        isRequired: index < 20,
      })),
    );
    await generateChecklistAction({ applicationId, applicantId });
    const items = await fixture.db.query.checklistItemTable.findMany({
      orderBy: checklistItemTable.sortOrder,
    });
    expect(items).toHaveLength(25);
    expect(items.map((item) => item.sortOrder)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
    expect(items[0].isRequired).toBe(true);
    expect(items[24].isRequired).toBe(false);
    expect(mockPermission).toHaveBeenCalledWith(applicationId, "access_application");
  });

  it("saves one checklist when generation requests overlap", async () => {
    await prepareChecklistGeneration([
      { documentName: "Passport", description: "Valid passport" },
      { documentName: "Bank statement", description: "Recent statement" },
      { documentName: "Travel plan", description: "Trip details" },
    ]);
    const response = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                { documentName: "Passport", description: "Valid passport" },
                { documentName: "Bank statement", description: "Recent statement" },
                { documentName: "Travel plan", description: "Trip details" },
              ],
            }),
          },
        },
      ],
    };
    mockOpenAI.mockReset();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockOpenAI.mockImplementation(async () => {
      if (++calls === 2) release();
      await gate;
      return response;
    });
    const [first, second] = await Promise.all([
      generateChecklistAction({ applicationId, applicantId }),
      generateChecklistAction({ applicationId, applicantId }),
    ]);
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(3);
    // The action wrapper is mocked to return the handler data directly.
    expect(first).toEqual(second);
  });

  it("keeps the saved citations when a slower generation loses the save", async () => {
    const items = [
      { documentName: "Passport", description: "Valid passport" },
      { documentName: "Bank statement", description: "Recent statement" },
      { documentName: "Travel plan", description: "Trip details" },
    ];
    await prepareChecklistGeneration(items);
    mockPerplexity
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Research A" } }],
        citations: ["https://example.gov/a"],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Research B" } }],
        citations: ["https://example.gov/b"],
      });
    const response = { choices: [{ message: { content: JSON.stringify({ items }) } }] };
    let enteredSecond!: () => void;
    let finishSecond!: () => void;
    const secondEntered = new Promise<void>((resolve) => {
      enteredSecond = resolve;
    });
    const secondCanFinish = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    mockOpenAI.mockReset();
    mockOpenAI
      .mockImplementationOnce(async () => {
        await secondEntered;
        return response;
      })
      .mockImplementationOnce(async () => {
        enteredSecond();
        await secondCanFinish;
        return response;
      });
    const first = generateChecklistAction({ applicationId, applicantId });
    const second = generateChecklistAction({ applicationId, applicantId });
    await first;
    const before = await fixture.db.query.visaApplicationTable.findFirst();
    finishSecond();
    await second;
    const after = await fixture.db.query.visaApplicationTable.findFirst();
    expect(before?.checklistCitations).toEqual(["https://example.gov/a"]);
    expect(after?.checklistCitations).toEqual(before?.checklistCitations);
    expect(after?.checklistGeneratedAt).toEqual(before?.checklistGeneratedAt);
  });

  it("keeps an existing checklist and its uploads", async () => {
    await generateChecklistAction({ applicationId, applicantId });
    expect(mockOpenAI).not.toHaveBeenCalled();
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(1);
    expect(await fixture.db.query.uploadedDocumentTable.findMany()).toHaveLength(1);
  });

  it("rejects a checklist that has fewer than three distinct requirements", async () => {
    await prepareChecklistGeneration(
      Array.from({ length: 3 }, () => ({
        documentName: "Passport",
        description: "Valid passport",
        isRequired: true,
      })),
    );
    await expect(generateChecklistAction({ applicationId, applicantId })).rejects.toThrow(
      /checklist/i,
    );
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(0);
  });

  it("rejects malformed AI requirements before it saves anything", async () => {
    await prepareChecklistGeneration([null, { documentName: 123 }, { documentName: "Passport" }]);
    await expect(generateChecklistAction({ applicationId, applicantId })).rejects.toThrow(
      /checklist/i,
    );
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(0);
  });

  it("does not leave checklist rows when the insert fails", async () => {
    await prepareChecklistGeneration(
      Array.from({ length: 10 }, (_, index) => ({
        documentName: `Document ${index}`,
        description: "Requirement",
        isRequired: true,
      })),
    );
    fixture.setBeforeQuery((query) => {
      if (query.startsWith('insert into "checklist_item"')) throw new Error("write failed");
    });
    await expect(generateChecklistAction({ applicationId, applicantId })).rejects.toThrow();
    fixture.setBeforeQuery();
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(0);
  });

  function evaluationInput() {
    const { id: _id, createdAt: _createdAt, ...values } = evaluation;
    return { ...values, applicantId };
  }

  it("publishes review results, tracked issues, scores, and report state together", async () => {
    await fixture.db
      .insert(clientReportTable)
      .values({ applicationId, status: "ready", summary: "Old report", actionItems: [] });
    const published = await publishAgencyReview({
      ...context(),
      evaluation: { ...evaluationInput(), overallScore: 60, redFlags: ["Name does not match"] },
    });
    expect(published.overallScore).toBe(60);
    expect((await fixture.db.query.reviewIssueTable.findFirst())?.title).toBe(
      "Name does not match",
    );
    expect(await fixture.db.query.visaApplicationTable.findFirst()).toMatchObject({
      readinessScore: 60,
      agencyStatus: "in_review",
      clientReportStatus: "draft",
    });
    expect((await fixture.db.query.applicantTable.findFirst())?.readinessScore).toBe(60);
    expect((await fixture.db.query.clientReportTable.findFirst())?.status).toBe("draft");
  });

  it("does not publish an evaluation if its issue or score writes fail", async () => {
    fixture.setBeforeQuery((query) => {
      if (query.startsWith('update "applicant"')) throw new Error("score write failed");
    });
    await expect(
      publishAgencyReview({
        ...context(),
        evaluation: { ...evaluationInput(), redFlags: ["New finding"] },
      }),
    ).rejects.toThrow();
    fixture.setBeforeQuery();
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(1);
    expect(await fixture.db.query.reviewIssueTable.findMany()).toHaveLength(0);
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.readinessScore).toBeNull();
  });

  it("does not publish a review against a corrected document", async () => {
    await fixture.db.insert(uploadedDocumentTable).values({
      applicationId,
      applicantId,
      checklistItemId: itemId,
      fileName: "fixed.pdf",
      fileKey: "fixed",
      fileSize: 100,
      mimeType: "application/pdf",
    });
    await expect(
      publishAgencyReview({ ...context(), evaluation: evaluationInput() }),
    ).rejects.toThrow("documents changed");
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(1);
    expect(await fixture.db.query.reviewIssueTable.findMany()).toHaveLength(0);
  });

  it("reopens a dismissed finding when the evidence changes", async () => {
    evaluation = await saveEvaluation({ redFlags: ["Check name spelling"] });
    await sync();
    await fixture.db.update(reviewIssueTable).set({ status: "dismissed", resolvedAt: new Date() });
    const [replacement] = await fixture.db
      .insert(uploadedDocumentTable)
      .values({
        applicationId,
        applicantId,
        checklistItemId: itemId,
        fileName: "fixed.pdf",
        fileKey: "fixed",
        fileSize: 100,
        mimeType: "application/pdf",
      })
      .returning();
    documentId = replacement.id;
    evaluation = await saveEvaluation({ redFlags: ["Check name spelling"] });
    await sync();
    expect(await fixture.db.query.reviewIssueTable.findFirst()).toMatchObject({
      status: "open",
      resolvedAt: null,
      documentId,
    });
  });

  it.each(["status", "finalize"])(
    "blocks the %s action when review is incomplete",
    async (path) => {
      await fixture.db.delete(documentEvaluationTable);
      const action =
        path === "status"
          ? updateAgencyCaseStatusAction({ applicationId, status: "ready_to_submit" })
          : finalizeReviewAction({ applicationId });
      await expect(action).rejects.toThrow("current documents");
      expect((await fixture.db.query.visaApplicationTable.findFirst())?.agencyStatus).not.toBe(
        "ready_to_submit",
      );
    },
  );

  it("generates a current report without silently marking the case ready", async () => {
    await publishAgencyReview({ ...context(), evaluation: evaluationInput() });
    await generateClientReportAction({ applicationId });
    expect((await fixture.db.query.clientReportTable.findFirst())?.status).toBe("ready");
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.agencyStatus).toBe(
      "in_review",
    );
  });

  it("rejects report generation when a replacement arrives after review validation", async () => {
    let caseReads = 0;
    fixture.setBeforeQuery(async (query) => {
      if (!query.startsWith("select") || !query.includes('from "visa_application"')) return;
      caseReads++;
      if (caseReads !== 2) return;
      fixture.setBeforeQuery();
      await fixture.db.insert(uploadedDocumentTable).values({
        applicationId,
        applicantId,
        checklistItemId: itemId,
        fileName: "replacement.pdf",
        fileKey: "replacement",
        fileSize: 100,
        mimeType: "application/pdf",
      });
      await invalidateAgencyReview({ db: fixture.db, applicationId });
    });
    await expect(generateClientReportAction({ applicationId })).rejects.toThrow("case changed");
    expect(await fixture.db.query.clientReportTable.findMany()).toHaveLength(0);
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.clientReportStatus).toBe(
      "draft",
    );
  });

  it("rolls back a recipient edit when delivery starts between the report and case reads", async () => {
    await generateClientReportAction({ applicationId });
    const report = (await fixture.db.query.clientReportTable.findFirst())!;
    const before = await fixture.db.query.visaApplicationTable.findFirst();
    fixture.setBeforeQuery(async (query) => {
      if (!query.startsWith("select") || !query.includes('from "visa_application"')) return;
      fixture.setBeforeQuery();
      await fixture.pool.query(
        `UPDATE client_report SET status = 'sending', "deliveryKey" = 'concurrent/claim', "updateCounter" = COALESCE("updateCounter", 0) + 1 WHERE id = $1`,
        [report.id],
      );
      await fixture.pool.query(
        'UPDATE visa_application SET "updateCounter" = COALESCE("updateCounter", 0) + 1 WHERE id = $1',
        [applicationId],
      );
    });
    await expect(
      updateClientReportRecipient({ reportId: report.id, email: "other@example.com" }),
    ).rejects.toThrow("delivery has started");
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.clientEmail).toBe(
      before?.clientEmail,
    );
    expect((await fixture.db.query.clientReportTable.findFirst())?.status).toBe("sending");
  });

  it("does not save a new issue if clearing readiness fails", async () => {
    await markAgencyCaseReady(context());
    fixture.setBeforeQuery((query) => {
      if (query.startsWith('update "visa_application"')) throw new Error("case write failed");
    });
    await expect(
      addReviewIssueAction({
        applicationId,
        title: "Check bank statement",
        description: "Check bank statement",
        severity: "high",
        clientVisible: true,
      }),
    ).rejects.toThrow();
    fixture.setBeforeQuery();
    expect(await fixture.db.query.reviewIssueTable.findMany()).toHaveLength(0);
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.agencyStatus).toBe(
      "ready_to_submit",
    );
  });

  it("does not reopen an issue if clearing readiness fails", async () => {
    const issue = await addIssue({ status: "dismissed" });
    await markAgencyCaseReady(context());
    fixture.setBeforeQuery((query) => {
      if (query.startsWith('update "visa_application"')) throw new Error("case write failed");
    });
    await expect(
      updateReviewIssueStatusAction({ issueId: issue.id, status: "open" }),
    ).rejects.toThrow();
    fixture.setBeforeQuery();
    expect((await fixture.db.query.reviewIssueTable.findFirst())?.status).toBe("dismissed");
  });

  it("marks a complete case ready", async () => {
    await markAgencyCaseReady(context());
    const application = await fixture.db.query.visaApplicationTable.findFirst();
    expect(application).toMatchObject({ agencyStatus: "ready_to_submit", status: "ready" });
    expect(application?.reviewCompletedAt).toBeInstanceOf(Date);
  });

  it("blocks an empty checklist", async () => {
    await fixture.db.delete(uploadedDocumentTable);
    await fixture.db.delete(checklistItemTable);
    await expect(markAgencyCaseReady(context())).rejects.toThrow("checklist first");
  });

  it("blocks missing review results", async () => {
    await fixture.db.delete(documentEvaluationTable);
    await expect(markAgencyCaseReady(context())).rejects.toThrow("current documents");
  });

  it("blocks a required document even when its AI issue was dismissed", async () => {
    await fixture.db.delete(uploadedDocumentTable);
    evaluation = await saveEvaluation({
      docSnapshots: { [itemId]: "missing" },
      itemFeedback: {
        [itemId]: { status: "missing", hasDocument: false, feedback: "Upload passport" },
      },
    });
    await sync();
    await fixture.db.update(reviewIssueTable).set({ status: "dismissed" });
    await expect(markAgencyCaseReady(context())).rejects.toThrow("required documents");
  });

  it.each(["open", "client_requested"] as const)("blocks %s reviewer issues", async (status) => {
    await addIssue({ status, severity: "low" });
    await expect(markAgencyCaseReady(context())).rejects.toThrow("all open issues");
  });

  it("creates tracked findings once and shows them in case counts", async () => {
    evaluation = await saveEvaluation({
      redFlags: ["Name does not match"],
      itemFeedback: {
        [itemId]: {
          status: "needs_review",
          score: 60,
          hasDocument: true,
          feedback: "Replace passport",
          issues: ["Expired passport"],
        },
      },
    });
    expect(await sync()).toEqual({ createdCount: 2 });
    expect(await sync()).toEqual({ createdCount: 0 });
    expect(await fixture.db.query.reviewIssueTable.findMany()).toHaveLength(2);
    expect((await getAgencyCaseRows())[0].openIssueCount).toBe(2);
    await expect(markAgencyCaseReady(context())).rejects.toThrow("all open issues");
  });

  it("preserves a reviewer decision for unchanged evidence", async () => {
    evaluation = await saveEvaluation({ redFlags: ["Check name spelling"] });
    await sync();
    await fixture.db.update(reviewIssueTable).set({ status: "dismissed", resolvedAt: new Date() });
    await markAgencyCaseReady(context());
    expect((await fixture.db.query.reviewIssueTable.findFirst())?.status).toBe("dismissed");
  });

  it.each([
    { cleared: false, nullableCounter: false },
    { cleared: true, nullableCounter: false },
    { cleared: false, nullableCounter: true },
    { cleared: true, nullableCounter: true },
  ])(
    "preserves a concurrent reviewer decision ($cleared, nullable counter: $nullableCounter)",
    async ({ cleared, nullableCounter }) => {
      evaluation = await saveEvaluation({ redFlags: ["Check name spelling"] });
      await sync();
      if (nullableCounter) await fixture.db.update(reviewIssueTable).set({ updateCounter: null });
      const original = (await fixture.db.query.reviewIssueTable.findFirst())!;
      if (cleared) evaluation = await saveEvaluation();
      const resolvedAt = new Date("2026-10-19T12:00:00Z");
      fixture.setBeforeQuery(async (query) => {
        if (!query.startsWith('update "review_issue"')) return;
        fixture.setBeforeQuery();
        await fixture.pool.query(
          'UPDATE review_issue SET status = $1, "resolvedAt" = $2, "updateCounter" = "updateCounter" + 1 WHERE id = $3',
          ["dismissed", resolvedAt, original.id],
        );
      });
      await sync();
      expect(await fixture.db.query.reviewIssueTable.findFirst()).toMatchObject({
        status: "dismissed",
        resolvedAt,
      });
    },
  );

  it("preserves a reviewer-confirmed resolution for unchanged evidence", async () => {
    evaluation = await saveEvaluation({ redFlags: ["Check name spelling"] });
    await sync();
    const issue = await fixture.db.query.reviewIssueTable.findFirst();
    await updateReviewIssueStatusAction({ issueId: issue!.id, status: "resolved" });
    await markAgencyCaseReady(context());
    expect((await fixture.db.query.reviewIssueTable.findFirst())?.status).toBe("resolved");
  });

  it("resolves old AI findings and keeps manual issues", async () => {
    evaluation = await saveEvaluation({ redFlags: ["Check name spelling"] });
    await sync();
    await addIssue();
    evaluation = await saveEvaluation();
    await sync();
    const issues = await fixture.db.query.reviewIssueTable.findMany();
    expect(issues.find((issue) => issue.source === "ai")?.status).toBe("resolved");
    expect(issues.find((issue) => issue.source === "reviewer")?.status).toBe("open");
  });

  it("reopens an AI finding if it returns after the AI cleared it", async () => {
    evaluation = await saveEvaluation({ redFlags: ["Check name spelling"] });
    await sync();
    evaluation = await saveEvaluation();
    await sync();
    expect((await fixture.db.query.reviewIssueTable.findFirst())?.status).toBe("resolved");
    evaluation = await saveEvaluation({ redFlags: ["Check name spelling"] });
    await sync();
    expect((await fixture.db.query.reviewIssueTable.findFirst())?.status).toBe("open");
    await expect(markAgencyCaseReady(context())).rejects.toThrow("all open issues");
  });

  it("selects a corrected upload when both uploads have the same timestamp", async () => {
    const [replacement] = await fixture.db
      .insert(uploadedDocumentTable)
      .values({
        applicationId,
        applicantId,
        checklistItemId: itemId,
        fileName: "fixed.pdf",
        fileKey: "fixed",
        fileSize: 100,
        mimeType: "application/pdf",
        uploadedAt: new Date("2026-09-19T00:00:00Z"),
      })
      .returning();
    const documents = await fixture.db.query.uploadedDocumentTable.findMany({
      orderBy: newestDocumentOrder,
    });
    expect(documents[0].id).toBe(replacement.id);
    expect(
      isEvaluationCurrent({
        evaluation,
        checklistItems: await fixture.db.query.checklistItemTable.findMany(),
        documents,
      }),
    ).toBe(false);
    expect((await getAgencyCaseDetail(applicationId)).latestEvaluation).toBeNull();
    expect((await getAgencyCaseRows())[0].latestEvaluation).toBeNull();
    await expect(markAgencyCaseReady(context())).rejects.toThrow("current documents");
  });

  it("clears readiness and marks an old report out of date", async () => {
    await markAgencyCaseReady(context());
    await fixture.db
      .insert(clientReportTable)
      .values({ applicationId, status: "ready", summary: "Ready", actionItems: [] });
    await fixture.db
      .update(visaApplicationTable)
      .set({ readinessScore: 95, riskLevel: "low", clientReportStatus: "ready" });
    await invalidateAgencyReview(context());
    expect(await fixture.db.query.visaApplicationTable.findFirst()).toMatchObject({
      agencyStatus: "in_review",
      status: "in_progress",
      readinessScore: null,
      riskLevel: null,
      reviewCompletedAt: null,
      clientReportStatus: "draft",
    });
    expect((await fixture.db.query.clientReportTable.findFirst())?.status).toBe("draft");
    expect((await getAgencyReports()).reports[0].report.isStale).toBe(true);
  });

  it("keeps the original sent report as history while marking it out of date", async () => {
    await fixture.db.insert(clientReportTable).values({
      applicationId,
      status: "sent",
      summary: "Sent",
      actionItems: [],
      sentAt: new Date(),
    });
    await fixture.db.update(visaApplicationTable).set({ clientReportStatus: "sent" });
    await invalidateAgencyReports(context());
    expect((await fixture.db.query.clientReportTable.findFirst())?.status).toBe("sent");
    expect((await getAgencyReports()).reports[0].report.isStale).toBe(true);
    expect((await getAgencyReports()).stats.sent).toBe(0);
  });

  it("rolls back invalidation if one database write fails", async () => {
    await markAgencyCaseReady(context());
    await fixture.db
      .update(visaApplicationTable)
      .set({ readinessScore: 95, riskLevel: "low", clientReportStatus: "ready" });
    await fixture.db
      .insert(clientReportTable)
      .values({ applicationId, status: "ready", summary: "Ready", actionItems: [] });
    fixture.setBeforeQuery((query) => {
      if (query.startsWith('update "applicant"')) throw new Error("write failed");
    });
    await expect(invalidateAgencyReview(context())).rejects.toThrow();
    fixture.setBeforeQuery();
    expect(await fixture.db.query.visaApplicationTable.findFirst()).toMatchObject({
      agencyStatus: "ready_to_submit",
      readinessScore: 95,
      clientReportStatus: "ready",
    });
  });

  it("rolls back issue synchronization if a finding cannot be saved", async () => {
    evaluation = await saveEvaluation({ redFlags: ["First finding", "Second finding"] });
    let writes = 0;
    fixture.setBeforeQuery((query) => {
      if (query.startsWith('insert into "review_issue"') && ++writes === 2)
        throw new Error("issue write failed");
    });
    await expect(sync()).rejects.toThrow();
    fixture.setBeforeQuery();
    expect(await fixture.db.query.reviewIssueTable.findMany()).toHaveLength(0);
  });

  it("does not overwrite a case change while readiness is checked", async () => {
    let changed = false;
    fixture.setBeforeQuery(async (query) => {
      if (!changed && query.startsWith("select") && query.includes("review_issue")) {
        changed = true;
        await fixture.pool.query(
          'UPDATE "visa_application" SET "updateCounter" = "updateCounter" + 1',
        );
      }
    });
    await expect(markAgencyCaseReady(context())).rejects.toThrow("case changed");
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.agencyStatus).not.toBe(
      "ready_to_submit",
    );
  });
});

describe("document upload sequence migration", () => {
  it("preserves existing rows and assigns later uploads a larger sequence", async () => {
    vi.stubEnv("DB_SQL_LOG", "false");
    const fixture = await createDatabase({ lastMigration: "0001" });
    try {
      const [user] = await fixture.db
        .insert(userTable)
        .values({ email: "migration@example.com" })
        .returning();
      const [application] = await fixture.db
        .insert(visaApplicationTable)
        .values({
          userId: user.id,
          clientId: "client",
          clientName: "Client",
          homeCountry: "Bangladesh",
          currentCountry: "Bangladesh",
          destinationCountry: "Japan",
          visaType: "Tourist",
          embassy: "Dhaka",
        })
        .returning();
      const [applicant] = await fixture.db
        .insert(applicantTable)
        .values({ applicationId: application.id, name: "Applicant", relationship: "primary" })
        .returning();
      const [item] = await fixture.db
        .insert(checklistItemTable)
        .values({
          applicationId: application.id,
          applicantId: applicant.id,
          documentName: "Passport",
          description: "Valid passport",
        })
        .returning();
      // Seed the old schema directly because uploadSequence does not exist yet.
      for (const id of ["old_a", "old_b"]) {
        await fixture.pool.query(
          `INSERT INTO uploaded_document
          (id, "applicationId", "applicantId", "checklistItemId", "fileName", "fileKey", "fileSize", "mimeType", "uploadedAt", "textContent")
          VALUES ($1, $2, $3, $4, 'passport.pdf', $1, 100, 'application/pdf', '2026-09-19T00:00:00Z', 'Original evidence')`,
          [id, application.id, applicant.id, item.id],
        );
      }
      const before = (await fixture.pool.query("SELECT * FROM uploaded_document ORDER BY id")).rows;
      await fixture.pool.query(
        readFileSync(
          new URL("../db/postgres-migrations/0002_document_upload_order.sql", import.meta.url),
          "utf8",
        ),
      );
      const after = await fixture.db.query.uploadedDocumentTable.findMany({
        orderBy: uploadedDocumentTable.id,
      });
      expect(after.map(({ uploadSequence: _uploadSequence, ...row }) => row)).toEqual(before);
      expect(new Set(after.map((row) => row.uploadSequence)).size).toBe(2);
      expect(after.every((row) => row.uploadSequence > 0)).toBe(true);
      const [newDocument] = await fixture.db
        .insert(uploadedDocumentTable)
        .values({
          applicationId: application.id,
          applicantId: applicant.id,
          checklistItemId: item.id,
          fileName: "corrected.pdf",
          fileKey: "new",
          fileSize: 100,
          mimeType: "application/pdf",
          uploadedAt: new Date("2026-09-19T00:00:00Z"),
        })
        .returning();
      expect(newDocument.uploadSequence).toBeGreaterThan(
        Math.max(...after.map((row) => row.uploadSequence)),
      );
      const ordered = await fixture.db.query.uploadedDocumentTable.findMany({
        orderBy: newestDocumentOrder,
      });
      expect(ordered[0].id).toBe(newDocument.id);
      expect(ordered[0].applicantId).toBe(applicant.id);
      expect(ordered[0].checklistItemId).toBe(item.id);
    } finally {
      await fixture.close();
      vi.unstubAllEnvs();
    }
  });
});
