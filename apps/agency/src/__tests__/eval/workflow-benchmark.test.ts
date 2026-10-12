import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { startTestPostgres } from "../helpers/postgres";
import { startTestRedis } from "../helpers/redis";
import { createWorkflowDatabase, seedWorkflowCase } from "../helpers/workflow-fixture";

const state = vi.hoisted(() => ({
  db: vi.fn(),
  redis: vi.fn(),
  runtime: vi.fn(),
  actor: vi.fn(),
  extractionTasks: new Map<string, string>(),
  reviewTasks: new Set<string>(),
}));
vi.mock("@/db", async (original) => ({
  ...(await original<typeof import("@/db")>()),
  getDB: state.db,
}));
vi.mock("@/infra/google/kv", () => ({ getRedis: state.redis }));
vi.mock("@/infra/runtime-context", () => ({ getRuntimeContext: state.runtime }));
vi.mock("@/infra/google/document-tasks", () => ({
  enqueueDocumentExtraction: async ({ documentId }: { documentId: string }) => {
    state.extractionTasks.set(documentId, "accepted");
  },
}));
vi.mock("@/infra/google/review-tasks", () => ({
  enqueueReviewJob: async ({ jobId }: { jobId: string }) => {
    state.reviewTasks.add(jobId);
  },
}));
vi.mock("@/infra/with-rate-limit", () => ({ withRateLimit: (run: () => unknown) => run() }));
vi.mock("@/infra/action-rate-limit", () => ({ checkActionRateLimit: async () => undefined }));
vi.mock("@/utils/application-auth", () => ({ requireApplicationPermission: () => state.actor() }));
vi.mock("@/app/api/_utils/request-auth", () => ({
  requireRouteSession: async () => ({ session: await state.actor() }),
}));
vi.mock("@/server/agency-team", () => ({
  requireAgencyStaff: async () => ({ session: await state.actor() }),
  requireAgencyAdmin: async () => ({ session: await state.actor() }),
}));
vi.mock("@/infra/csrf", () => ({ validateCsrfToken: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/infra/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  logAlert: vi.fn(),
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
      handler: (run: (args: { input: unknown }) => unknown) => (input: unknown) => run({ input }),
    };
    return chain;
  },
}));
vi.mock("@/lib/openai", async (original) => {
  const actual = await original<typeof import("@/lib/openai")>();
  return {
    ...actual,
    getOpenAIClient: () =>
      process.env.WORKFLOW_LIVE === "true"
        ? actual.getOpenAIClient()
        : {
            embeddings: {
              create: async ({ input }: { input: string[] }) => ({
                data: input.map(() => ({ embedding: Array(1536).fill(0.1) })),
                usage: { prompt_tokens: 100, total_tokens: 100 },
              }),
            },
          },
  };
});
vi.mock("@/lib/gemini", async (original) => {
  const actual = await original<typeof import("@/lib/gemini")>();
  return {
    ...actual,
    getGeminiClient: () =>
      process.env.WORKFLOW_LIVE === "true"
        ? actual.getGeminiClient()
        : {
            models: {
              generateContent: async ({ config }: { config: { responseJsonSchema?: unknown } }) => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                const schema = config.responseJsonSchema as
                  | { properties?: { overallScore?: unknown } }
                  | undefined;
                const text = !schema
                  ? "IMAGE_DESCRIPTION: Synthetic passport\nREADABLE_TEXT: Synthetic Applicant. Passport valid until 2035."
                  : schema.properties?.overallScore
                    ? JSON.stringify({
                        overallScore: 95,
                        riskLevel: "low",
                        summary: "Synthetic case",
                        redFlags: [],
                        strengths: [],
                        recommendations: [],
                        itemFeedback: {},
                      })
                    : JSON.stringify({
                        status: "ok",
                        score: 95,
                        feedback: "Synthetic document",
                        issues: [],
                        strengths: [],
                        confidence: 95,
                        extractedFields: {
                          holderName: "Synthetic Applicant",
                          expiryDate: "2035-01-01",
                          language: "en",
                        },
                      });
                return {
                  text,
                  candidates: [{ finishReason: "STOP" }],
                  usageMetadata: {
                    promptTokenCount: 100,
                    candidatesTokenCount: 40,
                    thoughtsTokenCount: 10,
                    totalTokenCount: 150,
                  },
                };
              },
            },
          },
  };
});

import { handleDocumentUploadRoute } from "@/app/api/_utils/document-upload";
import { queueDocumentExtraction } from "@/services/document-pipeline";
import { requestReviewJob, processReviewJob } from "@/server/review-jobs";
import { generateClientReportAction } from "@/actions/agency-case.action";
import { GET as downloadReport } from "@/app/api/client-reports/[reportId]/route";
import { type EvaluationCallMetric, withEvaluationMetrics } from "@/infra/evaluation-metrics";
import {
  estimateModelCost,
  type ModelRates,
  runBenchmark,
  summarizeBenchmark,
} from "./framework/benchmark";
import { eq } from "drizzle-orm";
import { reviewJobTable, visaApplicationTable } from "@/db/schema";

const actors = new AsyncLocalStorage<{ userId: string }>();
let cluster: ReturnType<typeof startTestPostgres>;
let database: Awaited<ReturnType<typeof createWorkflowDatabase>>;
let redis: Awaited<ReturnType<typeof startTestRedis>>;
const objects = new Map<string, Uint8Array>();
const vectors = new Map<string, { id: string; metadata: Record<string, unknown> }>();
let queries = 0;
let liveStorage:
  | ReturnType<typeof import("@/infra/google/storage").createGoogleStorageBucket>
  | undefined;
let liveVectors:
  | ReturnType<typeof import("@/infra/google/vector-search").createGoogleVectorIndex>
  | undefined;
const ownedKeys = new Set<string>();
const ownedVectors = new Set<string>();
beforeAll(async () => {
  vi.stubEnv("DB_SQL_LOG", "false");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("GEMINI_GLOBAL_CONCURRENCY", "2");
  if (process.env.WORKFLOW_LIVE !== "true")
    vi.stubEnv("OPENAI_DOCUMENT_EXTRACTION_FALLBACK", "false");
  cluster = startTestPostgres();
  database = await createWorkflowDatabase(cluster);
  redis = await startTestRedis();
  state.redis.mockResolvedValue(redis.clients[0]);
  state.db.mockReturnValue(database.db);
  state.actor.mockImplementation(() => {
    const actor = actors.getStore()!;
    return { ...actor, user: { id: actor.userId } };
  });
  if (process.env.WORKFLOW_LIVE === "true") {
    liveStorage = (await import("@/infra/google/storage")).createGoogleStorageBucket();
    liveVectors = (await import("@/infra/google/vector-search")).createGoogleVectorIndex();
  }
  state.runtime.mockReturnValue({
    ctx: {
      waitUntil: (work: Promise<unknown>) => {
        void work.catch(() => undefined);
      },
    },
    env: {
      R2: {
        put: async (key: string, bytes: Uint8Array) => {
          ownedKeys.add(key);
          if (liveStorage) return liveStorage.put(key, bytes);
          objects.set(key, new Uint8Array(bytes));
        },
        get: async (key: string) =>
          liveStorage
            ? liveStorage.get(key)
            : objects.has(key)
              ? {
                  arrayBuffer: async () => objects.get(key)!.slice().buffer,
                  body: new Response(objects.get(key)!.slice().buffer).body,
                }
              : null,
        head: async (key: string) =>
          liveStorage ? liveStorage.head(key) : objects.has(key) ? { key } : null,
      },
      VECTORIZE: {
        upsert: async (values: Array<{ id: string; metadata: Record<string, unknown> }>) => {
          for (const value of values) {
            vectors.set(value.id, value);
            ownedVectors.add(value.id);
          }
          if (liveVectors)
            return liveVectors.upsert(
              values as import("@/infra/google/vector-search").GoogleVector[],
            );
        },
        query: async (embedding: number[], { filter }: { filter: Record<string, string> }) => {
          queries++;
          if (liveVectors)
            return liveVectors.query(embedding, { filter, returnMetadata: "all", topK: 6 });
          return {
            matches: [...vectors.values()].filter((vector) =>
              Object.entries(filter).every(([key, value]) => vector.metadata[key] === value),
            ),
          };
        },
      },
    },
  });
});
afterAll(async () => {
  try {
    const cleanup = await Promise.allSettled([
      liveVectors && ownedVectors.size ? liveVectors.deleteByIds([...ownedVectors]) : undefined,
      liveStorage && ownedKeys.size ? liveStorage.delete([...ownedKeys]) : undefined,
    ]);
    const failed = cleanup.filter((result) => result.status === "rejected");
    if (failed.length) throw new Error("Synthetic cloud data cleanup failed. Check the run logs.");
  } finally {
    try {
      await Promise.allSettled([redis?.stop(), database?.close()]);
      cluster?.stop();
    } finally {
      vi.unstubAllEnvs();
    }
  }
});

// A real PDF with a text stream and cross-reference table, parsed by production PDF.js.
function syntheticPdf() {
  const text = "BT /F1 14 Tf 40 750 Td (Synthetic Applicant - Passport valid until 2035) Tj ET";
  const parts = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  parts.forEach((part, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${part}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf));
}

it.skipIf(process.env.RUN_WORKFLOW_BENCHMARK !== "true")(
  "measures isolated upload-to-report processing at increasing concurrency",
  { timeout: process.env.WORKFLOW_LIVE === "true" ? 900_000 : 180_000 },
  async () => {
    const levels = (
      process.env.WORKFLOW_CONCURRENCY ?? (process.env.WORKFLOW_LIVE === "true" ? "1" : "1,2,4")
    )
      .split(",")
      .map(Number);
    const count = Number(
      process.env.WORKFLOW_CASES ?? (process.env.WORKFLOW_LIVE === "true" ? 2 : 6),
    );
    if (process.env.WORKFLOW_LIVE === "true" && count * levels.length > 4)
      throw new Error("Live benchmark is limited to four cases");
    if (
      !Number.isInteger(count) ||
      count < 1 ||
      count > 30 ||
      !levels.length ||
      levels.some((level) => !Number.isInteger(level) || level < 1 || level > 8)
    )
      throw new Error("Invalid workload bounds");
    const rates = process.env.WORKFLOW_RATES_FILE
      ? (JSON.parse(await readFile(process.env.WORKFLOW_RATES_FILE, "utf8")) as ModelRates[])
      : [];
    if (!Array.isArray(rates)) throw new Error("Rates must be an array");
    const infraRate =
      process.env.WORKFLOW_INFRA_USD_PER_CASE === undefined
        ? null
        : Number(process.env.WORKFLOW_INFRA_USD_PER_CASE);
    if (infraRate !== null && (!Number.isFinite(infraRate) || infraRate < 0))
      throw new Error("Invalid infrastructure cost allocation");
    const pdf = syntheticPdf();
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 800, 400);
    ctx.fillStyle = "black";
    ctx.font = "24px sans-serif";
    ctx.fillText("Synthetic Applicant - Passport valid until 2035", 30, 100);
    const image = new Uint8Array(canvas.toBuffer("image/png"));
    const sourceFiles = [
      "src/actions/evaluation.action.ts",
      "src/services/agency-evaluation.ts",
      "src/server/review-jobs.ts",
      "src/services/case-evaluation.ts",
      "src/lib/review-rubric.ts",
      "src/lib/visa-route-catalog.ts",
      "src/server/review-context.ts",
      "src/services/document-pipeline.ts",
      "src/services/pdf-parser.ts",
      "src/lib/gemini-evaluation.ts",
      "src/infra/evaluation-metrics.ts",
      "src/__tests__/eval/workflow-benchmark.test.ts",
      "src/infra/google/gemini-capacity.ts",
      "src/server/agency-review.ts",
      "src/server/client-reports.ts",
      "src/actions/agency-case.action.ts",
      "src/app/api/_utils/document-upload.ts",
      "src/app/api/client-reports/[reportId]/route.ts",
      "src/db/index.ts",
      "src/db/schema/review-job.ts",
      "src/infra/google/storage.ts",
      "src/infra/google/vector-search.ts",
      "src/infra/google/auth.ts",
      "src/__tests__/helpers/workflow-fixture.ts",
      "src/__tests__/helpers/postgres.ts",
      "src/__tests__/helpers/redis.ts",
      "package.json",
      "../../pnpm-lock.yaml",
    ];
    async function fingerprint() {
      const sources: Record<string, string> = {};
      for (const file of sourceFiles)
        sources[file] = createHash("sha256")
          .update(await readFile(file))
          .digest("hex");
      return { sources, hash: createHash("sha256").update(JSON.stringify(sources)).digest("hex") };
    }
    const sourceBefore = await fingerprint();
    const results = [];
    const measurements: Array<{
      concurrency: number;
      index: number;
      kind: string;
      stages: Record<string, number>;
      calls: EvaluationCallMetric[];
      status: string;
      failureStage: string | null;
      attempts: number;
      modelCostUsd: number | null;
      fullCostUsd: number | null;
    }> = [];
    const deliveries = process.env.WORKFLOW_LIVE === "true" ? 2 : 5;

    for (const concurrency of levels) {
      const result = await runBenchmark({
        items: Array.from(
          { length: count },
          (_, i) => i + Number(process.env.WORKFLOW_CASE_START ?? 0),
        ),
        concurrency,
        run: async (index) => {
          const measurement = {
            concurrency,
            index,
            kind: index % 2 ? "image" : "pdf",
            stages: {} as Record<string, number>,
            calls: [] as EvaluationCallMetric[],
            status: "failed",
            failureStage: null as string | null,
            attempts: 0,
            modelCostUsd: null as number | null,
            fullCostUsd: null as number | null,
          };
          measurements.push(measurement);
          let currentStage = "fixture";
          let jobId: string | undefined;
          const outerCalls: EvaluationCallMetric[] = [];
          async function stage<T>(name: string, run: () => T | PromiseLike<T>) {
            currentStage = name;
            const started = performance.now();
            if (process.env.WORKFLOW_LIVE === "true")
              console.log(JSON.stringify({ concurrency, index, stage: name, event: "start" }));
            try {
              return await run();
            } finally {
              measurement.stages[name] =
                (measurement.stages[name] ?? 0) + performance.now() - started;
            }
          }
          try {
            const input = await seedWorkflowCase({ db: database.db, document: false });
            await database.db
              .update(visaApplicationTable)
              .set({
                destinationCountry: "Japan",
                visaType: "Short-Stay Tourist",
                settings: JSON.stringify({ routeReview: { stage: "initial", subtype: "tourism" } }),
              })
              .where(eq(visaApplicationTable.id, input.applicationId));
            await actors.run({ userId: input.userId, agencyId: input.agencyId }, async () =>
              withEvaluationMetrics({
                calls: outerCalls,
                run: async () => {
                  const form = new FormData();
                  const isImage = index % 2 === 1;
                  form.set(
                    "file",
                    new File([isImage ? image : pdf], isImage ? "passport.png" : "passport.pdf", {
                      type: isImage ? "image/png" : "application/pdf",
                    }),
                  );
                  form.set("applicationId", input.applicationId);
                  form.set("applicantId", input.applicantId);
                  form.set("checklistItemId", input.itemId);
                  const response = await stage("upload", () =>
                    handleDocumentUploadRoute({
                      request: new Request("http://isolated.test/api/documents/upload", {
                        method: "POST",
                        body: form,
                      }),
                      routeKind: "auto",
                    }),
                  );
                  if (response.status !== 200) throw new Error("Upload failed");
                  const { documentId } = (await response.json()) as { documentId: string };
                  expect(state.extractionTasks.has(documentId)).toBe(true);
                  await stage("extractionAndIndexing", async () => {
                    for (let attempt = 1; attempt <= deliveries; attempt++) {
                      const result = await queueDocumentExtraction({ documentId });
                      if (result.extraction.success && result.indexing.success) return;
                      if (attempt < deliveries)
                        await new Promise((resolve) =>
                          setTimeout(resolve, process.env.WORKFLOW_LIVE === "true" ? 10000 : 25),
                        );
                    }
                    throw new Error("Extraction delivery exhausted");
                  });
                  const job = await stage("queueAcceptance", () => requestReviewJob(input));
                  jobId = job.id;
                  expect(state.reviewTasks.has(job.id)).toBe(true);
                  await stage("reviewAndPublication", async () => {
                    for (let attempt = 1; attempt <= deliveries; attempt++) {
                      try {
                        await processReviewJob({ jobId: job.id });
                      } catch {
                        /* Simulate retryable task delivery, with the same job ID. */
                      }
                      const saved = await database.db.query.reviewJobTable.findFirst({
                        where: eq(reviewJobTable.id, job.id),
                      });
                      if (saved?.status === "succeeded") return;
                      if (saved?.status === "failed") break;
                      if (attempt < deliveries)
                        await new Promise((resolve) =>
                          setTimeout(resolve, process.env.WORKFLOW_LIVE === "true" ? 10000 : 25),
                        );
                    }
                    throw new Error("Review delivery exhausted");
                  });
                  await processReviewJob({ jobId: job.id });
                  const created = await stage("report", () =>
                    (
                      generateClientReportAction as unknown as (input: {
                        applicationId: string;
                      }) => Promise<{ id: string }>
                    )({ applicationId: input.applicationId }),
                  );
                  const downloaded = await stage("download", () =>
                    downloadReport(new Request("http://isolated.test/report"), {
                      params: Promise.resolve({ reportId: created.id }),
                    }),
                  );
                  expect(downloaded.status).toBe(200);
                  expect(await downloaded.text()).toContain("Synthetic Client");
                  measurement.status = "succeeded";
                },
              }),
            );
            return measurement;
          } catch {
            measurement.failureStage = currentStage;
            throw new Error(`Workflow failed at ${currentStage}`);
          } finally {
            const saved = jobId
              ? await database.db.query.reviewJobTable.findFirst({
                  where: eq(reviewJobTable.id, jobId),
                })
              : undefined;
            measurement.calls = [...outerCalls, ...(saved?.metrics?.calls ?? [])];
            measurement.attempts = saved?.attempts ?? 0;
            if (saved?.startedAt)
              measurement.stages.initialQueueWait = Math.max(
                0,
                saved.startedAt.getTime() - saved.createdAt.getTime(),
              );
            const costs = [...new Set(measurement.calls.map((call) => call.model))].map((model) =>
              estimateModelCost({
                calls: measurement.calls.filter((call) => call.model === model),
                rates: rates.find((rate) => rate.model === model),
              }),
            );
            measurement.modelCostUsd =
              costs.length && costs.every((cost) => cost !== null)
                ? costs.reduce<number>((total, cost) => total + (cost ?? 0), 0)
                : null;
            measurement.fullCostUsd =
              measurement.modelCostUsd !== null && infraRate !== null
                ? measurement.modelCostUsd + infraRate
                : null;
            if (process.env.WORKFLOW_LIVE === "true")
              console.log(
                JSON.stringify({
                  concurrency,
                  index,
                  status: measurement.status,
                  failureStage: measurement.failureStage,
                  attempts: measurement.attempts,
                }),
              );
          }
        },
      });
      results.push({ concurrency, ...summarizeBenchmark(result), runs: result.runs });
    }
    const sourceAfter = await fingerprint();
    const output = resolve(
      process.env.WORKFLOW_BENCHMARK_OUTPUT ?? "output/verification/workflow-benchmark.json",
    );
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        {
          mode:
            process.env.WORKFLOW_LIVE === "true"
              ? "live-providers-private-databases"
              : "isolated-simulated-providers",
          scope:
            process.env.WORKFLOW_LIVE === "true"
              ? "Live model, embedding, storage, and vector APIs with private PostgreSQL and Redis. Production upload, extraction, retrieval, review, publication, and report functions. Task delivery and auth are simulated; direct backend calls do not measure Cloud Run HTTP capacity. No email delivery or billed infrastructure cost is measured."
              : "Production upload handler, real PDF/image files, extraction and retrieval logic, Redis capacity limit, queued review worker, SQL publication, report creation and HTML download. Task delivery, auth, storage, model replies, embeddings, and vector service are simulated. No email delivery, HTTP transport load, cloud capacity, or billable cost is measured.",
          globalGeminiConcurrency: Number(process.env.GEMINI_GLOBAL_CONCURRENCY ?? 4),
          providerLocation: process.env.GOOGLE_CLOUD_LOCATION ?? "global",
          documentsPerCase: 1,
          legalQuality: {
            status: "unmeasured",
            reason:
              "No approved rule pack or independent legal reference labels are supplied. Workflow success measures operational completion only.",
          },
          openAiExtractionFallback: !["0", "false"].includes(
            process.env.OPENAI_DOCUMENT_EXTRACTION_FALLBACK ?? "true",
          ),
          rateCard: rates,
          maxTaskDeliveriesPerStage: deliveries,
          measurements,
          infrastructureAllocationUsdPerCase: infraRate,
          sourceSha256: sourceBefore.hash,
          sourceFiles: sourceBefore.sources,
          sourceChangedDuringRun: sourceBefore.hash !== sourceAfter.hash,
          nodeVersion: process.version,
          datasetSha256: createHash("sha256").update(pdf).update(image).digest("hex"),
          retrievalQueries: queries,
          results,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(results.map(({ runs: _runs, ...summary }) => summary)));
    expect(sourceBefore.hash).toBe(sourceAfter.hash);
    expect(queries).toBeGreaterThan(0);
    expect(results.every((result) => result.failed === 0)).toBe(true);
  },
);
