import "server-only";
import { ZSAError } from "zsa";
import { z } from "zod";
import type OpenAI from "openai";
import { createGeminiEvaluation } from "@/lib/gemini-evaluation";
import { GEMINI_DOCUMENT_EVALUATION_MODEL } from "@/lib/gemini";
import {
  AI_MAX_TOKENS_LARGE,
  AI_MAX_TOKENS_SMALL,
  MODIFICATION_GAP_DAYS_THRESHOLD,
} from "@/constants";
import { logger, logAlert } from "@/infra/logger";
import type { PdfMetadataSignals } from "@/services/pdf-parser";
import type { checklistItemTable, documentEvaluationTable } from "@/db/schema";

export type EvaluationChecklistItem = Pick<
  typeof checklistItemTable.$inferSelect,
  "id" | "documentName" | "description" | "commonMistakes" | "isRequired"
>;
export interface EvaluationDocument {
  id: string;
  fileName: string;
}
export type PreviousEvaluation = Pick<
  typeof documentEvaluationTable.$inferSelect,
  "docSnapshots" | "itemFeedback"
>;
export type EvaluationProvider = typeof createGeminiEvaluation;
export const DEFAULT_EVALUATION_CONCURRENCY = 2;
export interface EvaluationEvidence {
  docByChecklistItem: Map<string, EvaluationDocument>;
  textByDocId: Map<string, string>;
  translatedTextByDocId: Map<string, string>;
  relevantChunksByItemId: Map<string, string>;
  visionDataByDocId: Map<string, string[]>;
  metadataByDocId: Map<string, PdfMetadataSignals>;
}
export interface CaseEvaluationInput {
  checklistItems: EvaluationChecklistItem[];
  evidence: EvaluationEvidence;
  previousEvaluation?: PreviousEvaluation;
  applicationContext: string;
  visaType: string;
  evaluate?: EvaluationProvider;
  maxConcurrency?: number;
  /** Reference date for reproducible review; production uses the current UTC date. */
  asOfDate?: string;
}

async function mapConcurrent<T, R>({
  items,
  concurrency,
  map,
}: {
  items: T[];
  concurrency: number;
  map: (item: T) => Promise<R>;
}): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let hasFailed = false;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!hasFailed && nextIndex < items.length) {
        const index = nextIndex++;
        try {
          results[index] = await map(items[index]);
        } catch (error) {
          if (!hasFailed) failure = error;
          hasFailed = true;
        }
      }
    }),
  );
  // Wait for active calls before rejecting, so usage remains part of this review.
  if (hasFailed) throw failure;
  return results;
}

/** The production model pipeline; tests and benchmarks use these same prompts and schemas. */
export async function runCaseEvaluation({
  checklistItems,
  evidence,
  previousEvaluation,
  applicationContext,
  visaType,
  evaluate = createGeminiEvaluation,
  maxConcurrency = DEFAULT_EVALUATION_CONCURRENCY,
  asOfDate,
}: CaseEvaluationInput) {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 32) {
    throw new Error("Evaluation concurrency must be an integer between 1 and 32");
  }
  const reviewDate = z
    .string()
    .date()
    .parse(asOfDate ?? new Date().toISOString().slice(0, 10));
  const datedContext = `Review date: ${reviewDate} (UTC). Assess document validity as of this date.\n${applicationContext}`;
  const { perDocumentEvaluations, docSnapshots } = await evaluateChecklistDocuments({
    checklistItems,
    evidence,
    previousEvaluation,
    applicationContext: datedContext,
    evaluate,
    maxConcurrency,
  });
  const prompts = buildOrchestratorPrompts({
    checklistItems,
    perDocumentEvaluations,
    applicationContext: datedContext,
    reviewDate,
  });
  const readiness = await evaluateApplicationReadiness({
    checklistItems,
    perDocumentEvaluations,
    ...prompts,
    visaType,
    evaluate,
  });
  return { ...readiness, perDocumentEvaluations, docSnapshots };
}

// ---------------------------------------------------------------------------
// Zod schemas for validating AI responses — .catch() on each field means a
// bad AI response degrades gracefully instead of throwing.
// ---------------------------------------------------------------------------

/** Structured fields extracted from a single document during Phase 1 evaluation. */
const extractedFieldsSchema = z
  .object({
    holderName: z.string().nullable().catch(null),
    expiryDate: z.string().nullable().catch(null), // "YYYY-MM-DD" or null
    documentNumber: z.string().nullable().catch(null),
    issuingAuthority: z.string().nullable().catch(null),
    language: z.string().catch("unknown"), // ISO 639-1, e.g. "en", "fr", "ar"
    dateRange: z.object({ from: z.string(), to: z.string() }).nullable().catch(null),
  })
  .catch({
    holderName: null,
    expiryDate: null,
    documentNumber: null,
    issuingAuthority: null,
    language: "unknown",
    dateRange: null,
  });

type ExtractedFields = z.infer<typeof extractedFieldsSchema>;

const perDocAiResponseSchema = z.object({
  status: z.enum(["ok", "needs_review", "missing_content", "wrong_document"]).catch("needs_review"),
  score: z
    .number()
    .catch(50)
    .transform((n) => Math.round(Math.max(0, Math.min(100, n)))),
  issues: z.array(z.string()).catch([]),
  strengths: z.array(z.string()).catch([]),
  feedback: z.string().catch(""),
  /** AI confidence in its own evaluation (0-100). 90+ = clear machine-readable text. */
  confidence: z
    .number()
    .catch(50)
    .transform((n) => Math.round(Math.max(0, Math.min(100, n)))),
  confidenceReason: z.string().catch(""),
  extractedFields: extractedFieldsSchema,
});

const orchestratorItemSchema = z.object({
  status: z.enum(["ok", "missing", "needs_review"]).catch("needs_review"),
  feedback: z.string().catch(""),
  score: z
    .number()
    .transform((n) => Math.round(Math.max(0, Math.min(100, n))))
    .optional()
    .catch(undefined),
  issues: z.array(z.string()).optional().catch(undefined),
  strengths: z.array(z.string()).optional().catch(undefined),
  hasDocument: z.boolean().optional().catch(undefined),
  hasContent: z.boolean().optional().catch(undefined),
  confidence: z.number().optional().catch(undefined),
  confidenceReason: z.string().optional().catch(undefined),
  extractedFields: extractedFieldsSchema.optional(),
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

export type EvaluationData = z.infer<typeof orchestratorResponseSchema>;

// ---------------------------------------------------------------------------
// JSON Schema objects for Vertex AI structured output (responseJsonSchema).
// These mirror the Zod schemas above in JSON Schema format. All properties are
// required and additionalProperties: false to keep the response shape stable.
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
      required: [
        "holderName",
        "expiryDate",
        "documentNumber",
        "issuingAuthority",
        "language",
        "dateRange",
      ],
      additionalProperties: false,
    },
  },
  required: [
    "status",
    "score",
    "issues",
    "strengths",
    "feedback",
    "confidence",
    "confidenceReason",
    "extractedFields",
  ],
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
    required: [
      "overallScore",
      "riskLevel",
      "summary",
      "redFlags",
      "strengths",
      "recommendations",
      "itemFeedback",
    ],
    additionalProperties: false,
  };
}

// Structured result of an individual document review.
export interface PerDocumentEvaluation {
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
 * becomes available for the first time (hasContent flag flips), or the
 * evaluation model changes.
 * Unchanged slots produce the same key across re-runs, allowing the
 * evaluator to skip redundant AI calls.
 */
function getDocVersionKey(
  doc: { id: string } | undefined,
  hasContent: boolean,
  hasVision: boolean,
): string {
  if (!doc) return "missing";
  return `${doc.id}:${GEMINI_DOCUMENT_EVALUATION_MODEL}:${hasContent ? "1" : "0"}:${hasVision ? "1" : "0"}`;
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
 * Maps a checklist document name to the primary overstay-risk dimension it evidences.
 * Used to focus per-document evaluation on what a visa officer actually cares about.
 */
function getDocumentDimension(documentName: string): { dimension: string; signals: string } {
  const n = documentName.toLowerCase();

  if (/passport|travel.*doc|national.*id|id.*card/.test(n))
    return {
      dimension: "Document Authenticity & Prior Travel Record (Dimension 5 + 4)",
      signals:
        "Check visa stamps for prior travel history and compliance. Look for expired validity, name inconsistencies, or signs of tampering.",
    };
  if (/employ|job.*offer|contract|appointment.*letter|noc|no.*objection/.test(n))
    return {
      dimension: "Ties to Home Country — Employment (Dimension 1)",
      signals:
        "Does this document prove the applicant has a stable job to return to? Check employer credibility, salary continuity, leave approval, and return obligation.",
    };
  if (/salary|payslip|pay.*stub|pay.*slip|income/.test(n))
    return {
      dimension: "Financial Credibility + Ties to Home Country (Dimensions 1 & 2)",
      signals:
        "Verify salary is consistent with stated employment. Check for irregular deposits that suggest borrowed funds. Look for stability over multiple months.",
    };
  if (/bank.*statement|account.*statement|financial|savings|fund/.test(n))
    return {
      dimension: "Financial Credibility (Dimension 2)",
      signals:
        "Look for genuine, consistent savings — not sudden large deposits before the application. Assess whether funds cover the intended stay. Check for signs of temporarily borrowed funds.",
    };
  if (/marriage|spouse|family|birth.*cert|dependent|child|parent/.test(n))
    return {
      dimension: "Ties to Home Country — Family (Dimension 1)",
      signals:
        "Dependents and family staying at home are a strong return incentive. Verify relationship, residency of family members, and that dependents are NOT also travelling.",
    };
  if (/property|deed|land|house|rent|mortgage|lease/.test(n))
    return {
      dimension: "Ties to Home Country — Assets (Dimension 1)",
      signals:
        "Property ownership is a strong tie. Verify authenticity of ownership documents and that property is in the home country.",
    };
  if (/hotel|flight|ticket|itinerary|booking|accommodation/.test(n))
    return {
      dimension: "Trip Purpose Clarity (Dimension 3)",
      signals:
        "Does the booking confirm a clear departure date? Is the duration of stay proportionate to the stated purpose? Return ticket is critical — one-way tickets are a red flag.",
    };
  if (/invitation|sponsor|host|cover.*letter|purpose|intent/.test(n))
    return {
      dimension: "Trip Purpose Clarity (Dimension 3)",
      signals:
        "Is the stated purpose specific and credible? Does the invitation come from a legitimate, verifiable source? Does it commit to financial responsibility? Vague purposes are red flags.",
    };
  if (/insurance|travel.*insur|medical.*insur/.test(n))
    return {
      dimension: "Trip Purpose Clarity + Document Completeness (Dimension 3 & 5)",
      signals:
        "Coverage period must match the intended stay. Coverage amount must meet destination country minimums. Gaps in coverage suggest the applicant may extend their stay.",
    };
  if (/business.*regist|company.*regist|trade.*licen/.test(n))
    return {
      dimension: "Ties to Home Country — Business Ownership (Dimension 1)",
      signals:
        "Business ownership is a strong home-country tie. Verify the business is active and registered. Owner must return to run it — a genuine anchor.",
    };
  return {
    dimension: "Document Completeness & Authenticity (Dimension 5)",
    signals:
      "Evaluate completeness, issuing authority credibility, internal consistency, and any signs of document fraud or alteration.",
  };
}

async function evaluateChecklistDocuments({
  checklistItems,
  evidence,
  previousEvaluation,
  applicationContext,
  evaluate,
  maxConcurrency,
}: {
  checklistItems: EvaluationChecklistItem[];
  evidence: EvaluationEvidence;
  previousEvaluation: PreviousEvaluation | undefined;
  applicationContext: string;
  evaluate: EvaluationProvider;
  maxConcurrency: number;
}) {
  const {
    docByChecklistItem,
    textByDocId,
    translatedTextByDocId,
    relevantChunksByItemId,
    visionDataByDocId,
    metadataByDocId,
  } = evidence;
  // ---------------------------------------------------------------------------
  // PHASE 1: Per-document individual evaluation (parallel AI calls)
  // ---------------------------------------------------------------------------

  const perDocumentEvaluations: PerDocumentEvaluation[] = await mapConcurrent({
    items: checklistItems,
    concurrency: maxConcurrency,
    map: async (item): Promise<PerDocumentEvaluation> => {
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
      const prevFeedback =
        previousEvaluation?.docSnapshots?.[item.id] === currentVersionKey
          ? previousEvaluation.itemFeedback?.[item.id]
          : undefined;

      // Legacy feedback lacks the fields needed for consistency checks. Refresh
      // uploaded documents once instead of reusing an incomplete evidence record.
      if (prevFeedback && (!hasDocument || prevFeedback.extractedFields)) {
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
          confidenceReason:
            (prevFeedback as { confidenceReason?: string }).confidenceReason ??
            "Reused from previous evaluation.",
          extractedFields: extractedFieldsSchema.parse(prevFeedback.extractedFields),
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
          extractedFields: {
            holderName: null,
            expiryDate: null,
            documentNumber: null,
            issuingAuthority: null,
            language: "unknown",
            dateRange: null,
          },
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
                : ""),
          );
        }
        if (meta.creator) lines.push(`- Authoring tool: "${meta.creator}"`);
        if (meta.producer) lines.push(`- PDF renderer: "${meta.producer}"`);
        if (meta.pageCount > 0) lines.push(`- Page count: ${meta.pageCount}`);
        // Anomaly flags
        if (meta.creationInFuture)
          lines.push(
            `- ⚠️ WARNING: Creation date is in the future — impossible for a genuine document`,
          );
        if (meta.hasNoMetadata)
          lines.push(
            `- ⚠️ WARNING: All metadata fields are empty — metadata may have been deliberately stripped`,
          );
        if (
          meta.isModified &&
          meta.modificationGapDays !== null &&
          meta.modificationGapDays > MODIFICATION_GAP_DAYS_THRESHOLD
        ) {
          lines.push(
            `- ⚠️ WARNING: Document was modified ${meta.modificationGapDays} days after creation — unusual for a freshly issued document`,
          );
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

      const { dimension: docDimension, signals: docSignals } = getDocumentDimension(
        item.documentName,
      );

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
        // When vision images are available, send a multimodal message so Gemini
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

        const response = await evaluate({
          systemPrompt: perDocSystemPrompt,
          userContent: userMessageContent,
          schemaName: "per_document_evaluation",
          schema: perDocJsonSchema as Record<string, unknown>,
          maxTokens: AI_MAX_TOKENS_SMALL,
        });

        const raw = JSON.parse(response);
        // perDocAiResponseSchema uses .catch() on every field — parse never throws
        const parsed = perDocAiResponseSchema.parse(raw);

        // Auto-override confidence to 15 only when we have neither text nor vision.
        // With vision available (even for scanned docs), let the AI report its own confidence.
        const finalConfidence = !hasContent && !hasVision ? 15 : parsed.confidence;
        const finalConfidenceReason =
          !hasContent && !hasVision
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
        logAlert("ai_api_failure", "Per-document evaluation failed", {
          checklistItemId: item.id,
          documentName: item.documentName,
          error: err,
        });
        throw new ZSAError(
          "INTERNAL_SERVER_ERROR",
          "Vertex AI could not evaluate a document. Run the review again.",
        );
      }
    },
  });

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
    logger.info("Incremental evaluation: reused unchanged documents", {
      reusedCount,
      totalItems: checklistItems.length,
    });
  }

  return { perDocumentEvaluations, docSnapshots };
}

function normalizeHolderName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/^(?:(?:mr|mrs|ms|miss|dr|prof)\.?\s+)+/u, "")
    .replace(/[^\p{L}\p{M}\s]/gu, "")
    .trim()
    .split(/\s+/u)
    .sort()
    .join(" ");
}

function buildOrchestratorPrompts({
  checklistItems,
  perDocumentEvaluations,
  applicationContext,
  reviewDate,
}: {
  checklistItems: EvaluationChecklistItem[];
  perDocumentEvaluations: PerDocumentEvaluation[];
  applicationContext: string;
  reviewDate: string;
}) {
  // ---------------------------------------------------------------------------
  // Cross-document consistency analysis — deterministic programmatic checks on
  // structured fields extracted during Phase 1. These results are injected into
  // the orchestrator so the AI doesn't need to re-derive them from raw text.
  // ---------------------------------------------------------------------------

  const consistencyIssues: string[] = [];
  const today = reviewDate; // "YYYY-MM-DD"

  // Name consistency: compare holderName across all docs that provided one
  const namedEvals = perDocumentEvaluations.filter(
    (e) => e.hasDocument && e.extractedFields.holderName,
  );
  if (namedEvals.length >= 2) {
    const ref = namedEvals[0];
    const refNorm = normalizeHolderName(ref.extractedFields.holderName!);
    for (const e of namedEvals.slice(1)) {
      if (normalizeHolderName(e.extractedFields.holderName!) !== refNorm) {
        consistencyIssues.push(
          `Name mismatch: "${ref.documentName}" shows "${ref.extractedFields.holderName}" but "${e.documentName}" shows "${e.extractedFields.holderName}"`,
        );
      }
    }
  }

  // Expiry check: flag any document that is already expired
  for (const e of perDocumentEvaluations) {
    if (e.extractedFields.expiryDate && e.extractedFields.expiryDate < today) {
      consistencyIssues.push(
        `Expired document: "${e.documentName}" — expiry date ${e.extractedFields.expiryDate} is in the past`,
      );
    }
  }

  // Foreign language documents
  const foreignLangDocs = perDocumentEvaluations.filter(
    (e) =>
      e.hasContent &&
      e.extractedFields.language !== "unknown" &&
      e.extractedFields.language !== "en",
  );

  const consistencySection =
    consistencyIssues.length > 0 || foreignLangDocs.length > 0
      ? `\nPROGRAMMATIC CONSISTENCY CHECKS (pre-computed — treat as facts):\n${consistencyIssues
          .map((i) => `⚠️  ${i}`)
          .join("\n")}${
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
          ? `  Content excerpt:\n${e.contentExcerpt
              .split("\n")
              .map((l) => `    ${l}`)
              .join("\n")}`
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

  return { orchestratorSystemPrompt, orchestratorUserPrompt };
}

async function evaluateApplicationReadiness({
  checklistItems,
  perDocumentEvaluations,
  orchestratorSystemPrompt,
  orchestratorUserPrompt,
  visaType,
  evaluate,
}: {
  checklistItems: EvaluationChecklistItem[];
  perDocumentEvaluations: PerDocumentEvaluation[];
  orchestratorSystemPrompt: string;
  orchestratorUserPrompt: string;
  visaType: string;
  evaluate: EvaluationProvider;
}) {
  let evaluationData: EvaluationData;

  try {
    const response = await evaluate({
      systemPrompt: orchestratorSystemPrompt,
      userContent: orchestratorUserPrompt,
      schemaName: "orchestrator_evaluation",
      schema: buildOrchestratorJsonSchema(checklistItems) as Record<string, unknown>,
      maxTokens: AI_MAX_TOKENS_LARGE,
    });

    const raw = JSON.parse(response);
    const result = orchestratorResponseSchema.safeParse(raw);

    if (!result.success) throw new Error("Combined review response failed schema validation");
    evaluationData = result.data;
  } catch (error) {
    logger.error("Combined review failed; no new assessment will be published", { error });
    throw new ZSAError(
      "INTERNAL_SERVER_ERROR",
      "The combined review did not complete. No new review was saved. Run the review again.",
    );
  }

  // Backfill itemFeedback with per-document evaluation data for any items the orchestrator missed
  for (const perDoc of perDocumentEvaluations) {
    if (!evaluationData.itemFeedback[perDoc.checklistItemId]) {
      evaluationData.itemFeedback[perDoc.checklistItemId] = {
        status:
          perDoc.status === "missing" ? "missing" : perDoc.status === "ok" ? "ok" : "needs_review",
        feedback: perDoc.feedback,
        score: perDoc.score,
        issues: perDoc.issues,
        strengths: perDoc.strengths,
        hasDocument: perDoc.hasDocument,
        hasContent: perDoc.hasContent,
        confidence: perDoc.confidence,
        confidenceReason: perDoc.confidenceReason,
        extractedFields: perDoc.extractedFields,
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
        extractedFields: perDoc.extractedFields,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // ENSEMBLE SCORING — adversarial second pass for borderline scores
  // Only triggered when the primary score is within ±12 of the visa-type threshold.
  // A skeptical prompt checks the same evidence and rubric for unsupported claims.
  // Comparing the two scores reveals how stable the evaluation is:
  //   divergence < 8  → "high"     — both passes agree, keep primary score
  //   divergence < 18 → "moderate" — minor disagreement, use average
  //   divergence ≥ 18 → "low"      — significant disagreement, use average + warn
  // ---------------------------------------------------------------------------

  const readyThreshold = getReadyThreshold(visaType);
  const borderlineMin = readyThreshold - 12;
  const borderlineMax = readyThreshold + 12;
  const isBorderline =
    evaluationData.overallScore >= borderlineMin && evaluationData.overallScore <= borderlineMax;

  let scoreConfidence: "high" | "moderate" | "low" | null = null;
  let ensembleDivergence: number | null = null;

  if (isBorderline) {
    try {
      const adversarialSystemPrompt = `You are a highly skeptical agency review lead whose job is to stress-test this application before final submission. Independently check the supplied evidence using exactly the same agency readiness rubric and point weights. Identify unsupported claims, missing required evidence and concrete contradictions. Do not infer fraud, bad intent, or an adverse immigration record from absent evidence. Distinguish an unverified claim from a proven contradiction. Do not invent missing checklist requirements or deduct points solely because you cannot inspect an original document or verify its issuer externally. Award rubric points supported by the supplied evidence, identify uncertainty explicitly, and sum the sub-scores without an extra pessimism penalty. Return ONLY valid JSON.`;

      const adversarialResponse = await evaluate({
        systemPrompt: adversarialSystemPrompt,
        userContent: orchestratorUserPrompt,
        schemaName: "orchestrator_evaluation",
        schema: buildOrchestratorJsonSchema(checklistItems) as Record<string, unknown>,
        maxTokens: AI_MAX_TOKENS_LARGE,
      });

      const adversarialRaw = JSON.parse(adversarialResponse);
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

        logger.info("Ensemble scoring complete", {
          score1,
          score2,
          ensembleDivergence,
          scoreConfidence,
          finalScore: evaluationData.overallScore,
        });
      } else {
        throw new Error("Second review response failed schema validation");
      }
    } catch (ensembleError) {
      logger.error("Required second review failed; no new assessment will be published", {
        error: ensembleError,
      });
      throw new ZSAError(
        "INTERNAL_SERVER_ERROR",
        "The second review did not complete. No new review was saved. Run the review again.",
      );
    }
  }

  // The public risk category must match the final score after the second pass.
  evaluationData.riskLevel =
    evaluationData.overallScore >= 80
      ? "low"
      : evaluationData.overallScore >= 65
        ? "medium"
        : "high";
  return {
    evaluationData,
    scoreConfidence,
    ensembleDivergence,
    diagnostics: {
      orchestratorFallback: false,
      skepticalAttempted: isBorderline,
      skepticalSucceeded: ensembleDivergence !== null,
    },
  };
}
