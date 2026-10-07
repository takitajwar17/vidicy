import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDB, mockPermission, mockOpenAI, mockPerplexity } = vi.hoisted(() => ({
  mockGetDB: vi.fn(),
  mockPermission: vi.fn(),
  mockOpenAI: vi.fn(),
  mockPerplexity: vi.fn(),
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
vi.mock("@/utils/email", () => ({ sendAgencyTeamAccessEmail: vi.fn() }));
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
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: {} }) }));
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
  finalizeReviewAction,
  generateClientReportAction,
  updateAgencyCaseStatusAction,
  updateReviewIssueStatusAction,
} from "@/actions/agency-case.action";
import { generateChecklistAction } from "@/actions/checklist.action";
import { getDBFromDatabase } from "@/db";
import {
  agencyTeamMemberTable,
  applicantTable,
  checklistItemTable,
  clientReportTable,
  documentEvaluationTable,
  reviewIssueTable,
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

interface SqliteConnection {
  exec: (query: string) => void;
  close: () => void;
  prepare: (query: string) => {
    all: (...params: unknown[]) => Record<string, unknown>[];
    run: (...params: unknown[]) => { changes: number };
  };
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => SqliteConnection;
};

// Execute the actual D1 driver's SQL against SQLite and the checked-in migrations.
// The adapter also enforces D1's 100-parameter limit and atomic batch behavior.
function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  const migrationDirectory = new URL("../db/migrations/", import.meta.url);
  for (const file of readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(new URL(file, migrationDirectory), "utf8"));
  }
  let beforeQuery: ((query: string) => void) | undefined;
  // D1 bind() returns the prepared statement, including its result methods.
  function prepared(query: string) {
    let params: unknown[] = [];
    const statement = {
      bind: (...values: unknown[]) => {
        params = values;
        return statement;
      },
      all: async () => {
        beforeQuery?.(query);
        checkParameters();
        return { success: true, results: sqlite.prepare(query).all(...params) };
      },
      raw: async () => {
        beforeQuery?.(query);
        checkParameters();
        return sqlite
          .prepare(query)
          .all(...params)
          .map((row) => Object.values(row));
      },
      run: async () => {
        beforeQuery?.(query);
        checkParameters();
        return { success: true, results: [], meta: sqlite.prepare(query).run(...params) };
      },
    };
    function checkParameters() {
      if (params.length > 100) throw new Error(`Too many SQL variables: ${params.length}`);
    }
    return statement;
  }
  const binding = {
    prepare: prepared,
    batch: async (statements: ReturnType<typeof prepared>[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return {
    db: getDBFromDatabase(binding),
    sqlite,
    setBeforeQuery: (callback?: (query: string) => void) => {
      beforeQuery = callback;
    },
  };
}

describe("agency review workflow with the real database driver", () => {
  let fixture: ReturnType<typeof createDatabase>;
  let userId: string;
  let applicationId: string;
  let applicantId: string;
  let itemId: string;
  let documentId: string;
  let evaluation: typeof documentEvaluationTable.$inferSelect;

  beforeEach(async () => {
    vi.stubEnv("DB_SQL_LOG", "false");
    fixture = createDatabase();
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
  afterEach(() => {
    fixture.sqlite.close();
    vi.unstubAllEnvs();
  });

  async function saveEvaluation(
    overrides: Partial<typeof documentEvaluationTable.$inferInsert> = {},
  ) {
    const [saved] = await fixture.db
      .insert(documentEvaluationTable)
      .values({
        applicationId,
        applicantId,
        overallScore: 95,
        riskLevel: "low",
        summary: "Reviewed",
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

  it("generates the full checklist within the D1 parameter limit", async () => {
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

  it("does not leave half a checklist if a batch insert fails", async () => {
    await prepareChecklistGeneration(
      Array.from({ length: 10 }, (_, index) => ({
        documentName: `Document ${index}`,
        description: "Requirement",
        isRequired: true,
      })),
    );
    let writes = 0;
    fixture.setBeforeQuery((query) => {
      if (query.startsWith('insert into "checklist_item"') && ++writes === 2)
        throw new Error("write failed");
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
    fixture.setBeforeQuery((query) => {
      if (!changed && query.startsWith("select") && query.includes("review_issue")) {
        changed = true;
        fixture.sqlite.exec(`UPDATE visa_application SET updateCounter = updateCounter + 1`);
      }
    });
    await expect(markAgencyCaseReady(context())).rejects.toThrow("case changed");
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.agencyStatus).not.toBe(
      "ready_to_submit",
    );
  });
});
