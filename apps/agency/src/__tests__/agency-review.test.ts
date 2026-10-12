import { randomUUID } from "node:crypto";
import * as reviewPipeline from "@/lib/review-pipeline-version";
import { eq } from "drizzle-orm";
import { startTestPostgres } from "./helpers/postgres";
import { currentReviewMetadata } from "./helpers/workflow-fixture";
import {
  buildReviewContextHash,
  buildReviewRouteContext,
  loadReviewSnapshot,
} from "@/server/review-context";
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
  mockChecklistCacheGet,
  mockChecklistCachePut,
} = vi.hoisted(() => ({
  mockGetDB: vi.fn(),
  mockPermission: vi.fn(),
  mockOpenAI: vi.fn(),
  mockPerplexity: vi.fn(),
  mockGemini: vi.fn(),
  mockStorageHead: vi.fn(),
  mockStorageDelete: vi.fn(),
  mockExtractTextFromPdf: vi.fn(),
  mockChecklistCacheGet: vi.fn(),
  mockChecklistCachePut: vi.fn(),
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
  requireAgencyStaff: async () => {
    const session = await mockPermission();
    return { session, staff: session.staff };
  },
  requireAgencyAdmin: async () => {
    const session = await mockPermission();
    return { session, staff: session.staff };
  },
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
vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: () => ({
    env: { APP_KV: { get: mockChecklistCacheGet, put: mockChecklistCachePut } },
  }),
}));
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
import { runAgencyEvaluation } from "@/services/agency-evaluation";
import { processReviewJob } from "@/server/review-jobs";
import { generateChecklist as generateChecklistAction } from "@/services/checklist-generation";
import { getDBFromDatabase } from "@/db";
import {
  agencyTable,
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
  reviewJobTable,
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
import {
  getAgencyCaseDetail,
  getAgencyCaseRows,
  getAgencyReports,
  getAgencyClientsWithCounts,
  getAgencyDashboardData,
} from "@/server/agency-data";
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
  // The historical tests isolate other migration contracts; current checklist
  // columns are still needed by the current ORM used by those fixtures.
  if (lastMigration && lastMigration < "0011")
    await pool.query(
      readFileSync(new URL("0011_checklist_workflow_states.sql", migrationDirectory), "utf8"),
    );
  if (lastMigration && lastMigration < "0012")
    await pool.query(
      readFileSync(new URL("0012_client_request_states.sql", migrationDirectory), "utf8"),
    );
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
  let agencyId: string;
  let applicationId: string;
  let applicantId: string;
  let itemId: string;
  let documentId: string;
  let evaluation: typeof documentEvaluationTable.$inferSelect;
  let lastEvaluationTime = 0;

  beforeEach(async () => {
    vi.stubEnv("DB_SQL_LOG", "false");
    mockChecklistCacheGet.mockReset().mockResolvedValue(null);
    mockChecklistCachePut.mockReset().mockResolvedValue(undefined);
    lastEvaluationTime = 0;
    fixture = await createDatabase();
    const { db } = fixture;
    mockGetDB.mockReturnValue(db);
    const [user] = await db.insert(userTable).values({ email: "reviewer@example.com" }).returning();
    userId = user.id;
    const [agency] = await db
      .insert(agencyTable)
      .values({ ownerUserId: userId, name: "Test agency" })
      .returning();
    agencyId = agency.id;
    mockPermission.mockResolvedValue({ userId, staff: { agencyId, role: "admin", isAdmin: true } });
    mockPerplexity.mockResolvedValue({
      choices: [{ message: { content: "Official requirements" } }],
      citations: [],
    });
    mockOpenAI.mockReset();
    await db
      .insert(agencyTeamMemberTable)
      .values({ agencyId, userId, email: "reviewer@example.com", role: "admin", status: "active" });
    const [application] = await db
      .insert(visaApplicationTable)
      .values({
        userId,
        agencyId,
        clientId: "client",
        clientName: "Client",
        homeCountry: "Bangladesh",
        currentCountry: "Bangladesh",
        destinationCountry: "Japan",
        visaType: "Short-Stay Tourist",
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
        extractionStatus: "completed",
        textContent: "Readable synthetic passport evidence",
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
    vi.restoreAllMocks();
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
        ...(await currentReviewMetadata({ db: fixture.db, applicationId, applicantId })),
        overallScore: 95,
        reviewStatus: "complete",
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

  it("marks a current case ready without a separate rule-approval block", async () => {
    await markAgencyCaseReady(context());
    expect(await fixture.db.query.visaApplicationTable.findFirst()).toMatchObject({
      agencyStatus: "ready_to_submit",
      status: "ready",
    });
  });

  it("keeps legacy scores hidden while allowing current reviews to be marked ready", async () => {
    await fixture.db.update(visaApplicationTable).set({
      agencyStatus: "ready_to_submit",
      status: "ready",
      readinessScore: 99,
      riskLevel: "low",
    });
    await fixture.db.update(applicantTable).set({ readinessScore: 99, riskLevel: "low" });
    const [row] = await getAgencyCaseRows();
    expect(row.application).toMatchObject({
      readinessScore: null,
      riskLevel: null,
      agencyStatus: "ready_to_submit",
    });
    expect(row.primaryApplicant?.readinessScore).toBeNull();
    expect(row.canSubmit).toBe(true);
    const detail = await getAgencyCaseDetail(applicationId);
    expect(detail.application.agencyStatus).toBe("ready_to_submit");
    expect(detail.canSubmit).toBe(true);
    expect(detail.primaryApplicant?.readinessScore).toBeNull();
    expect(detail.applicants[0].readinessScore).toBeNull();
  });

  it("treats malformed stored evidence version JSON as stale", async () => {
    await fixture.pool.query(
      'UPDATE document_evaluation SET "docSnapshots" = jsonb_build_object($1::text, 7)',
      [itemId],
    );
    await expect(getAgencyCaseDetail(applicationId)).resolves.toMatchObject({
      latestEvaluation: null,
      isReviewStale: true,
    });
  });

  it("requires a current review for an applicant with no personal checklist rows", async () => {
    await fixture.db.insert(applicantTable).values({
      applicationId,
      name: "Dependent child",
      relationship: "child",
      nationality: "India",
    });
    await expect(generateClientReportAction({ applicationId })).rejects.toThrow(/current/i);
  });

  it("rejects publication after a person's visa history changes", async () => {
    await fixture.db.update(applicantTable).set({ rejectedBefore: true, rejectedYear: "2025" });
    await expect(
      publishAgencyReview({ ...context(), evaluation: evaluationInput() }),
    ).rejects.toThrow(/changed/i);
  });

  it("rejects publication after extraction changes without a replacement upload", async () => {
    await fixture.db.update(uploadedDocumentTable).set({ textContent: "Corrected extraction" });
    await expect(
      publishAgencyReview({ ...context(), evaluation: evaluationInput() }),
    ).rejects.toThrow(/changed/i);
  });

  it("checks route facts for a dependent with no personal checklist or upload", async () => {
    const [child] = await fixture.db
      .insert(applicantTable)
      .values({
        applicationId,
        name: "Dependent",
        relationship: "child",
        nationality: "India",
        dateOfBirth: "2016-04-03",
        rejectedBefore: true,
        rejectedYear: "2025",
      })
      .returning();
    evaluation = await saveEvaluation();
    mockGemini.mockReset().mockResolvedValueOnce(
      JSON.stringify({
        overallScore: 0,
        riskLevel: "medium",
        summary: "No personal evidence supplied",
        redFlags: [],
        strengths: [],
        recommendations: [],
        itemFeedback: {},
      }),
    );
    await expect(
      runAgencyEvaluation({ applicationId, applicantId: child.id, userId }),
    ).rejects.toThrow("checklist");
    expect(mockGemini).not.toHaveBeenCalled();
    await expect(generateClientReportAction({ applicationId })).rejects.toThrow();
  });

  it("tracks shared checklist obligations and avoids duplicate shared issues", async () => {
    const [shared] = await fixture.db
      .insert(checklistItemTable)
      .values({
        applicationId,
        applicantId: null,
        documentName: "Shared itinerary",
        description: "Party itinerary",
        isRequired: true,
      })
      .returning();
    evaluation = await saveEvaluation({
      docSnapshots: { [itemId]: `${documentId}:1:0`, [shared.id]: "missing" },
      itemFeedback: {
        ...evaluation.itemFeedback,
        [shared.id]: { status: "missing", hasDocument: false, feedback: "Supply shared itinerary" },
      },
    });
    await sync();
    await sync();
    const issues = await fixture.db.query.reviewIssueTable.findMany();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ applicantId: null, checklistItemId: shared.id });
    await expect(markAgencyCaseReady(context())).rejects.toThrow("required documents");
  });

  it("rolls back publication when a person's facts change inside the publication transaction", async () => {
    fixture.setBeforeQuery(async (query) => {
      if (!query.startsWith('insert into "document_evaluation"')) return;
      fixture.setBeforeQuery();
      await fixture.pool.query("UPDATE applicant SET nationality = $1 WHERE id = $2", [
        "India",
        applicantId,
      ]);
    });
    await expect(
      publishAgencyReview({ ...context(), evaluation: evaluationInput() }),
    ).rejects.toThrow(/changed/i);
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(1);
    expect(await fixture.db.query.reviewIssueTable.findMany()).toHaveLength(0);
  });

  it("uses each person's recorded facts and hashes the complete party and evidence", async () => {
    await fixture.db.update(applicantTable).set({ nationality: "India", rejectedBefore: true });
    await fixture.db.update(visaApplicationTable).set({
      settings: JSON.stringify({
        routeReview: { facts: { nationality: "Canada", customPredicate: false } },
      }),
    });
    const snapshot = await loadReviewSnapshot({ db: fixture.db, applicationId });
    const routeContext = buildReviewRouteContext({ ...snapshot, applicantId });
    expect(routeContext.facts).toMatchObject({
      nationality: "India",
      rejectedBefore: true,
      customPredicate: false,
      partySize: 1,
    });
    expect(
      buildReviewContextHash({ ...snapshot, documents: [...snapshot.documents].reverse() }),
    ).toBe(snapshot.reviewContextHash);
    expect(
      buildReviewContextHash({
        ...snapshot,
        applicants: snapshot.applicants.map((person) => ({ ...person, rejectedBefore: false })),
      }),
    ).not.toBe(snapshot.reviewContextHash);
    expect(
      buildReviewContextHash({
        ...snapshot,
        application: { ...snapshot.application, trashedAt: new Date() },
      }),
    ).not.toBe(snapshot.reviewContextHash);
    expect(
      buildReviewContextHash({
        ...snapshot,
        application: { ...snapshot.application, agencyId: "different-agency" },
      }),
    ).not.toBe(snapshot.reviewContextHash);
    expect(
      buildReviewContextHash({
        ...snapshot,
        checklistItems: snapshot.checklistItems.map((item) => ({
          ...item,
          requirementType: "recommended" as const,
          isRequired: false,
        })),
      }),
    ).not.toBe(snapshot.reviewContextHash);
    expect(
      buildReviewContextHash({
        ...snapshot,
        documents: snapshot.documents.map((document) => ({
          ...document,
          extractionPayload: { version: "new" },
        })),
      }),
    ).not.toBe(snapshot.reviewContextHash);
  });

  it("retains the saved sponsor relationship without replacing the person's party relationship", async () => {
    const snapshot = await loadReviewSnapshot({ db: fixture.db, applicationId });
    const legacy = buildReviewRouteContext({
      ...snapshot,
      application: {
        ...snapshot.application,
        settings: JSON.stringify({ routeReview: { facts: { relationship: "civil partner" } } }),
      },
      applicantId,
    });
    expect(legacy.facts).toMatchObject({
      relationship: "primary",
      relationshipToSponsor: "civil partner",
      applicant: { relationship: "primary" },
    });
    const renamed = buildReviewRouteContext({
      ...snapshot,
      application: {
        ...snapshot.application,
        settings: JSON.stringify({
          routeReview: { facts: { relationship: "old value", relationshipToSponsor: "spouse" } },
        }),
      },
      applicantId,
    });
    expect(renamed.facts).toMatchObject({
      relationship: "primary",
      relationshipToSponsor: "spouse",
    });
  });

  it("invalidates saved review snapshots when the review pipeline semantics change", async () => {
    const snapshot = await loadReviewSnapshot({ db: fixture.db, applicationId });
    const baseline = buildReviewContextHash(snapshot);
    const identity = reviewPipeline.getReviewPipelineIdentity();
    vi.spyOn(reviewPipeline, "getReviewPipelineIdentity").mockReturnValue({
      ...identity,
      prompts: "route-evidence-prompts-next",
    });
    expect(buildReviewContextHash(snapshot)).not.toBe(baseline);
    expect((await getAgencyCaseDetail(applicationId)).latestEvaluation).toBeNull();
    await expect(generateClientReportAction({ applicationId })).rejects.toThrow(
      /current documents/,
    );
  });
  async function markReadyForTransactionTest() {
    await markAgencyCaseReady(context());
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
  async function refreshGeneratedItems(names: string[]) {
    mockOpenAI.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: names.map((documentName) => ({
                documentName,
                requirement: "required",
                applicability: "applies",
              })),
            }),
          },
        },
      ],
    });
    return generateChecklistAction({ applicationId, applicantId, refreshResearch: true });
  }

  it("retires obsolete legacy generated requirements using saved research IDs", async () => {
    await prepareChecklistGeneration([
      { documentName: "Old evidence", requirement: "required", applicability: "applies" },
    ]);
    await generateChecklistAction({ applicationId, applicantId });
    const original = await fixture.db.query.checklistItemTable.findFirst();
    await fixture.db
      .update(checklistItemTable)
      .set({ origin: null, requirementType: null, applicability: null, isRequired: false });
    await refreshGeneratedItems(["New evidence"]);
    expect(
      (await loadReviewSnapshot({ db: fixture.db, applicationId })).checklistItems.map(
        (item) => item.documentName,
      ),
    ).toEqual(["New evidence"]);
    expect(
      await fixture.db.query.checklistItemTable.findFirst({
        where: eq(checklistItemTable.id, original!.id),
      }),
    ).toMatchObject({ origin: "generated", removedAt: expect.any(Date) });
  });

  it("restores an automatically retired generated requirement with the same ID", async () => {
    await prepareChecklistGeneration([
      { documentName: "Passport", requirement: "required", applicability: "applies" },
    ]);
    await generateChecklistAction({ applicationId, applicantId });
    const original = await fixture.db.query.checklistItemTable.findFirst();
    await refreshGeneratedItems(["Funding"]);
    await refreshGeneratedItems(["Passport"]);
    expect(
      (await loadReviewSnapshot({ db: fixture.db, applicationId })).checklistItems,
    ).toMatchObject([{ id: original!.id, documentName: "Passport", removedAt: null }]);
  });

  it("does not restore a requirement removed by staff", async () => {
    await prepareChecklistGeneration([{ documentName: "Passport" }]);
    await generateChecklistAction({ applicationId, applicantId });
    await fixture.db.update(checklistItemTable).set({ origin: "staff", removedAt: new Date() });
    await refreshGeneratedItems(["Passport"]);
    expect((await loadReviewSnapshot({ db: fixture.db, applicationId })).checklistItems).toEqual(
      [],
    );
  });

  it("filters cases by client and uses the most recent activity across their cases", async () => {
    const [client] = await fixture.db
      .insert(agencyClientTable)
      .values({ agencyId, name: "Activity Client" })
      .returning();
    const [other] = await fixture.db
      .insert(agencyClientTable)
      .values({ agencyId, name: "Other Client" })
      .returning();
    const older = new Date("2026-09-19T00:00:00Z");
    const recent = new Date("2026-10-20T00:00:00Z");
    await fixture.db
      .update(visaApplicationTable)
      .set({ clientId: client.id, createdAt: older, updatedAt: recent })
      .where(eq(visaApplicationTable.id, applicationId));
    const common = {
      userId,
      agencyId,
      homeCountry: "Bangladesh",
      currentCountry: "Bangladesh",
      destinationCountry: "Japan",
      visaType: "Short-Stay Tourist",
      embassy: "Dhaka",
    };
    await fixture.db.insert(visaApplicationTable).values([
      {
        ...common,
        clientId: client.id,
        createdAt: new Date("2026-09-21T00:00:00Z"),
        updatedAt: new Date("2026-09-24T00:00:00Z"),
      },
      { ...common, clientId: other.id },
    ]);
    const cases = await getAgencyCaseRows({ clientId: client.id });
    expect(cases).toHaveLength(2);
    expect(cases.every((row) => row.application.clientId === client.id)).toBe(true);
    const clients = await getAgencyClientsWithCounts();
    expect(clients.find((row) => row.client.id === client.id)?.lastCaseAt).toEqual(recent);
  });

  it("keeps successful extraction when a concurrent attempt fails later", async () => {
    await fixture.db
      .update(uploadedDocumentTable)
      .set({ textContent: null, extractionStatus: "queued" });
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
    visaType: "Short-Stay Tourist",
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

  it("loads case pages with the database schema from before checkpoints", async () => {
    await fixture.pool.query('ALTER TABLE "review_job" DROP COLUMN "checkpoint"');
    const detail = await getAgencyCaseDetail(applicationId);
    expect(detail.application.id).toBe(applicationId);
    const rows = await getAgencyCaseRows();
    expect(rows.some((row) => row.application.id === applicationId)).toBe(true);
  });

  it("blocks reports and readiness while a newer review is pending", async () => {
    await fixture.db.insert(reviewJobTable).values({ applicationId, applicantId, userId });
    await expect(generateClientReportAction({ applicationId })).rejects.toThrow(
      "Wait for the current review",
    );
    await expect(finalizeReviewAction({ applicationId })).rejects.toThrow(
      "Wait for the current review",
    );
    expect((await getAgencyCaseDetail(applicationId)).latestEvaluation).toBeNull();
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
    await runAgencyEvaluation({ applicationId, applicantId, userId });
    const saved = await fixture.db.query.documentEvaluationTable.findMany();
    expect(saved).toHaveLength(2);
    const result = saved.find((row) => row.id !== evaluation.id)!;
    expect(result.overallScore).toBe(100);
    expect(result.routeAssessment?.status).toBe("review_required");
    expect(result.reviewContextHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.readinessScore).toBeNull();
    expect(result.reviewStatus).toBe("complete");
    expect(result.itemFeedback?.[itemId]).toMatchObject({
      status: "ok",
      hasContent: true,
      confidence: 95,
    });
    expect(result.docSnapshots?.[itemId]).toContain(documentId);
    expect(mockGemini).toHaveBeenCalledTimes(2);
    expect(mockGemini.mock.calls[0][0].userContent).toContain("Passport document text");
  });

  it("does not publish or change saved case state when the combined review fails", async () => {
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
    const before = await fixture.db.query.visaApplicationTable.findFirst();
    await expect(runAgencyEvaluation({ applicationId, applicantId, userId })).rejects.toThrow(
      "combined review did not complete",
    );
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toEqual([evaluation]);
    expect(await fixture.db.query.visaApplicationTable.findFirst()).toEqual(before);
    expect(await fixture.db.query.reviewIssueTable.findMany()).toEqual([]);
    expect(mockGemini).toHaveBeenCalledTimes(2);
  });

  it("resumes four saved document checks after a combined timeout and publishes once", async () => {
    await fixture.db
      .update(uploadedDocumentTable)
      .set({ textContent: "Passport evidence", extractionStatus: "completed" });
    for (let index = 0; index < 3; index++) {
      const [item] = await fixture.db
        .insert(checklistItemTable)
        .values({
          applicationId,
          applicantId,
          documentName: `Evidence ${index}`,
          description: "Supporting evidence",
          isRequired: true,
        })
        .returning();
      await fixture.db.insert(uploadedDocumentTable).values({
        applicationId,
        applicantId,
        checklistItemId: item.id,
        fileName: `evidence-${index}.pdf`,
        fileKey: `evidence-${index}`,
        fileSize: 100,
        mimeType: "application/pdf",
        textContent: `Evidence ${index}`,
        extractionStatus: "completed",
      });
    }
    const [job] = await fixture.db
      .insert(reviewJobTable)
      .values({ applicationId, applicantId, userId })
      .returning();
    let combinedFailed = false;
    mockGemini.mockReset().mockImplementation(async ({ schemaName }: { schemaName: string }) => {
      if (schemaName === "per_document_evaluation")
        return JSON.stringify({
          status: "ok",
          feedback: "Readable evidence",
          confidence: 90,
          issues: [],
          strengths: [],
          extractedFields: { holderName: "Applicant", language: "en" },
        });
      if (!combinedFailed) {
        combinedFailed = true;
        throw Object.assign(new Error("Deadline exceeded"), { status: 504 });
      }
      return JSON.stringify({
        overallScore: 100,
        riskLevel: "low",
        summary: "Review complete",
        redFlags: [],
        strengths: [],
        recommendations: [],
        itemFeedback: {},
      });
    });
    await expect(processReviewJob({ jobId: job.id })).rejects.toThrow("another attempt");
    const failedAttempt = await fixture.db.query.reviewJobTable.findFirst({
      where: eq(reviewJobTable.id, job.id),
    });
    expect(failedAttempt).toMatchObject({ status: "queued", attempts: 1, evaluationId: null });
    expect(Object.keys(failedAttempt!.checkpoint!.documents)).toHaveLength(4);
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toEqual([evaluation]);
    await expect(generateClientReportAction({ applicationId })).rejects.toThrow(
      "Wait for the current review",
    );
    await expect(finalizeReviewAction({ applicationId })).rejects.toThrow(
      "Wait for the current review",
    );
    expect(mockGemini).toHaveBeenCalledTimes(5);

    await processReviewJob({ jobId: job.id });
    const completed = await fixture.db.query.reviewJobTable.findFirst({
      where: eq(reviewJobTable.id, job.id),
    });
    expect(completed).toMatchObject({
      status: "succeeded",
      attempts: 2,
      checkpoint: null,
      evaluationId: expect.any(String),
    });
    expect(mockGemini).toHaveBeenCalledTimes(6);
    expect(mockGemini.mock.calls[5][0].schemaName).toBe("orchestrator_evaluation");
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(2);
    await processReviewJob({ jobId: job.id });
    expect(mockGemini).toHaveBeenCalledTimes(6);
  });

  it("does not use a borderline quality score to trigger an eligibility pass", async () => {
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
    await runAgencyEvaluation({ applicationId, applicantId, userId });
    expect(mockGemini).toHaveBeenCalledTimes(2);
    const saved = (await fixture.db.query.documentEvaluationTable.findMany()).find(
      (row) => row.id !== evaluation.id,
    )!;
    expect(saved.routeAssessment?.status).toBe("review_required");
    expect(saved.routeAssessment?.support).not.toBe("active");
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.readinessScore).toBeNull();
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
    await expect(runAgencyEvaluation({ applicationId, applicantId, userId })).rejects.toThrow(
      "could not evaluate",
    );
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(1);
    expect(
      mockGemini.mock.calls.every(([input]) => input.schemaName === "per_document_evaluation"),
    ).toBe(true);
    mockGemini.mockClear();
    await runAgencyEvaluation({ applicationId, applicantId, userId });
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
    await expect(runAgencyEvaluation({ applicationId, applicantId, userId })).rejects.toThrow(
      "could not evaluate",
    );
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toHaveLength(1);
  });

  it("saves the full checklist in order", async () => {
    await prepareChecklistGeneration(
      Array.from({ length: 30 }, (_, index) => ({
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
    expect(items).toHaveLength(30);
    expect(items.map((item) => item.sortOrder)).toEqual(
      Array.from({ length: 30 }, (_, index) => index + 1),
    );
    expect(items.every((item) => item.isRequired === false)).toBe(true);
    expect(items[29].isRequired).toBe(false);
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

  it("refreshes matching generated items without duplicating them", async () => {
    const items = [
      {
        documentName: "Passport",
        description: "Valid passport",
        requirement: "required",
        applicability: "applies",
      },
    ];
    await prepareChecklistGeneration(items);
    await generateChecklistAction({ applicationId, applicantId });
    const original = await fixture.db.query.checklistItemTable.findFirst();
    mockOpenAI.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ items }) } }],
    });
    await generateChecklistAction({ applicationId, applicantId, refreshResearch: true });
    const active = (await loadReviewSnapshot({ db: fixture.db, applicationId })).checklistItems;
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      id: original!.id,
      isRequired: true,
      requirementType: "required",
    });
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
    let enteredFirst!: () => void;
    let enteredSecond!: () => void;
    let finishSecond!: () => void;
    const firstEntered = new Promise<void>((resolve) => {
      enteredFirst = resolve;
    });
    const secondEntered = new Promise<void>((resolve) => {
      enteredSecond = resolve;
    });
    const secondCanFinish = new Promise<void>((resolve) => {
      finishSecond = resolve;
    });
    mockOpenAI.mockReset();
    mockOpenAI
      .mockImplementationOnce(async () => {
        enteredFirst();
        await secondEntered;
        return response;
      })
      .mockImplementationOnce(async () => {
        enteredSecond();
        await secondCanFinish;
        return response;
      });
    const first = generateChecklistAction({ applicationId, applicantId });
    await firstEntered;
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

  it("refreshes checklist research after a visitor-to-PR route change without changing saved rows or files", async () => {
    mockPerplexity.mockClear();
    mockChecklistCacheGet.mockClear();
    const originalItems = await fixture.db.query.checklistItemTable.findMany();
    const originalFiles = await fixture.db.query.uploadedDocumentTable.findMany();
    mockOpenAI.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [{ documentName: "Visitor itinerary", requirement: "recommended" }],
            }),
          },
        },
      ],
    });
    await generateChecklistAction({ applicationId, applicantId, refreshResearch: true });
    const visitorApplication = await fixture.db.query.visaApplicationTable.findFirst();
    const visitorResearch = JSON.parse(visitorApplication!.settings).checklistResearch[applicantId];
    expect(visitorResearch.candidates).toHaveLength(1);
    const visitorItems = await fixture.db.query.checklistItemTable.findMany();
    await fixture.db
      .update(visaApplicationTable)
      .set({
        destinationCountry: "Canada",
        visaType: "Express Entry",
        agencyStatus: "ready_to_submit",
        clientReportStatus: "ready",
      })
      .where(eq(visaApplicationTable.id, applicationId));
    mockOpenAI.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  documentName: "Programme evidence",
                  requirement: "required",
                  applicability: "unknown",
                },
              ],
            }),
          },
        },
      ],
    });
    const result = await generateChecklistAction({
      applicationId,
      applicantId,
      refreshResearch: true,
    });
    const saved = await fixture.db.query.visaApplicationTable.findFirst();
    const research = JSON.parse(saved!.settings).checklistResearch[applicantId];
    const items = await fixture.db.query.checklistItemTable.findMany();
    expect(items).toHaveLength(3);
    expect(result).toHaveLength(2);
    for (const item of visitorItems)
      expect(items.find((row) => row.id === item.id)).toMatchObject({
        ...item,
        ...(item.origin === "generated"
          ? {
              removedAt: expect.any(Date),
              updatedAt: expect.any(Date),
              updateCounter: (item.updateCounter ?? 0) + 1,
            }
          : {}),
      });
    expect(items.find((row) => row.id === originalItems[0].id)?.isRequired).toBe(true);
    expect(items.find((row) => row.documentName === "Programme evidence")).toMatchObject({
      isRequired: false,
    });
    expect(await fixture.db.query.uploadedDocumentTable.findMany()).toEqual(originalFiles);
    expect(research.contextHash).not.toBe(visitorResearch.contextHash);
    expect(research.activeCandidateIds).toEqual(
      research.candidates.map(
        (candidate: { checklistItemId: string }) => candidate.checklistItemId,
      ),
    );
    expect(research.previousResearch).toEqual([visitorResearch]);
    expect(research.route).toMatchObject({
      destinationCountry: "Canada",
      visaType: "Express Entry",
    });
    expect(saved).toMatchObject({ agencyStatus: "in_review", clientReportStatus: "draft" });
    expect(mockPerplexity).toHaveBeenCalledTimes(2);
    expect(mockChecklistCacheGet).not.toHaveBeenCalled();
  });

  it("rejects a late explicit checklist refresh and keeps saved rows and uploads", async () => {
    const originalItems = await fixture.db.query.checklistItemTable.findMany();
    const originalFiles = await fixture.db.query.uploadedDocumentTable.findMany();
    mockOpenAI.mockImplementationOnce(async () => {
      await fixture.db
        .update(visaApplicationTable)
        .set({ destinationCountry: "Canada", visaType: "Express Entry" })
        .where(eq(visaApplicationTable.id, applicationId));
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({ items: [{ documentName: "Late visitor candidate" }] }),
            },
          },
        ],
      };
    });
    await expect(
      generateChecklistAction({ applicationId, applicantId, refreshResearch: true }),
    ).rejects.toThrow(/changed/i);
    expect(await fixture.db.query.checklistItemTable.findMany()).toEqual(originalItems);
    expect(await fixture.db.query.uploadedDocumentTable.findMany()).toEqual(originalFiles);
    expect(
      JSON.parse((await fixture.db.query.visaApplicationTable.findFirst())!.settings)
        .checklistResearch,
    ).toBeUndefined();
  });

  it("keeps one useful draft without padding it to an arbitrary minimum", async () => {
    await prepareChecklistGeneration(
      Array.from({ length: 3 }, () => ({
        documentName: "Passport",
        description: "Valid passport",
        isRequired: true,
      })),
    );
    await generateChecklistAction({ applicationId, applicantId });
    expect(await fixture.db.query.checklistItemTable.findMany()).toMatchObject([
      { documentName: "Passport", isRequired: false },
    ]);
  });

  it("saves per-applicant draft provenance without treating a cited model claim as reviewed law", async () => {
    await prepareChecklistGeneration([
      {
        documentName: "Passport",
        description: "Valid passport",
        isRequired: true,
        requirement: "required",
        applicability: "applies",
        sources: [
          {
            url: "https://example.gov/a",
            claim: "A passport is required",
            quotation: "Bring your passport",
          },
        ],
      },
    ]);
    await fixture.db.update(visaApplicationTable).set({
      settings: JSON.stringify({
        keep: "existing",
        checklistResearch: { other: { status: "draft_pending_review" } },
      }),
    });
    mockPerplexity.mockResolvedValueOnce({
      choices: [{ message: { content: "Draft research" } }],
      citations: ["https://example.gov/a", "javascript:alert(1)"],
    });
    await generateChecklistAction({ applicationId, applicantId });
    const application = await fixture.db.query.visaApplicationTable.findFirst();
    const settings = JSON.parse(application!.settings);
    expect(settings.keep).toBe("existing");
    expect(settings.checklistResearch.other).toEqual({ status: "draft_pending_review" });
    expect(settings.checklistResearch[applicantId]).toMatchObject({
      status: "generated",
      source: "live_search",
      candidates: [
        {
          requirement: "required",
          applicability: "applies",
          reviewStatus: "unreviewed",
          sources: [
            {
              url: "https://example.gov/a",
              claim: "A passport is required",
              quotation: "Bring your passport",
              reviewStatus: "unverified",
            },
          ],
        },
      ],
    });
    expect(await fixture.db.query.checklistItemTable.findFirst()).toMatchObject({
      isRequired: true,
      description: "Valid passport",
    });
  });

  it("uses the dependent's own nationality and history in the generation request", async () => {
    await prepareChecklistGeneration([{ documentName: "Passport" }]);
    await fixture.db
      .update(applicantTable)
      .set({
        rejectedBefore: true,
        rejectedReason: "Primary-only refusal",
        nationality: "Bangladesh",
      })
      .where(eq(applicantTable.id, applicantId));
    await fixture.db.update(visaApplicationTable).set({
      settings: JSON.stringify({
        rejectedBefore: true,
        rejectedReason: "Legacy primary refusal",
      }),
    });
    const [dependent] = await fixture.db
      .insert(applicantTable)
      .values({
        applicationId,
        name: "Child",
        relationship: "child",
        nationality: "Canada",
        dateOfBirth: "2010-01-01",
        rejectedBefore: false,
      })
      .returning();
    await generateChecklistAction({ applicationId, applicantId: dependent.id });
    const prompts = JSON.stringify(mockOpenAI.mock.calls[0][0].messages);
    expect(prompts).toContain("Canada");
    expect(prompts).toContain("2010-01-01");
    expect(prompts).not.toContain("Primary-only refusal");
    expect(prompts).not.toContain("Legacy primary refusal");
    expect(prompts).not.toContain("MANDATORY EXTRA DOCUMENTS");
  });

  it("reuses only matching cached draft research and keeps its original retrieval date", async () => {
    await prepareChecklistGeneration([{ documentName: "Passport" }]);
    await generateChecklistAction({ applicationId, applicantId });
    const [key, value] = mockChecklistCachePut.mock.calls[0];
    const cached = JSON.parse(value);
    mockChecklistCacheGet.mockResolvedValue(cached);
    mockPerplexity.mockClear();
    await fixture.db.delete(checklistItemTable);
    await generateChecklistAction({ applicationId, applicantId });
    expect(mockChecklistCacheGet).toHaveBeenLastCalledWith(key, "json");
    expect(mockPerplexity).not.toHaveBeenCalled();
    const application = await fixture.db.query.visaApplicationTable.findFirst();
    expect(JSON.parse(application!.settings).checklistResearch[applicantId]).toMatchObject({
      source: "cached",
      retrievedAt: cached.retrievedAt,
      status: "generated",
    });
  });

  it("does not reuse a cache payload from different route facts", async () => {
    await prepareChecklistGeneration([{ documentName: "Passport" }]);
    await generateChecklistAction({ applicationId, applicantId });
    const [key, value] = mockChecklistCachePut.mock.calls[0];
    mockChecklistCacheGet.mockResolvedValue(JSON.parse(value));
    mockPerplexity.mockClear();
    await fixture.db.delete(checklistItemTable);
    const application = await fixture.db.query.visaApplicationTable.findFirst();
    await fixture.db.update(visaApplicationTable).set({
      settings: JSON.stringify({
        ...JSON.parse(application!.settings),
        routeFacts: { applicationDate: "2026-12-01", stage: "extension" },
      }),
    });
    await generateChecklistAction({ applicationId, applicantId });
    expect(mockChecklistCacheGet.mock.calls.at(-1)![0]).not.toBe(key);
    expect(mockPerplexity).toHaveBeenCalledTimes(1);
  });

  it("labels the model-only fallback as a draft with no retrieved source claims", async () => {
    await prepareChecklistGeneration([
      {
        documentName: "Passport",
        isRequired: true,
        sources: [{ url: "https://example.gov/a", claim: "Required" }],
      },
    ]);
    mockPerplexity.mockRejectedValueOnce(new Error("Search unavailable"));
    await generateChecklistAction({ applicationId, applicantId });
    const application = await fixture.db.query.visaApplicationTable.findFirst();
    expect(application?.checklistSource).toBe("draft_model_knowledge");
    expect(JSON.parse(application!.settings).checklistResearch[applicantId]).toMatchObject({
      source: "model_knowledge",
      retrievedAt: null,
      candidates: [{ isRequired: false, sources: [] }],
    });
    expect(JSON.stringify(mockOpenAI.mock.calls[0][0].messages)).not.toContain(
      "OFFICIAL REQUIREMENTS",
    );
  });

  it("rejects late checklist results after route dates change", async () => {
    await prepareChecklistGeneration([{ documentName: "Passport" }]);
    mockOpenAI.mockImplementationOnce(async () => {
      await fixture.db
        .update(visaApplicationTable)
        .set({ settings: JSON.stringify({ routeFacts: { applicationDate: "2027-01-01" } }) });
      return {
        choices: [
          { message: { content: JSON.stringify({ items: [{ documentName: "Passport" }] }) } },
        ],
      };
    });
    await expect(generateChecklistAction({ applicationId, applicantId })).rejects.toThrow(
      /changed/i,
    );
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(0);
  });

  it("rejects late checklist results after applicant facts change", async () => {
    await prepareChecklistGeneration([
      { documentName: "Passport" },
      { documentName: "Photo" },
      { documentName: "Form" },
    ]);
    const response = {
      choices: [
        { message: { content: JSON.stringify({ items: [{ documentName: "Passport" }] }) } },
      ],
    };
    mockOpenAI.mockImplementationOnce(async () => {
      await fixture.db
        .update(applicantTable)
        .set({ nationality: "Canada" })
        .where(eq(applicantTable.id, applicantId));
      return response;
    });
    await expect(generateChecklistAction({ applicationId, applicantId })).rejects.toThrow(
      /changed/i,
    );
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(0);
    expect(
      (await fixture.db.query.visaApplicationTable.findFirst())?.checklistGeneratedAt,
    ).toBeNull();
  });

  it("rolls back checklist rows if provenance cannot be saved", async () => {
    await prepareChecklistGeneration([
      { documentName: "Passport" },
      { documentName: "Photo" },
      { documentName: "Form" },
    ]);
    fixture.setBeforeQuery((query) => {
      if (query.startsWith('update "visa_application"')) throw new Error("metadata write failed");
    });
    await expect(generateChecklistAction({ applicationId, applicantId })).rejects.toThrow();
    fixture.setBeforeQuery();
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(0);
  });

  it("uses a strict checklist schema with separate requirement and applicability values", async () => {
    await prepareChecklistGeneration([
      {
        documentName: "Sponsor letter",
        requirement: "conditional",
        applicability: "unknown",
        condition: "If a sponsor pays for the trip",
      },
    ]);
    await generateChecklistAction({ applicationId, applicantId });
    const request = mockOpenAI.mock.calls[0][0];
    expect(request.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["items"],
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "documentName",
                  "description",
                  "commonMistakes",
                  "requirement",
                  "condition",
                  "applicability",
                  "sources",
                ],
                properties: {
                  requirement: { enum: ["required", "recommended", "conditional", "unknown"] },
                  applicability: { enum: ["applies", "does_not_apply", "unknown"] },
                  sources: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["url", "claim", "quotation", "scope", "effectiveDate"],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(JSON.stringify(request.response_format.json_schema.schema)).not.toContain('"default":');
    expect(request.messages[0].content).toContain("conditional belongs in requirement");
    expect(await fixture.db.query.checklistItemTable.findMany()).toMatchObject([
      {
        documentName: "Sponsor letter",
        requirementType: "conditional",
        applicability: "unknown",
        isRequired: false,
      },
    ]);
  });

  it("rejects conditional applicability on all five items before saving a checklist", async () => {
    await prepareChecklistGeneration(
      Array.from({ length: 5 }, (_, index) => ({
        documentName: `Document ${index}`,
        requirement: "conditional",
        applicability: "conditional",
      })),
    );
    await expect(generateChecklistAction({ applicationId, applicantId })).rejects.toThrow(
      /invalid checklist/i,
    );
    expect(await fixture.db.query.checklistItemTable.findMany()).toHaveLength(0);
    const application = await fixture.db.query.visaApplicationTable.findFirst();
    expect(application?.checklistGeneratedAt).toBeNull();
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

  it("does not publish a review after the case is submitted", async () => {
    const previous = await fixture.db.query.documentEvaluationTable.findMany();
    await fixture.db
      .update(visaApplicationTable)
      .set({ finalSubmissionAt: new Date() })
      .where(eq(visaApplicationTable.id, applicationId));
    await expect(
      publishAgencyReview({ ...context(), evaluation: evaluationInput() }),
    ).rejects.toThrow(/submitted/i);
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toEqual(previous);
  });

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
      readinessScore: null,
      agencyStatus: "in_review",
      clientReportStatus: "draft",
    });
    expect((await fixture.db.query.applicantTable.findFirst())?.readinessScore).toBeNull();
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
    const correctionReport = await fixture.db.query.clientReportTable.findFirst();
    expect(correctionReport?.summary).not.toContain("requirements still need approval");
    expect((await fixture.db.query.clientReportTable.findFirst())?.status).toBe("ready");
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.agencyStatus).toBe(
      "in_review",
    );
  });
  it("does not mark a case waiting for the client when a correction report is only prepared", async () => {
    await publishAgencyReview({
      ...context(),
      evaluation: { ...evaluationInput(), redFlags: ["Provide the missing statement pages"] },
    });
    await generateClientReportAction({ applicationId });
    expect((await fixture.db.query.visaApplicationTable.findFirst())?.agencyStatus).toBe(
      "in_review",
    );
  });

  it("rejects a report when person facts change at report publication without a case counter change", async () => {
    fixture.setBeforeQuery(async (query) => {
      if (!query.startsWith('update "visa_application"')) return;
      fixture.setBeforeQuery();
      await fixture.pool.query("UPDATE applicant SET nationality = $1 WHERE id = $2", [
        "India",
        applicantId,
      ]);
    });
    await expect(generateClientReportAction({ applicationId })).rejects.toThrow(/changed|current/i);
    expect(await fixture.db.query.clientReportTable.findMany()).toHaveLength(0);
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
    await expect(generateClientReportAction({ applicationId })).rejects.toThrow(/changed|current/);
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
    await markReadyForTransactionTest();
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
    await markReadyForTransactionTest();
    fixture.setBeforeQuery((query) => {
      if (query.startsWith('update "visa_application"')) throw new Error("case write failed");
    });
    await expect(
      updateReviewIssueStatusAction({ issueId: issue.id, status: "open" }),
    ).rejects.toThrow();
    fixture.setBeforeQuery();
    expect((await fixture.db.query.reviewIssueTable.findFirst())?.status).toBe("dismissed");
  });

  it("records completion for a current document-complete case using approved route guidance", async () => {
    await markAgencyCaseReady(context());
    const application = await fixture.db.query.visaApplicationTable.findFirst();
    expect(application?.agencyStatus).toBe("ready_to_submit");
    expect(application?.reviewCompletedAt).toBeInstanceOf(Date);
  });

  it("excludes submitted cases from assigned and unassigned active workloads", async () => {
    await fixture.db
      .update(visaApplicationTable)
      .set({ agencyStatus: "intake", finalSubmissionAt: new Date(), assignedReviewerId: userId });
    expect(
      (await getAgencyDashboardData()).workload.find((row) => row.userId === userId)?.inReview,
    ).toBe(0);
    await fixture.db.update(visaApplicationTable).set({ assignedReviewerId: null });
    expect(
      (await getAgencyDashboardData()).workload.find((row) => row.id === "unassigned")?.inReview,
    ).toBe(0);
    await fixture.db.update(visaApplicationTable).set({ finalSubmissionAt: null });
    expect(
      (await getAgencyDashboardData()).workload.find((row) => row.id === "unassigned")?.inReview,
    ).toBe(1);
  });

  it("counts required checklist coverage once per item and checks every applicant for the dashboard", async () => {
    expect((await getAgencyCaseRows())[0]).toMatchObject({
      requiredDocumentCount: 1,
      uploadedRequiredDocumentCount: 1,
      hasChecklist: true,
      reviewState: "current",
    });
    await fixture.db.insert(uploadedDocumentTable).values({
      applicationId,
      applicantId,
      checklistItemId: itemId,
      fileName: "older.pdf",
      fileKey: "older",
      fileSize: 100,
      mimeType: "application/pdf",
      uploadedAt: new Date("2026-09-19"),
    });
    const [other] = await fixture.db
      .insert(applicantTable)
      .values({
        applicationId,
        name: "Dependent",
        relationship: "spouse",
      })
      .returning();
    await fixture.db.insert(checklistItemTable).values({
      applicationId,
      applicantId: other.id,
      documentName: "Optional file",
      description: "Optional",
      isRequired: false,
    });
    await fixture.db.insert(checklistItemTable).values({
      applicationId,
      applicantId: other.id,
      documentName: "Dependent passport",
      description: "Required",
      isRequired: true,
    });
    expect((await getAgencyCaseRows())[0]).toMatchObject({
      requiredDocumentCount: 2,
      uploadedRequiredDocumentCount: 1,
      reviewState: "outdated",
    });
    await fixture.db.delete(documentEvaluationTable);
    expect((await getAgencyCaseRows())[0].reviewState).toBe("not_started");
  });

  it("does not return a submitted case to ready for submission", async () => {
    await fixture.db
      .update(visaApplicationTable)
      .set({ finalSubmissionAt: new Date() })
      .where(eq(visaApplicationTable.id, applicationId));
    await expect(markAgencyCaseReady(context())).rejects.toThrow(/submitted/i);
  });

  it("blocks an empty checklist", async () => {
    await fixture.db.delete(uploadedDocumentTable);
    await fixture.db.delete(checklistItemTable);
    await expect(markAgencyCaseReady(context())).rejects.toThrow("checklist first");
  });

  it("blocks readiness with zero evidence even when every item is optional", async () => {
    await fixture.db.delete(uploadedDocumentTable);
    await fixture.db.update(checklistItemTable).set({ isRequired: false });
    evaluation = await saveEvaluation({
      docSnapshots: { [itemId]: "missing" },
      itemFeedback: {
        [itemId]: { status: "missing", hasDocument: false, feedback: "Missing file" },
      },
    });
    await expect(markAgencyCaseReady(context())).rejects.toThrow("usable");
  });

  it("blocks readiness for an unresolved requirement", async () => {
    await fixture.db
      .update(checklistItemTable)
      .set({ requirementType: "conditional", applicability: "unknown" });
    evaluation = await saveEvaluation();
    await expect(markAgencyCaseReady(context())).rejects.toThrow("requirements");
  });

  it("blocks missing review results", async () => {
    await fixture.db.delete(documentEvaluationTable);
    await expect(markAgencyCaseReady(context())).rejects.toThrow("current documents");
  });

  it("blocks incomplete saved reviews from display, reports, and readiness", async () => {
    await fixture.db.update(documentEvaluationTable).set({ reviewStatus: "incomplete" });
    expect((await getAgencyCaseDetail(applicationId)).latestEvaluation).toBeNull();
    expect((await getAgencyCaseRows())[0].latestEvaluation).toBeNull();
    await expect(markAgencyCaseReady(context())).rejects.toThrow("current documents");
    await expect(generateClientReportAction({ applicationId })).rejects.toThrow();
  });

  it("migrates existing reviews without treating them as proven complete", async () => {
    // Recreate the pre-migration column set in this private test database.
    await fixture.pool.query('ALTER TABLE document_evaluation DROP COLUMN "reviewStatus"');
    const before = (await fixture.pool.query("SELECT * FROM document_evaluation")).rows;
    await fixture.pool.query(
      readFileSync(
        new URL("../db/postgres-migrations/0005_review_completion_status.sql", import.meta.url),
        "utf8",
      ),
    );
    const after = await fixture.db.query.documentEvaluationTable.findMany();
    expect(after.map(({ reviewStatus: _reviewStatus, ...row }) => row)).toEqual(before);
    expect(after.every((review) => review.reviewStatus === "incomplete")).toBe(true);
    await expect(markAgencyCaseReady(context())).rejects.toThrow("current documents");
  });

  it("rejects incomplete publication before database writes", async () => {
    const before = await fixture.db.query.visaApplicationTable.findFirst();
    await expect(
      publishAgencyReview({
        ...context(),
        evaluation: { ...evaluation, applicantId, reviewStatus: "incomplete" },
      }),
    ).rejects.toThrow("review is incomplete");
    expect(await fixture.db.query.documentEvaluationTable.findMany()).toEqual([evaluation]);
    expect(await fixture.db.query.visaApplicationTable.findFirst()).toEqual(before);
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

  it("stores the model title, details, and recommendation in separate finding fields", async () => {
    const finding = {
      title: "Financial evidence missing",
      details: "The uploaded file is a curriculum vitae rather than financial evidence.",
      recommendation: "Provide financial evidence for the trip.",
    };
    evaluation = await saveEvaluation({ redFlags: [finding] });
    expect(await sync()).toEqual({ createdCount: 1 });
    const [issue] = await fixture.db.query.reviewIssueTable.findMany();
    expect(issue).toMatchObject({
      title: finding.title,
      description: finding.details,
      recommendation: finding.recommendation,
    });
    await fixture.db.update(reviewIssueTable).set({ status: "dismissed", resolvedAt: new Date() });
    evaluation = await saveEvaluation({
      redFlags: [{ ...finding, title: "Wrong financial document" }],
    });
    expect(await sync()).toEqual({ createdCount: 0 });
    expect(await fixture.db.query.reviewIssueTable.findFirst()).toMatchObject({
      id: issue.id,
      title: "Wrong financial document",
      status: "dismissed",
    });
  });

  it("uses model-written titles and next actions for document findings", async () => {
    evaluation = await saveEvaluation({
      itemFeedback: {
        [itemId]: {
          status: "needs_review",
          title: "Passport page unreadable",
          feedback: "The passport page is blurred and its text cannot be checked.",
          issues: ["The expiry date cannot be read."],
          recommendation: "Upload a clear scan of the passport page.",
          hasDocument: true,
          hasContent: false,
        },
      },
    });
    await sync();
    expect(await fixture.db.query.reviewIssueTable.findFirst()).toMatchObject({
      title: "Passport page unreadable",
      description:
        "The passport page is blurred and its text cannot be checked.\nThe expiry date cannot be read.",
      recommendation: "Upload a clear scan of the passport page.",
    });
  });

  it("rejects an invalid structured title before it can be saved as a tracked issue", async () => {
    evaluation = await saveEvaluation({
      redFlags: [
        {
          title: "A".repeat(101),
          details: "The file is not financial evidence.",
          recommendation: "Provide financial evidence.",
        },
      ],
    });
    await expect(sync()).rejects.toThrow();
    expect(await fixture.db.query.reviewIssueTable.findMany()).toHaveLength(0);
  });

  it("preserves a reviewer decision for unchanged evidence", async () => {
    evaluation = await saveEvaluation({ redFlags: ["Check name spelling"] });
    await sync();
    await fixture.db.update(reviewIssueTable).set({ status: "dismissed", resolvedAt: new Date() });
    await markReadyForTransactionTest();
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
    await markReadyForTransactionTest();
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
    await expect(markAgencyCaseReady(context())).rejects.toThrow("required documents");
  });

  it("clears readiness and marks an old report out of date", async () => {
    await markReadyForTransactionTest();
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
    await markReadyForTransactionTest();
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
      // The historical schema predates agencyId; use its original columns.
      const {
        rows: [application],
      } = await fixture.pool.query<{ id: string }>(
        `INSERT INTO visa_application (id, "createdAt", "updatedAt", "userId", "clientId", "clientName", "homeCountry", "currentCountry", "destinationCountry", "visaType", embassy)
         VALUES ('migration_case', now(), now(), $1, 'client', 'Client', 'Bangladesh', 'Bangladesh', 'Japan', 'Tourist', 'Dhaka') RETURNING id`,
        [user.id],
      );
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
