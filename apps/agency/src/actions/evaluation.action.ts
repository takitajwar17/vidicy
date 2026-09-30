"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import type OpenAI from "openai";
import { eq, and, desc, asc } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/db";
import {
  getOpenAIClient,
  isModelAvailabilityError,
  isModelParameterCompatibilityError,
  isTimeoutLikeAIError,
} from "@/lib/openai";
import { queryDocumentChunksFromVectorize } from "@/lib/vectorize-query";
import { AI_MAX_TOKENS_LARGE, AI_MAX_TOKENS_SMALL, AI_MAX_COMBINED_TEXT_LENGTH, MODIFICATION_GAP_DAYS_THRESHOLD, AI_TIMEOUT_CHAT_MS, AI_TIMEOUT_EMBEDDING_MS } from "@/constants";
import { requireApplicationPermission } from "@/utils/application-auth";
import { revalidatePath } from "next/cache";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { logger, logAlert } from "@/infra/logger";
import { extractDocumentImages, extractPdfMetadata, type PdfMetadataSignals } from "@/services/pdf-parser";
import { ensureDocumentExtraction } from "@/services/document-pipeline";
import { sanitizeForPrompt } from "@/services/atlas-prompt";
import { trackUsage, USAGE_EVENTS } from "@/infra/usage-tracking";
import {
  visaApplicationTable,
  applicantTable,
  checklistItemTable,
  uploadedDocumentTable,
  documentEvaluationTable,
  APPLICATION_PERMISSIONS,
  DOCUMENT_INDEXING_STATUS,
  VISA_APPLICATION_STATUS,
  AGENCY_CASE_STATUS,
  CLIENT_REPORT_STATUS,
  MARKETING_EVENT_TYPE,
} from "@/db/schema";
import { recordMarketingEvent } from "@/server/marketing/events";

// ---------------------------------------------------------------------------
// 3. evaluateDocumentsAction
// ---------------------------------------------------------------------------

const evaluateDocumentsSchema = z.object({
  applicationId: z.string().min(1),
  applicantId: z.string().min(1),
});

const EVALUATION_TRANSLATION_MODEL = "gpt-4.1-mini";
const EVALUATION_ANALYSIS_PRIMARY_MODEL = "gpt-5.4";
const EVALUATION_ANALYSIS_FALLBACK_MODEL = "gpt-4o";
const EVALUATION_ANALYSIS_REASONING_EFFORT = "medium" as const;

export async function createEvaluationCompletionWithFallback({
  openai,
  systemPrompt,
  userContent,
  schemaName,
  schema,
  maxTokens,
}: {
  openai: OpenAI;
  systemPrompt: string;
  userContent: OpenAI.ChatCompletionUserMessageParam["content"];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}) {
  try {
    return await openai.chat.completions.create({
      model: EVALUATION_ANALYSIS_PRIMARY_MODEL,
      reasoning_effort: EVALUATION_ANALYSIS_REASONING_EFFORT,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
      max_completion_tokens: maxTokens,
    }, { signal: AbortSignal.timeout(AI_TIMEOUT_CHAT_MS) });
  } catch (primaryError) {
    const shouldFallback =
      isModelAvailabilityError({ error: primaryError, model: EVALUATION_ANALYSIS_PRIMARY_MODEL }) ||
      isModelParameterCompatibilityError({ error: primaryError }) ||
      isTimeoutLikeAIError({ error: primaryError });

    if (!shouldFallback) {
      throw primaryError;
    }

    logger.warn("Primary evaluation model unavailable, retrying fallback model", {
      primaryModel: EVALUATION_ANALYSIS_PRIMARY_MODEL,
      fallbackModel: EVALUATION_ANALYSIS_FALLBACK_MODEL,
      error: primaryError,
    });

    return openai.chat.completions.create({
      model: EVALUATION_ANALYSIS_FALLBACK_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
      temperature: 0,
      max_tokens: maxTokens,
    }, { signal: AbortSignal.timeout(AI_TIMEOUT_CHAT_MS) });
  }
}

// ---------------------------------------------------------------------------
// Zod schemas for validating AI responses — .catch() on each field means a
// bad AI response degrades gracefully instead of throwing.
// ---------------------------------------------------------------------------

/** Structured fields extracted from a single document during Phase 1 evaluation. */
const extractedFieldsSchema = z.object({
  holderName: z.string().nullable().catch(null),
  expiryDate: z.string().nullable().catch(null),       // "YYYY-MM-DD" or null
  documentNumber: z.string().nullable().catch(null),
  issuingAuthority: z.string().nullable().catch(null),
  language: z.string().catch("unknown"),               // ISO 639-1, e.g. "en", "fr", "ar"
  dateRange: z.object({ from: z.string(), to: z.string() }).nullable().catch(null),
}).catch({ holderName: null, expiryDate: null, documentNumber: null, issuingAuthority: null, language: "unknown", dateRange: null });

type ExtractedFields = z.infer<typeof extractedFieldsSchema>;

const perDocAiResponseSchema = z.object({
  status: z.enum(["ok", "needs_review", "missing_content", "wrong_document"]).catch("needs_review"),
  score: z.number().catch(50).transform((n) => Math.round(Math.max(0, Math.min(100, n)))),
  issues: z.array(z.string()).catch([]),
  strengths: z.array(z.string()).catch([]),
  feedback: z.string().catch(""),
  /** AI confidence in its own evaluation (0-100). 90+ = clear machine-readable text. */
  confidence: z.number().catch(50).transform((n) => Math.round(Math.max(0, Math.min(100, n)))),
  confidenceReason: z.string().catch(""),
  extractedFields: extractedFieldsSchema,
});

const orchestratorItemSchema = z.object({
  status: z.enum(["ok", "missing", "needs_review"]).catch("needs_review"),
  feedback: z.string().catch(""),
  score: z.number().transform((n) => Math.round(Math.max(0, Math.min(100, n)))).optional().catch(undefined),
  issues: z.array(z.string()).optional().catch(undefined),
  strengths: z.array(z.string()).optional().catch(undefined),
  hasDocument: z.boolean().optional().catch(undefined),
  hasContent: z.boolean().optional().catch(undefined),
  confidence: z.number().optional().catch(undefined),
  confidenceReason: z.string().optional().catch(undefined),
});

const orchestratorResponseSchema = z.object({
  overallScore: z.number().transform((n) => Math.round(Math.max(0, Math.min(100, n)))),
  riskLevel: z.enum(["low", "medium", "high"]),
  summary: z.string(),
  redFlags: z.array(z.string()).catch([]),
  strengths: z.array(z.string()).catch([]),
  recommendations: z.array(z.string()).catch([]),
  itemFeedback: z.record(orchestratorItemSchema).catch({}),
});

type EvaluationData = z.infer<typeof orchestratorResponseSchema>;

// ---------------------------------------------------------------------------
// JSON Schema objects for OpenAI Structured Outputs (strict: true).
// These mirror the Zod schemas above in JSON Schema format. All properties are
// required and additionalProperties: false — required for strict mode.
// The Zod schemas remain as the runtime validation + transform layer.
// ---------------------------------------------------------------------------

const perDocJsonSchema = {
  type: "object",
  properties: {
    status: { enum: ["ok", "needs_review", "missing_content", "wrong_document"] },
    score: { type: "integer", minimum: 0, maximum: 100 },
    issues: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    feedback: { type: "string" },
    confidence: { type: "integer", minimum: 0, maximum: 100 },
    confidenceReason: { type: "string" },
    extractedFields: {
      type: "object",
      properties: {
        holderName: { anyOf: [{ type: "string" }, { type: "null" }] },
        expiryDate: { anyOf: [{ type: "string" }, { type: "null" }] },
        documentNumber: { anyOf: [{ type: "string" }, { type: "null" }] },
        issuingAuthority: { anyOf: [{ type: "string" }, { type: "null" }] },
        language: { type: "string" },
        dateRange: {
          anyOf: [
            {
              type: "object",
              properties: {
                from: { type: "string" },
                to: { type: "string" },
              },
              required: ["from", "to"],
              additionalProperties: false,
            },
            { type: "null" },
          ],
        },
      },
      required: ["holderName", "expiryDate", "documentNumber", "issuingAuthority", "language", "dateRange"],
      additionalProperties: false,
    },
  },
  required: ["status", "score", "issues", "strengths", "feedback", "confidence", "confidenceReason", "extractedFields"],
  additionalProperties: false,
};

const orchestratorItemJsonSchema = {
  type: "object",
  properties: {
    status: { enum: ["ok", "missing", "needs_review"] },
    feedback: { type: "string" },
    score: { type: "integer", minimum: 0, maximum: 100 },
    issues: { type: "array", items: { type: "string" } },
    strengths: { type: "array", items: { type: "string" } },
    hasDocument: { type: "boolean" },
    hasContent: { type: "boolean" },
  },
  required: ["status", "feedback", "score", "issues", "strengths", "hasDocument", "hasContent"],
  additionalProperties: false,
};

/**
 * Builds a strict JSON Schema for the orchestrator response at request time.
 * itemFeedback keys are the actual checklist item IDs known for this evaluation,
 * which allows strict: true (all properties named, additionalProperties: false).
 * Schema caching is not a concern at this volume.
 */
function buildOrchestratorJsonSchema(items: Array<{ id: string }>) {
  const itemProps: Record<string, typeof orchestratorItemJsonSchema> = {};
  for (const item of items) {
    itemProps[item.id] = orchestratorItemJsonSchema;
  }
  return {
    type: "object",
    properties: {
      overallScore: { type: "integer", minimum: 0, maximum: 100 },
      riskLevel: { enum: ["low", "medium", "high"] },
      summary: { type: "string" },
      redFlags: { type: "array", items: { type: "string" } },
      strengths: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } },
      itemFeedback: {
        type: "object",
        properties: itemProps,
        required: Object.keys(itemProps),
        additionalProperties: false,
      },
    },
    required: ["overallScore", "riskLevel", "summary", "redFlags", "strengths", "recommendations", "itemFeedback"],
    additionalProperties: false,
  };
}

// Shared interface — used both in the handler and buildPhase1Fallback
interface PerDocumentEvaluation {
  checklistItemId: string;
  documentName: string;
  isRequired: boolean;
  hasDocument: boolean;
  hasContent: boolean;
  status: "ok" | "needs_review" | "missing_content" | "wrong_document" | "missing";
  score: number;
  issues: string[];
  strengths: string[];
  feedback: string;
  /** AI confidence in its own evaluation (0-100). Auto-lowered for scanned/image docs. */
  confidence: number;
  /** Human-readable explanation of the confidence level */
  confidenceReason: string;
  /** Structured fields extracted from the document for cross-doc consistency checks */
  extractedFields: ExtractedFields;
  /** Truncated text excerpt sent to the orchestrator (first 3 000 chars) */
  contentExcerpt: string;
  /** True when this result was reused from the previous evaluation (document unchanged) */
  reused?: boolean;
}

/**
 * Computes a stable version key for a document slot.
 * Changes when: a new file is uploaded (new doc.id) or text content
 * becomes available for the first time (hasContent flag flips).
 * Unchanged slots produce the same key across re-runs, allowing the
 * evaluator to skip redundant AI calls.
 */
function getDocVersionKey(
  doc: { id: string } | undefined,
  hasContent: boolean,
  hasVision: boolean,
): string {
  if (!doc) return "missing";
  return `${doc.id}:${hasContent ? "1" : "0"}:${hasVision ? "1" : "0"}`;
}

/**
 * Returns the minimum overall score required to mark an application as "ready".
 * Higher-scrutiny visa types need a higher score before we signal readiness.
 * The lookup is case-insensitive and falls back to 80 for unrecognised types.
 */
function getReadyThreshold(visaType: string): number {
  const t = visaType.toLowerCase();

  // Tourist / visitor — moderate ties, 3 months or less, well-defined checklist
  if (/tourist|visitor|b-?1|b-?2|shengen|schengen|short.?stay|vacation/.test(t)) return 78;

  // Student — significant document burden but well-defined checklist
  if (/student|f-?1|f-?2|tier.?4|study/.test(t)) return 80;

  // Work — employer sponsorship, labour market checks, high scrutiny
  if (/work|employ|h-?1|h-?2|l-?1|o-?1|e-?1|e-?2|tier.?2|labour|labor|skilled/.test(t)) return 85;

  // Permanent residence / immigration — highest scrutiny
  if (/permanent|pr\b|green.?card|immigrant|settlement|indefinite/.test(t)) return 88;

  // Family / dependent — moderate scrutiny
  if (/family|spouse|dependent|partner|reunif/.test(t)) return 80;

  // Business — similar to tourist but with additional financial docs
  if (/business|b-?1/.test(t)) return 80;

  return 80; // safe default
}

/**
 * Builds a best-effort evaluation from Phase 1 per-document results.
 * Used when the orchestrator call fails so Phase 1 work is never discarded.
 * Required documents are weighted 2× optional ones in the overall score.
 */
function buildPhase1Fallback(evals: PerDocumentEvaluation[]): EvaluationData {
  const totalWeight = evals.reduce((w, e) => w + (e.isRequired ? 2 : 1), 0);
  const weightedScore =
    totalWeight === 0
      ? 0
      : Math.round(
          evals.reduce((sum, e) => sum + e.score * (e.isRequired ? 2 : 1), 0) / totalWeight
        );
  const riskLevel: "low" | "medium" | "high" =
    weightedScore >= 80 ? "low" : weightedScore >= 65 ? "medium" : "high";

  const missingRequired = evals.filter((e) => e.isRequired && !e.hasDocument);

  const itemFeedback: EvaluationData["itemFeedback"] = {};
  for (const e of evals) {
    itemFeedback[e.checklistItemId] = {
      status: e.status === "missing" ? "missing" : e.status === "ok" ? "ok" : "needs_review",
      feedback: e.feedback,
      score: e.score,
      issues: e.issues,
      strengths: e.strengths,
      hasDocument: e.hasDocument,
      hasContent: e.hasContent,
      confidence: e.confidence,
      confidenceReason: e.confidenceReason,
    };
  }

  return {
    overallScore: weightedScore,
    riskLevel,
    summary: `Application evaluated across ${evals.length} checklist item(s). ${
      missingRequired.length > 0
        ? `${missingRequired.length} required document(s) are missing.`
        : "All required documents have been uploaded."
    } Overall readiness score: ${weightedScore}/100.`,
    redFlags: missingRequired.map((e) => `Missing required document: ${e.documentName}`),
    strengths: evals
      .filter((e) => e.status === "ok")
      .map((e) => `${e.documentName} meets requirements`),
    recommendations: missingRequired.map(
      (e) => `Upload the missing required document: ${e.documentName}`
    ),
    itemFeedback,
  };
}

/**
 * Maps a checklist document name to the primary overstay-risk dimension it evidences.
 * Used to focus per-document evaluation on what a visa officer actually cares about.
 */
function getDocumentDimension(documentName: string): { dimension: string; signals: string } {
  const n = documentName.toLowerCase();

  if (/passport|travel.*doc|national.*id|id.*card/.test(n))
    return {
      dimension: "Document Authenticity & Prior Travel Record (Dimension 5 + 4)",
      signals: "Check visa stamps for prior travel history and compliance. Look for expired validity, name inconsistencies, or signs of tampering.",
    };
  if (/employ|job.*offer|contract|appointment.*letter|noc|no.*objection/.test(n))
    return {
      dimension: "Ties to Home Country — Employment (Dimension 1)",
      signals: "Does this document prove the applicant has a stable job to return to? Check employer credibility, salary continuity, leave approval, and return obligation.",
    };
  if (/salary|payslip|pay.*stub|pay.*slip|income/.test(n))
    return {
      dimension: "Financial Credibility + Ties to Home Country (Dimensions 1 & 2)",
      signals: "Verify salary is consistent with stated employment. Check for irregular deposits that suggest borrowed funds. Look for stability over multiple months.",
    };
  if (/bank.*statement|account.*statement|financial|savings|fund/.test(n))
    return {
      dimension: "Financial Credibility (Dimension 2)",
      signals: "Look for genuine, consistent savings — not sudden large deposits before the application. Assess whether funds cover the intended stay. Check for signs of temporarily borrowed funds.",
    };
  if (/marriage|spouse|family|birth.*cert|dependent|child|parent/.test(n))
    return {
      dimension: "Ties to Home Country — Family (Dimension 1)",
      signals: "Dependents and family staying at home are a strong return incentive. Verify relationship, residency of family members, and that dependents are NOT also travelling.",
    };
  if (/property|deed|land|house|rent|mortgage|lease/.test(n))
    return {
      dimension: "Ties to Home Country — Assets (Dimension 1)",
      signals: "Property ownership is a strong tie. Verify authenticity of ownership documents and that property is in the home country.",
    };
  if (/hotel|flight|ticket|itinerary|booking|accommodation/.test(n))
    return {
      dimension: "Trip Purpose Clarity (Dimension 3)",
      signals: "Does the booking confirm a clear departure date? Is the duration of stay proportionate to the stated purpose? Return ticket is critical — one-way tickets are a red flag.",
    };
  if (/invitation|sponsor|host|cover.*letter|purpose|intent/.test(n))
    return {
      dimension: "Trip Purpose Clarity (Dimension 3)",
      signals: "Is the stated purpose specific and credible? Does the invitation come from a legitimate, verifiable source? Does it commit to financial responsibility? Vague purposes are red flags.",
    };
  if (/insurance|travel.*insur|medical.*insur/.test(n))
    return {
      dimension: "Trip Purpose Clarity + Document Completeness (Dimension 3 & 5)",
      signals: "Coverage period must match the intended stay. Coverage amount must meet destination country minimums. Gaps in coverage suggest the applicant may extend their stay.",
    };
  if (/business.*regist|company.*regist|trade.*licen/.test(n))
    return {
      dimension: "Ties to Home Country — Business Ownership (Dimension 1)",
      signals: "Business ownership is a strong home-country tie. Verify the business is active and registered. Owner must return to run it — a genuine anchor.",
    };
  return {
    dimension: "Document Completeness & Authenticity (Dimension 5)",
    signals: "Evaluate completeness, issuing authority credibility, internal consistency, and any signs of document fraud or alteration.",
  };
}

export const evaluateDocumentsAction = createServerAction()
  .input(evaluateDocumentsSchema)
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(input.applicationId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION);
    await checkActionRateLimit("evaluateDocuments", session.userId, 10);
    trackUsage({ userId: session.userId, event: USAGE_EVENTS.EVALUATION_RUN, metadata: { applicationId: input.applicationId } });

    const db = getDB();

    // ---------------------------------------------------------------------------
    // Load application, applicant, checklist items, and uploaded documents
    // ---------------------------------------------------------------------------

    const [application, applicant] = await Promise.all([
      db.query.visaApplicationTable.findFirst({
        where: eq(visaApplicationTable.id, input.applicationId),
      }),
      db.query.applicantTable.findFirst({
        where: and(
          eq(applicantTable.id, input.applicantId),
          eq(applicantTable.applicationId, input.applicationId)
        ),
      }),
    ]);

    if (!application) {
      throw new ZSAError("NOT_FOUND", "Application not found");
    }

    if (!applicant) {
      throw new ZSAError("NOT_FOUND", "Applicant not found");
    }

    // Reads can be parallelised safely — also fetch the previous evaluation for incremental reuse
    const [checklistItems, uploadedDocuments, previousEvaluation] = await Promise.all([
      db.query.checklistItemTable.findMany({
        where: and(
          eq(checklistItemTable.applicationId, application.id),
          eq(checklistItemTable.applicantId, input.applicantId)
        ),
        orderBy: [asc(checklistItemTable.sortOrder)],
      }),
      db.query.uploadedDocumentTable.findMany({
        where: and(
          eq(uploadedDocumentTable.applicationId, application.id),
          eq(uploadedDocumentTable.applicantId, input.applicantId)
        ),
        orderBy: [desc(uploadedDocumentTable.uploadedAt)],
      }),
      db.query.documentEvaluationTable.findFirst({
        where: and(
          eq(documentEvaluationTable.applicationId, application.id),
          eq(documentEvaluationTable.applicantId, input.applicantId)
        ),
        orderBy: [desc(documentEvaluationTable.createdAt)],
      }),
    ]);

    if (checklistItems.length === 0) {
      throw new ZSAError("NOT_FOUND", "No checklist items exist to evaluate for this application.");
    }

    if (uploadedDocuments.length === 0) {
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Please upload at least one document before running an evaluation."
      );
    }

    const openai = getOpenAIClient();

    // ---------------------------------------------------------------------------
    // Application context string — injected into every per-document prompt
    // ---------------------------------------------------------------------------
    const applicationContext = `Visa type: ${application.visaType}
Applicant country (passport): ${application.homeCountry}
Currently residing in: ${application.currentCountry}
Destination country: ${application.destinationCountry}
Embassy: ${application.embassy}
Applicant name: ${sanitizeForPrompt(applicant.name, 200)} (${applicant.relationship})`;

    // ---------------------------------------------------------------------------
    // Build a map: checklistItemId → latest uploaded document for that item
    // ---------------------------------------------------------------------------

    // Group uploaded documents by checklistItemId (latest first due to orderBy uploadedAt desc)
    const docByChecklistItem = new Map<string, typeof uploadedDocuments[0]>();
    for (const doc of uploadedDocuments) {
      if (doc.checklistItemId && !docByChecklistItem.has(doc.checklistItemId)) {
        docByChecklistItem.set(doc.checklistItemId, doc);
      }
    }

    // ---------------------------------------------------------------------------
    // Fetch text content for documents that were uploaded but not yet extracted.
    // For PDFs we use native extraction + OpenAI fallback (for scanned docs).
    // For image files we use OpenAI extraction directly.
    // ---------------------------------------------------------------------------

    let r2Bucket: R2Bucket | null = null;
    let vectorize: VectorizeIndex | null = null;
    try {
      const { env } = await getCloudflareContext({ async: true });
      r2Bucket = env.R2 ?? null;
      vectorize = env.VECTORIZE ?? null;
    } catch {
      // Not in Cloudflare Workers context (local dev)
    }

    // Fetch missing text content in parallel through the shared extraction service.
    // This keeps evaluation aligned with the upload-time extraction pipeline and
    // persists any on-demand extraction result back onto the document record.
    const textByDocId = new Map<string, string>();

    await Promise.all(
      [...docByChecklistItem.values()].map(async (doc) => {
        if (doc.textContent) {
          // Already extracted by the background pipeline — use cached value
          textByDocId.set(doc.id, doc.textContent);
          return;
        }

        try {
          const extraction = await ensureDocumentExtraction({
            documentId: doc.id,
          });

          if (extraction.success && extraction.textContent) {
            textByDocId.set(doc.id, extraction.textContent);
          }
        } catch (err) {
          logger.warn("On-demand text extraction failed", { documentId: doc.id, error: err });
        }
      })
    );

    // ---------------------------------------------------------------------------
    // Language translation — for documents whose language was detected as non-English
    // in a prior evaluation run, pre-translate before Phase 1 so the AI evaluates
    // English text and returns accurate scores. On a first-time evaluation the Phase 1
    // prompt instructs the AI to translate internally (zero extra API calls).
    // ---------------------------------------------------------------------------

    const translatedTextByDocId = new Map<string, string>();

    const docsNeedingTranslation = [...docByChecklistItem.entries()].filter(([itemId, doc]) => {
      const rawText = textByDocId.get(doc.id) ?? "";
      if (rawText.trim().length === 0) return false;
      const prevLang = (
        previousEvaluation?.itemFeedback?.[itemId] as
          | { extractedFields?: { language?: string } }
          | undefined
      )?.extractedFields?.language;
      return prevLang && prevLang !== "en" && prevLang !== "unknown";
    });

    if (docsNeedingTranslation.length > 0) {
      await Promise.all(
        docsNeedingTranslation.map(async ([itemId, doc]) => {
          const rawText = textByDocId.get(doc.id) ?? "";
          const prevLang = (
            previousEvaluation!.itemFeedback![itemId] as
              | { extractedFields?: { language?: string } }
              | undefined
          )?.extractedFields?.language ?? "unknown";
          try {
            const response = await openai.chat.completions.create({
              model: EVALUATION_TRANSLATION_MODEL,
              messages: [
                {
                  role: "user",
                  content: `Translate the following document text from ${prevLang} to English. Preserve all names, numbers, dates, and document structure exactly. Return only the translated text.\n\n${rawText.slice(0, 15000)}`,
                },
              ],
              temperature: 0,
              max_tokens: AI_MAX_TOKENS_LARGE,
            }, { signal: AbortSignal.timeout(AI_TIMEOUT_CHAT_MS) });
            const translated = response.choices[0].message.content?.trim();
            if (translated) {
              translatedTextByDocId.set(doc.id, translated);
              logger.info("Document translated to English", { documentId: doc.id, fromLanguage: prevLang });
            }
          } catch (err) {
            logger.warn("Document translation failed", { documentId: doc.id, language: prevLang, error: err });
          }
        })
      );
    }

    // ---------------------------------------------------------------------------
    // Vectorize retrieval — for indexed documents, fetch semantically relevant
    // chunks instead of blindly slicing the first 8 000 raw characters.
    // For a 20-page bank statement this retrieves the most relevant pages rather
    // than always reading only the header. Falls back gracefully if unavailable.
    // ---------------------------------------------------------------------------

    const relevantChunksByItemId = new Map<string, string>();

    if (vectorize) {
      // Only query for documents that have been fully indexed
      const vectorizedItems = checklistItems.filter((item) => {
        const doc = docByChecklistItem.get(item.id);
        return (
          doc &&
          doc.indexingStatus === DOCUMENT_INDEXING_STATUS.COMPLETED &&
          (doc.chunkCount ?? 0) > 0
        );
      });

      if (vectorizedItems.length > 0) {
        try {
          // One batch embedding call — one query text per indexed document
          const queryTexts = vectorizedItems.map(
            (item) => `${item.documentName}: ${(item.description ?? "").slice(0, 400)}`
          );
          const embedResp = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: queryTexts,
          }, { signal: AbortSignal.timeout(AI_TIMEOUT_EMBEDDING_MS) });

          // Parallel Vectorize queries — each scoped to its own documentId
          const vz = vectorize;
          await Promise.all(
            vectorizedItems.map(async (item, i) => {
              const doc = docByChecklistItem.get(item.id)!;
              const chunks = await queryDocumentChunksFromVectorize({
                vectorize: vz,
                queryVector: embedResp.data[i].embedding,
                applicationId: application.id,
                documentId: doc.id,
              });

              if (chunks.length > 0) {
                // Concatenate up to ~6 000 chars of semantically relevant content
                let combined = "";
                for (const chunk of chunks) {
                  if (combined.length + chunk.length > AI_MAX_COMBINED_TEXT_LENGTH) break;
                  combined += (combined ? "\n\n---\n\n" : "") + chunk;
                }
                relevantChunksByItemId.set(item.id, combined);
              }
            })
          );

          logger.info("Vectorize: retrieved relevant chunks", { retrieved: relevantChunksByItemId.size, total: vectorizedItems.length });
        } catch (err) {
          logger.warn("Vectorize retrieval failed, falling back to raw text head", { error: err });
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Vision data loading — fetch document bytes from R2 and produce base64
    // image data URLs for GPT-4o Vision analysis.
    //   - Image uploads (JPEG/PNG/WebP): encoded directly, zero conversion needed.
    //   - PDFs: first 3 pages rendered via PDF.js + OffscreenCanvas (Workers native).
    //     Falls back silently to empty images if rendering is unsupported.
    // Runs in parallel with no blocking dependency on text extraction.
    // ---------------------------------------------------------------------------

    const visionDataByDocId = new Map<string, string[]>();
    const metadataByDocId = new Map<string, PdfMetadataSignals>();

    if (r2Bucket) {
      await Promise.all(
        [...docByChecklistItem.values()].map(async (doc) => {
          // Only process image files and PDFs; skip other types (DOC, etc.)
          const isImage = doc.mimeType.startsWith("image/");
          const isPdf = doc.mimeType === "application/pdf";
          if (!isImage && !isPdf) return;

          try {
            const r2Object = await r2Bucket!.get(doc.fileKey);
            if (!r2Object) return;
            const arrayBuffer = await r2Object.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);

            // Vision extraction (parallel)
            const [imagesResult, metaResult] = await Promise.all([
              extractDocumentImages(doc.mimeType, bytes, 3),
              isPdf ? extractPdfMetadata(bytes) : Promise.resolve(null),
            ]);

            if (imagesResult.success && imagesResult.images.length > 0) {
              visionDataByDocId.set(doc.id, imagesResult.images);
            }
            if (metaResult) {
              metadataByDocId.set(doc.id, metaResult);
            }
          } catch (err) {
            logger.warn("Vision/metadata extraction failed", { documentId: doc.id, error: err });
          }
        })
      );

      if (visionDataByDocId.size > 0) {
        logger.info("Vision: loaded images for documents", { count: visionDataByDocId.size });
      }
    }

    // ---------------------------------------------------------------------------
    // PHASE 1: Per-document individual evaluation (parallel AI calls)
    // ---------------------------------------------------------------------------

    const perDocumentEvaluations: PerDocumentEvaluation[] = await Promise.all(
      checklistItems.map(async (item): Promise<PerDocumentEvaluation> => {
        const doc = docByChecklistItem.get(item.id);
        const hasDocument = !!doc;
        // Prefer pre-translated text when available (non-English docs identified from a prior eval)
        const rawText = doc
          ? (translatedTextByDocId.get(doc.id) ?? textByDocId.get(doc.id) ?? "")
          : "";
        const isTranslated = !!doc && translatedTextByDocId.has(doc.id);
        const hasContent = rawText.trim().length > 0;
        const visionImages = doc ? (visionDataByDocId.get(doc.id) ?? []) : [];
        const hasVision = visionImages.length > 0;

        // ---------------------------------------------------------------------------
        // Incremental evaluation — skip the AI call if this document slot is unchanged
        // since the last evaluation. Version key encodes document identity, text content
        // availability, and vision availability — so newly-enabled vision triggers re-eval.
        // ---------------------------------------------------------------------------
        const currentVersionKey = getDocVersionKey(doc, hasContent, hasVision);
        const prevFeedback = previousEvaluation?.docSnapshots?.[item.id] === currentVersionKey
          ? previousEvaluation.itemFeedback?.[item.id]
          : undefined;

        if (prevFeedback) {
          return {
            checklistItemId: item.id,
            documentName: item.documentName,
            isRequired: !!item.isRequired,
            hasDocument,
            hasContent,
            status: (prevFeedback.status ?? "needs_review") as PerDocumentEvaluation["status"],
            score: prevFeedback.score ?? 0,
            issues: prevFeedback.issues ?? [],
            strengths: prevFeedback.strengths ?? [],
            feedback: prevFeedback.feedback ?? "",
            confidence: (prevFeedback as { confidence?: number }).confidence ?? 70,
            confidenceReason: (prevFeedback as { confidenceReason?: string }).confidenceReason ?? "Reused from previous evaluation.",
            extractedFields: (prevFeedback as { extractedFields?: ExtractedFields }).extractedFields ?? { holderName: null, expiryDate: null, documentNumber: null, issuingAuthority: null, language: "unknown", dateRange: null },
            contentExcerpt: rawText.slice(0, 3000),
            reused: true,
          };
        }

        // Documents without any upload → evaluated as missing immediately (no AI call needed)
        if (!hasDocument) {
          return {
            checklistItemId: item.id,
            documentName: item.documentName,
            isRequired: !!item.isRequired,
            hasDocument: false,
            hasContent: false,
            status: "missing",
            score: 0,
            issues: [`${item.isRequired ? "Required" : "Optional"} document has not been uploaded.`],
            strengths: [],
            feedback: `No document has been uploaded for "${item.documentName}".`,
            confidence: 100,
            confidenceReason: "Document is absent; status is certain.",
            extractedFields: { holderName: null, expiryDate: null, documentNumber: null, issuingAuthority: null, language: "unknown", dateRange: null },
            contentExcerpt: "",
          };
        }

        // Build the per-document evaluation prompt.
        // Translated docs use rawText directly (Vectorize chunks are in the original language).
        // For non-translated docs, prefer Vectorize chunks over the raw first 8 000 chars.
        const relevantChunks = isTranslated ? undefined : relevantChunksByItemId.get(item.id);
        const contentSection = relevantChunks
          ? `DOCUMENT CONTENT (semantically relevant sections, ${relevantChunks.length} chars):\n${relevantChunks}`
          : hasContent
            ? `EXTRACTED DOCUMENT CONTENT${isTranslated ? " (machine-translated to English)" : ""} (first 8 000 characters):\n${rawText.slice(0, 8000)}`
            : `DOCUMENT CONTENT: Unable to extract text from "${doc.fileName}". The file may be a scanned image or encrypted PDF. Evaluate based on file presence only.`;

        // Build document integrity signals from PDF metadata (PDFs only)
        const meta = doc ? metadataByDocId.get(doc.id) : undefined;
        let metadataSection = "";
        if (meta) {
          const lines: string[] = [];
          if (meta.creationDate) {
            lines.push(`- Created: ${meta.creationDate.toISOString().slice(0, 10)}`);
          }
          if (meta.modDate && meta.isModified) {
            lines.push(
              `- Last modified: ${meta.modDate.toISOString().slice(0, 10)}` +
              (meta.modificationGapDays !== null
                ? ` (${meta.modificationGapDays} day${meta.modificationGapDays === 1 ? "" : "s"} after creation)`
                : "")
            );
          }
          if (meta.creator) lines.push(`- Authoring tool: "${meta.creator}"`);
          if (meta.producer) lines.push(`- PDF renderer: "${meta.producer}"`);
          if (meta.pageCount > 0) lines.push(`- Page count: ${meta.pageCount}`);
          // Anomaly flags
          if (meta.creationInFuture) lines.push(`- ⚠️ WARNING: Creation date is in the future — impossible for a genuine document`);
          if (meta.hasNoMetadata) lines.push(`- ⚠️ WARNING: All metadata fields are empty — metadata may have been deliberately stripped`);
          if (meta.isModified && meta.modificationGapDays !== null && meta.modificationGapDays > MODIFICATION_GAP_DAYS_THRESHOLD) {
            lines.push(`- ⚠️ WARNING: Document was modified ${meta.modificationGapDays} days after creation — unusual for a freshly issued document`);
          }
          if (lines.length > 0) {
            metadataSection = `\nDOCUMENT INTEGRITY SIGNALS (PDF metadata):\n${lines.join("\n")}\nConsider these signals when assessing document authenticity and confidence.\n`;
          }
        }

        const commonMistakesSection = item.commonMistakes
          ? `Common mistakes to watch for:\n${item.commonMistakes}`
          : "";

        // If document may be non-English and no pre-translation was done (first evaluation),
        // the system prompt instructs the AI to translate before evaluating.
        const perDocSystemPrompt = `You are a senior visa agency review specialist evaluating client documents before final submission. Focus on completeness, route-specific requirements, document quality, cross-file consistency, authenticity signals, and submission risk. Return ONLY valid JSON. If the document text is in a language other than English, translate the content to English before evaluating it.`;

        const { dimension: docDimension, signals: docSignals } = getDocumentDimension(item.documentName);

        const perDocUserPrompt = `You are evaluating a document for an agency review desk before the application reaches final submission. Analyse this document carefully and return a structured JSON evaluation that a human reviewer can act on.

APPLICATION CONTEXT:
${applicationContext}

DOCUMENT BEING EVALUATED:
- Document type required: ${item.documentName}
- Uploaded file name: ${doc.fileName}
- Required: ${item.isRequired ? "Yes" : "No"}
- Official requirements & description: ${item.description}
${commonMistakesSection}

OVERSTAY RISK DIMENSION — what this document evidences:
- Primary dimension: ${docDimension}
- Key overstay risk signals to assess: ${docSignals}

${contentSection}
${metadataSection}

Evaluate whether this document:
1. Is the correct document type for "${item.documentName}"
2. Meets the official requirements described above
3. Contains complete and accurate information
4. Has any of the common mistakes listed above
5. Shows any red flags (expiry, illegibility, wrong format, missing signatures, name mismatches, etc.)
6. Increases or decreases submission risk based on the dimension signals above

Return JSON with this exact structure:
{
  "status": "ok" | "needs_review" | "missing_content" | "wrong_document",
  "score": <integer 0-100>,
  "issues": ["<specific issue found in this document>"],
  "strengths": ["<positive aspect of this document>"],
  "feedback": "<2-3 sentence specific feedback about this document's content and completeness>",
  "confidence": <integer 0-100: 90+ if document text is clear and complete, 50 if partial or ambiguous, 10-20 if little or no text was available to evaluate>,
  "confidenceReason": "<1 sentence explaining your confidence level>",
  "extractedFields": {
    "holderName": "<full name as it appears on the document, or null>",
    "expiryDate": "<expiry or validity-end date in YYYY-MM-DD format, or null>",
    "documentNumber": "<document, account, or reference number, or null>",
    "issuingAuthority": "<issuing bank, government agency, or institution, or null>",
    "language": "<ISO 639-1 language code e.g. 'en', 'fr', 'ar', 'zh', or 'unknown'>",
    "dateRange": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } or null
  }
}`;

        try {
          // When vision images are available, send a multimodal message so GPT-4o
          // can see the document directly — critical for scanned docs with no text.
          const userMessageContent: OpenAI.ChatCompletionUserMessageParam["content"] =
            visionImages.length > 0
              ? [
                  { type: "text", text: perDocUserPrompt },
                  ...visionImages.map((url) => ({
                    type: "image_url" as const,
                    image_url: { url, detail: "high" as const },
                  })),
                ]
              : perDocUserPrompt;

          const response = await createEvaluationCompletionWithFallback({
            openai,
            systemPrompt: perDocSystemPrompt,
            userContent: userMessageContent,
            schemaName: "per_document_evaluation",
            schema: perDocJsonSchema as Record<string, unknown>,
            maxTokens: AI_MAX_TOKENS_SMALL,
          });

          const raw = JSON.parse(response.choices[0].message.content || "{}");
          // perDocAiResponseSchema uses .catch() on every field — parse never throws
          const parsed = perDocAiResponseSchema.parse(raw);

          // Auto-override confidence to 15 only when we have neither text nor vision.
          // With vision available (even for scanned docs), let the AI report its own confidence.
          const finalConfidence = (!hasContent && !hasVision) ? 15 : parsed.confidence;
          const finalConfidenceReason = (!hasContent && !hasVision)
            ? "No text could be extracted; document may be a scanned image or encrypted PDF."
            : parsed.confidenceReason;

          return {
            checklistItemId: item.id,
            documentName: item.documentName,
            isRequired: !!item.isRequired,
            hasDocument: true,
            hasContent,
            status: parsed.status,
            score: parsed.score,
            issues: parsed.issues,
            strengths: parsed.strengths,
            feedback: parsed.feedback,
            confidence: finalConfidence,
            confidenceReason: finalConfidenceReason,
            extractedFields: parsed.extractedFields,
            contentExcerpt: rawText.slice(0, 3000),
          };
        } catch (err) {
          logAlert("ai_api_failure", "Per-document evaluation failed", { checklistItemId: item.id, documentName: item.documentName, error: err });
          // Non-fatal: fall back to a neutral evaluation so we don't block the whole suite
          return {
            checklistItemId: item.id,
            documentName: item.documentName,
            isRequired: !!item.isRequired,
            hasDocument: true,
            hasContent,
            status: "needs_review",
            score: 50,
            issues: ["Could not fully evaluate this document due to a processing error."],
            strengths: [],
            feedback: "Document was uploaded but could not be fully evaluated at this time.",
            confidence: 0,
            confidenceReason: "Evaluation failed due to a processing error.",
            extractedFields: { holderName: null, expiryDate: null, documentNumber: null, issuingAuthority: null, language: "unknown", dateRange: null },
            contentExcerpt: rawText.slice(0, 3000),
          };
        }
      })
    );

    // ---------------------------------------------------------------------------
    // Build docSnapshots — records what version of each document was just evaluated.
    // Persisted with the evaluation so future re-runs can compare against it.
    // ---------------------------------------------------------------------------

    const docSnapshots: Record<string, string> = {};
    for (const item of checklistItems) {
      const doc = docByChecklistItem.get(item.id);
      const rawText = doc ? (textByDocId.get(doc.id) ?? "") : "";
      const hasVisionSnap = doc ? (visionDataByDocId.get(doc.id)?.length ?? 0) > 0 : false;
      docSnapshots[item.id] = getDocVersionKey(doc, rawText.trim().length > 0, hasVisionSnap);
    }

    const reusedCount = perDocumentEvaluations.filter((e) => e.reused).length;
    if (reusedCount > 0) {
      logger.info("Incremental evaluation: reused unchanged documents", { reusedCount, totalItems: checklistItems.length });
    }

    // ---------------------------------------------------------------------------
    // Cross-document consistency analysis — deterministic programmatic checks on
    // structured fields extracted during Phase 1. These results are injected into
    // the orchestrator so the AI doesn't need to re-derive them from raw text.
    // ---------------------------------------------------------------------------

    const consistencyIssues: string[] = [];
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    // Name consistency: compare holderName across all docs that provided one
    const namedEvals = perDocumentEvaluations.filter(
      (e) => e.hasDocument && e.extractedFields.holderName
    );
    if (namedEvals.length >= 2) {
      const normalize = (name: string) =>
        name.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).sort().join(" ");
      const ref = namedEvals[0];
      const refNorm = normalize(ref.extractedFields.holderName!);
      for (const e of namedEvals.slice(1)) {
        if (normalize(e.extractedFields.holderName!) !== refNorm) {
          consistencyIssues.push(
            `Name mismatch: "${ref.documentName}" shows "${ref.extractedFields.holderName}" but "${e.documentName}" shows "${e.extractedFields.holderName}"`
          );
        }
      }
    }

    // Expiry check: flag any document that is already expired
    for (const e of perDocumentEvaluations) {
      if (e.extractedFields.expiryDate && e.extractedFields.expiryDate < today) {
        consistencyIssues.push(
          `Expired document: "${e.documentName}" — expiry date ${e.extractedFields.expiryDate} is in the past`
        );
      }
    }

    // Foreign language documents
    const foreignLangDocs = perDocumentEvaluations.filter(
      (e) =>
        e.hasContent &&
        e.extractedFields.language !== "unknown" &&
        e.extractedFields.language !== "en"
    );

    const consistencySection =
      consistencyIssues.length > 0 || foreignLangDocs.length > 0
        ? `\nPROGRAMMATIC CONSISTENCY CHECKS (pre-computed — treat as facts):\n${
            consistencyIssues.map((i) => `⚠️  ${i}`).join("\n")
          }${
            foreignLangDocs.length > 0
              ? `\n\nFOREIGN LANGUAGE DOCUMENTS DETECTED:\n${foreignLangDocs
                  .map((e) => `- ${e.documentName}: language "${e.extractedFields.language}"`)
                  .join("\n")}\nFactor language accessibility into your assessment.`
              : ""
          }`
        : "\nPROGRAMMATIC CONSISTENCY CHECKS: ✓ No name mismatches, expiry issues, or foreign language documents detected.";

    // ---------------------------------------------------------------------------
    // PHASE 2: Orchestrator — comprehensive evaluation across all documents
    // ---------------------------------------------------------------------------

    const missingDocs = perDocumentEvaluations.filter((e) => !e.hasDocument && e.isRequired);
    const documentEvalSummary = perDocumentEvaluations
      .map((e) => {
        const lines = [
          `Document: ${e.documentName} (${e.isRequired ? "REQUIRED" : "optional"})`,
          `  Status: ${e.status} | Score: ${e.score}/100 | Confidence: ${e.confidence}/100 | Has file: ${e.hasDocument} | Has readable content: ${e.hasContent}`,
          e.issues.length > 0 ? `  Issues: ${e.issues.join("; ")}` : "",
          e.strengths.length > 0 ? `  Strengths: ${e.strengths.join("; ")}` : "",
          `  Feedback: ${e.feedback}`,
          e.contentExcerpt
            ? `  Content excerpt:\n${e.contentExcerpt.split("\n").map((l) => `    ${l}`).join("\n")}`
            : "",
        ].filter(Boolean);
        return lines.join("\n");
      })
      .join("\n\n---\n\n");

    const orchestratorSystemPrompt = `You are a senior visa agency review lead conducting a holistic pre-submission review. Your job is to help the agency review more cases accurately by identifying missing documents, weak evidence, contradictions, and client follow-up actions. Return ONLY valid JSON.`;

    const orchestratorUserPrompt = `You are the final agency reviewer for this application. Review all per-document evaluations and produce a comprehensive readiness assessment using the framework below.

APPLICATION CONTEXT:
${applicationContext}

INDIVIDUAL DOCUMENT EVALUATIONS:
${documentEvalSummary}

${missingDocs.length > 0 ? `MISSING REQUIRED DOCUMENTS (${missingDocs.length}):\n${missingDocs.map((d) => `- ${d.documentName}`).join("\n")}` : "All required documents have been uploaded."}
${consistencySection}

═══════════════════════════════════════════════════════════════
5-DIMENSION AGENCY READINESS SCORING FRAMEWORK (Total: 100 pts)
═══════════════════════════════════════════════════════════════

DIMENSION 1 — Ties to Home Country (25 pts)
The single strongest predictor of return. Applicants with compelling reasons to go back rarely overstay.
  • Stable, verifiable employment with approved leave (0–10 pts)
    10: Formal letter from credible employer, salary documented, leave approved
     5: Employment shown but leave unclear or employer hard to verify
     0: Unemployed, no employment docs, or employment looks fabricated
  • Family dependents remaining in home country (0–8 pts)
    8: Spouse/children staying home, proven by marriage cert / birth cert
    4: Family documented but may be travelling too
    0: No family ties documented or all family travelling together
  • Property / assets in home country (0–7 pts)
    7: Owns property confirmed by title deed or mortgage
    3: Renting with long-term lease or business ownership documented
    0: No property or asset evidence

DIMENSION 2 — Financial Credibility (20 pts)
Borrowed or inflated funds are a red flag. Genuine savings suggest the applicant has something to lose.
  • Genuine, consistent savings pattern (0–10 pts)
    10: 3+ months of statements show organic, growing savings
     5: Savings present but irregular spikes suggest temporary deposits
     0: Insufficient funds, sudden large deposits, or no statements
  • Income consistent with stated employment (0–6 pts)
    6: Salary credits match employer letter amount
    3: Income present but amount inconsistent with stated role
    0: No income, or salary not verifiable
  • Funds sufficient for stated duration (0–4 pts)
    4: Clearly sufficient for all planned expenses
    2: Borderline — funds exist but trip budget is tight
    0: Clearly insufficient for the stated travel period

DIMENSION 3 — Purpose Clarity & Consistency (20 pts)
Vague or contradictory purposes are a strong signal the applicant may not follow the visa terms.
  • Specific, plausible purpose corroborated by documents (0–8 pts)
    8: Hotel, flight, itinerary, invitation all consistent and specific
    4: Purpose stated but partially corroborated
    0: Vague purpose, no corroboration, or documents contradict each other
  • Duration of stay proportionate to stated purpose (0–6 pts)
    6: Trip length clearly matches stated purpose (e.g. 5-day conference)
    3: Duration slightly excessive for stated purpose
    0: Excessive duration with no clear justification
  • Internal consistency across all documents (0–6 pts)
    6: No contradictions across name, dates, purpose, destination
    3: Minor inconsistencies that could be explained
    0: Material contradictions (different names, conflicting dates, wrong destination)

DIMENSION 4 — Prior Compliance Track Record (20 pts)
Past behaviour is the best predictor of future behaviour.
  • Prior visa stamps / entries with no overstay evidence (0–12 pts)
    12: Multiple prior visas to Schengen/US/UK/AU used correctly
     6: Some prior travel history but limited or to lower-scrutiny countries
     0: No prior travel history, or evidence of prior visa refusal/overstay
  • Clean immigration record (0–8 pts)
    8: No declared refusals, deportations, or visa violations
    0: Declared or suspected refusal/deportation/overstay

DIMENSION 5 — Document Authenticity & Completeness (15 pts)
Fraudulent or incomplete documents are disqualifying.
  • All required documents present and structurally valid (0–7 pts)
    7: All required docs present, from legitimate issuers, with expected format
    3: Most docs present; minor gaps
    0: Key required documents missing or structurally suspicious
  • Credible issuing authorities (0–5 pts)
    5: All docs from verifiable government agencies, regulated banks, or known employers
    2: Some docs from hard-to-verify sources
    0: Docs from unknown or suspicious sources
  • No authenticity red flags (0–3 pts)
    3: Metadata, dates, and formatting all consistent with genuine documents
    0: PDF metadata anomalies, impossible dates, formatting inconsistencies

═══════════════════════════════════════════════════════════════

SCORING INSTRUCTIONS:
1. Score each sub-dimension based on the evidence in the document evaluations above
2. Sum all sub-dimension scores → overallScore (0–100)
3. Determine riskLevel: 80–100 = "low", 65–79 = "medium", 0–64 = "high"
4. Build on (not re-derive) the programmatic consistency checks — treat them as established facts
5. Identify additional cross-document discrepancies not already caught
6. Weight low-confidence document evaluations less heavily
7. List the specific missing items, contradictions, weak evidence, and refusal-risk signals that most influenced your score in redFlags

Return JSON with this exact structure:
{
  "overallScore": <integer 0-100, sum of all dimension sub-scores>,
  "riskLevel": "low" | "medium" | "high",
  "summary": "<2-3 sentence comprehensive summary of the overall case readiness and most important reviewer concerns>",
  "redFlags": ["<critical missing item, inconsistency, weak evidence, authenticity signal, or refusal risk>", ...],
  "strengths": ["<genuine return incentive or application strength>", ...],
  "recommendations": ["<specific reviewer action or client follow-up needed before the case is marked ready>", ...],
  "itemFeedback": {
    ${checklistItems.map((item) => `"${item.id}": { "status": "ok" | "missing" | "needs_review", "feedback": "<brief feedback>", "score": <0-100>, "issues": ["<issue>"], "strengths": ["<strength>"], "hasDocument": true|false, "hasContent": true|false }`).join(",\n    ")}
  }
}`;

    let evaluationData: EvaluationData;

    try {
      const response = await createEvaluationCompletionWithFallback({
        openai,
        systemPrompt: orchestratorSystemPrompt,
        userContent: orchestratorUserPrompt,
        schemaName: "orchestrator_evaluation",
        schema: buildOrchestratorJsonSchema(checklistItems) as Record<string, unknown>,
        maxTokens: AI_MAX_TOKENS_LARGE,
      });

      const raw = JSON.parse(response.choices[0].message.content || "{}");
      const result = orchestratorResponseSchema.safeParse(raw);

      if (result.success) {
        evaluationData = result.data;
      } else {
        // Response was valid JSON but wrong shape — degrade gracefully to Phase 1 aggregation
        logger.warn("Orchestrator response failed schema validation, falling back to Phase 1 aggregation", { issues: result.error.issues });
        evaluationData = buildPhase1Fallback(perDocumentEvaluations);
      }
    } catch (error) {
      // Network error, quota exceeded, JSON parse failure, etc. — Phase 1 results are preserved
      logger.error("Orchestrator call failed, falling back to Phase 1 aggregation", { error });
      evaluationData = buildPhase1Fallback(perDocumentEvaluations);
    }

    // Backfill itemFeedback with per-document evaluation data for any items the orchestrator missed
    for (const perDoc of perDocumentEvaluations) {
      if (!evaluationData.itemFeedback[perDoc.checklistItemId]) {
        evaluationData.itemFeedback[perDoc.checklistItemId] = {
          status: perDoc.status === "missing" ? "missing" : perDoc.status === "ok" ? "ok" : "needs_review",
          feedback: perDoc.feedback,
          score: perDoc.score,
          issues: perDoc.issues,
          strengths: perDoc.strengths,
          hasDocument: perDoc.hasDocument,
          hasContent: perDoc.hasContent,
          confidence: perDoc.confidence,
          confidenceReason: perDoc.confidenceReason,
        };
      } else {
        // Enrich orchestrator feedback with per-document fields if missing
        const existing = evaluationData.itemFeedback[perDoc.checklistItemId];
        evaluationData.itemFeedback[perDoc.checklistItemId] = {
          ...existing,
          score: existing.score ?? perDoc.score,
          issues: existing.issues ?? perDoc.issues,
          strengths: existing.strengths ?? perDoc.strengths,
          hasDocument: perDoc.hasDocument,
          hasContent: perDoc.hasContent,
          // Always use Phase 1 confidence — the orchestrator doesn't re-read the raw doc
          confidence: perDoc.confidence,
          confidenceReason: perDoc.confidenceReason,
        };
      }
    }

    // ---------------------------------------------------------------------------
    // ENSEMBLE SCORING — adversarial second pass for borderline scores
    // Only triggered when the primary score is within ±12 of the visa-type threshold.
    // A devil's advocate prompt reframes the same data pessimistically. Comparing the
    // two scores reveals how stable the evaluation is:
    //   divergence < 8  → "high"     — both passes agree, keep primary score
    //   divergence < 18 → "moderate" — minor disagreement, use average
    //   divergence ≥ 18 → "low"      — significant disagreement, use average + warn
    // ---------------------------------------------------------------------------

    const readyThreshold = getReadyThreshold(application.visaType);
    const borderlineMin = readyThreshold - 12;
    const borderlineMax = readyThreshold + 12;
    const isBorderline =
      evaluationData.overallScore >= borderlineMin &&
      evaluationData.overallScore <= borderlineMax;

    let scoreConfidence: "high" | "moderate" | "low" | null = null;
    let ensembleDivergence: number | null = null;

    if (isBorderline) {
      try {
    const adversarialSystemPrompt = `You are a highly skeptical agency review lead whose job is to stress-test this application before final submission. Using the same agency readiness framework, assume the worst interpretation of every ambiguous document, treat missing documents as deliberate omissions, and be strict about marginal evidence. Return ONLY valid JSON.`;

        const adversarialResponse = await createEvaluationCompletionWithFallback({
          openai,
          systemPrompt: adversarialSystemPrompt,
          userContent: orchestratorUserPrompt,
          schemaName: "orchestrator_evaluation",
          schema: buildOrchestratorJsonSchema(checklistItems) as Record<string, unknown>,
          maxTokens: AI_MAX_TOKENS_LARGE,
        });

        const adversarialRaw = JSON.parse(adversarialResponse.choices[0].message.content || "{}");
        const adversarialResult = orchestratorResponseSchema.safeParse(adversarialRaw);

        if (adversarialResult.success) {
          const score1 = evaluationData.overallScore;
          const score2 = adversarialResult.data.overallScore;
          ensembleDivergence = Math.abs(score1 - score2);

          if (ensembleDivergence < 8) {
            scoreConfidence = "high";
            // Keep primary score unchanged
          } else if (ensembleDivergence < 18) {
            scoreConfidence = "moderate";
            evaluationData = {
              ...evaluationData,
              overallScore: Math.round((score1 + score2) / 2),
            };
          } else {
            scoreConfidence = "low";
            evaluationData = {
              ...evaluationData,
              overallScore: Math.round((score1 + score2) / 2),
            };
          }

          logger.info("Ensemble scoring complete", { score1, score2, ensembleDivergence, scoreConfidence, finalScore: evaluationData.overallScore });
        } else {
          logger.warn("Ensemble adversarial response failed schema validation — skipping ensemble");
        }
      } catch (ensembleError) {
        // Non-fatal — primary score stands if ensemble fails
        logger.warn("Ensemble pass failed — using primary score only", { error: ensembleError });
      }
    }

    // ---------------------------------------------------------------------------
    // Persist evaluation and update application/applicant scores
    // ---------------------------------------------------------------------------

    // Update application status based on this applicant's score.
    // Threshold varies by visa type — work/PR visas require a higher score than tourist visas.
    // readyThreshold is already computed above for ensemble scoring.
    const newStatus =
      evaluationData.overallScore >= readyThreshold
        ? VISA_APPLICATION_STATUS.READY
        : VISA_APPLICATION_STATUS.IN_PROGRESS;

    // Persist evaluation, applicant score, and application status in parallel.
    // If side-effect updates (applicant/application) fail, we still save the evaluation
    // so the user isn't left with nothing after expensive AI calls.
    const [evaluation] = await db
      .insert(documentEvaluationTable)
      .values({
        applicationId: application.id,
        applicantId: input.applicantId,
        overallScore: evaluationData.overallScore,
        riskLevel: evaluationData.riskLevel,
        summary: evaluationData.summary,
        redFlags: evaluationData.redFlags ?? [],
        strengths: evaluationData.strengths ?? [],
        recommendations: evaluationData.recommendations ?? [],
        itemFeedback: evaluationData.itemFeedback ?? {},
        docSnapshots,
        scoreConfidence,
        ensembleDivergence,
      })
      .returning();

    // Non-fatal: update denormalized scores on applicant and application
    await Promise.all([
      db
        .update(applicantTable)
        .set({
          readinessScore: evaluationData.overallScore,
          riskLevel: evaluationData.riskLevel,
        })
        .where(eq(applicantTable.id, input.applicantId))
        .catch((err) => logger.error("Failed to update applicant score after evaluation", { applicantId: input.applicantId, error: err })),
      db
        .update(visaApplicationTable)
        .set({
	          riskLevel: evaluationData.riskLevel,
	          readinessScore: evaluationData.overallScore,
	          status: newStatus,
	          agencyStatus: AGENCY_CASE_STATUS.IN_REVIEW,
	          clientReportStatus: CLIENT_REPORT_STATUS.DRAFT,
	        })
        .where(eq(visaApplicationTable.id, application.id))
        .catch((err) => logger.error("Failed to update application status after evaluation", { applicationId: application.id, error: err })),
    ]);

    await recordMarketingEvent({
      db,
      type: MARKETING_EVENT_TYPE.EVALUATION_COMPLETED,
      userId: application.userId,
      applicationId: application.id,
      payload: {
        evaluationId: evaluation.id,
        riskLevel: evaluationData.riskLevel,
        overallScore: evaluationData.overallScore,
      },
    });

    revalidatePath(`/dashboard/${application.id}`);
    return evaluation;
  });
