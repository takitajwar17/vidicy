import { measureProviderCall } from "@/infra/evaluation-metrics";
import "server-only";

import { ZSAError } from "zsa";
import type OpenAI from "openai";
import { eq, and } from "drizzle-orm";
import { getRuntimeContext } from "@/infra/runtime-context";
import { getDB } from "@/db";
import { getOpenAIClient } from "@/lib/openai";
import {
  DOCUMENT_EMBEDDING_MODEL,
  EVALUATION_TRANSLATION_MODEL,
} from "@/lib/review-pipeline-version";
import { queryDocumentChunksFromVectorize } from "@/lib/vectorize-query";
import {
  AI_MAX_TOKENS_LARGE,
  AI_MAX_COMBINED_TEXT_LENGTH,
  AI_TIMEOUT_CHAT_MS,
  AI_TIMEOUT_EMBEDDING_MS,
} from "@/constants";
import { revalidatePath } from "next/cache";
import { logger } from "@/infra/logger";
import {
  extractDocumentImages,
  extractPdfMetadata,
  type PdfMetadataSignals,
} from "@/services/pdf-parser";
import { ensureDocumentExtraction } from "@/services/document-pipeline";
import { runCaseEvaluation } from "@/services/case-evaluation";
import { sanitizeForPrompt } from "@/services/atlas-prompt";
import {
  buildReviewContextHash,
  buildReviewRouteContext,
  loadReviewSnapshot,
} from "@/server/review-context";
import {
  checklistItemTable,
  uploadedDocumentTable,
  documentEvaluationTable,
  DOCUMENT_INDEXING_STATUS,
  MARKETING_EVENT_TYPE,
} from "@/db/schema";
import { newestEvaluationOrder, publishAgencyReview } from "@/server/agency-review";
import { loadReviewCheckpoint, saveReviewCheckpoint } from "@/server/review-checkpoints";
import { recordMarketingEvent } from "@/server/marketing/events";
import { getReviewAvailability } from "@/lib/checklist-state";

interface EvaluationEvidenceInput {
  applicationId: string;
  checklistItems: (typeof checklistItemTable.$inferSelect)[];
  uploadedDocuments: (typeof uploadedDocumentTable.$inferSelect)[];
  previousEvaluation: typeof documentEvaluationTable.$inferSelect | undefined;
  openai: OpenAI;
}

async function loadEvaluationEvidence({
  applicationId,
  checklistItems,
  uploadedDocuments,
  previousEvaluation,
  openai,
}: EvaluationEvidenceInput) {
  // ---------------------------------------------------------------------------
  // Build a map: checklistItemId → latest uploaded document for that item
  // ---------------------------------------------------------------------------

  // Group uploaded documents by checklistItemId (latest first due to orderBy uploadedAt desc)
  const docByChecklistItem = new Map<string, (typeof uploadedDocuments)[0]>();
  for (const doc of uploadedDocuments) {
    if (doc.checklistItemId && !docByChecklistItem.has(doc.checklistItemId)) {
      docByChecklistItem.set(doc.checklistItemId, doc);
    }
  }

  // ---------------------------------------------------------------------------
  // Fetch text content for documents that were uploaded but not yet extracted.
  // PDFs and image files use Gemini extraction, with the existing native PDF
  // extraction and OpenAI extraction fallback retained by the shared pipeline.
  // ---------------------------------------------------------------------------

  let r2Bucket: R2Bucket | null = null;
  let vectorize: VectorizeIndex | null = null;
  try {
    const { env } = await getRuntimeContext({ async: true });
    r2Bucket = env.R2 ?? null;
    vectorize = env.VECTORIZE ?? null;
  } catch {
    // Storage or search may be unavailable in local development.
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
    }),
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
        const prevLang =
          (
            previousEvaluation!.itemFeedback![itemId] as
              | { extractedFields?: { language?: string } }
              | undefined
          )?.extractedFields?.language ?? "unknown";
        try {
          const response = await measureProviderCall({
            model: EVALUATION_TRANSLATION_MODEL,
            stage: "translation",
            run: () =>
              openai.chat.completions.create(
                {
                  model: EVALUATION_TRANSLATION_MODEL,
                  messages: [
                    {
                      role: "user",
                      content: `Translate the following document text from ${prevLang} to English. Preserve all names, numbers, dates, and document structure exactly. Return only the translated text.\n\n${rawText.slice(0, 15000)}`,
                    },
                  ],
                  temperature: 0,
                  max_tokens: AI_MAX_TOKENS_LARGE,
                },
                { signal: AbortSignal.timeout(AI_TIMEOUT_CHAT_MS) },
              ),
          });
          const translated = response.choices[0].message.content?.trim();
          if (translated) {
            translatedTextByDocId.set(doc.id, translated);
            logger.info("Document translated to English", {
              documentId: doc.id,
              fromLanguage: prevLang,
            });
          }
        } catch (err) {
          logger.warn("Document translation failed", {
            documentId: doc.id,
            language: prevLang,
            error: err,
          });
        }
      }),
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
          (item) => `${item.documentName}: ${(item.description ?? "").slice(0, 400)}`,
        );
        const embedResp = await measureProviderCall({
          model: DOCUMENT_EMBEDDING_MODEL,
          stage: "retrieval_embedding",
          run: () =>
            openai.embeddings.create(
              {
                model: DOCUMENT_EMBEDDING_MODEL,
                input: queryTexts,
              },
              { signal: AbortSignal.timeout(AI_TIMEOUT_EMBEDDING_MS) },
            ),
        });

        // Parallel Vectorize queries — each scoped to its own documentId
        const vz = vectorize;
        await Promise.all(
          vectorizedItems.map(async (item, i) => {
            const doc = docByChecklistItem.get(item.id)!;
            const chunks = await queryDocumentChunksFromVectorize({
              vectorize: vz,
              queryVector: embedResp.data[i].embedding,
              applicationId,
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
          }),
        );

        logger.info("Vectorize: retrieved relevant chunks", {
          retrieved: relevantChunksByItemId.size,
          total: vectorizedItems.length,
        });
      } catch (err) {
        logger.warn("Vectorize retrieval failed, falling back to raw text head", { error: err });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Vision data loading — fetch document bytes from R2 and produce base64
  // image data URLs for Gemini multimodal analysis.
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
      }),
    );

    if (visionDataByDocId.size > 0) {
      logger.info("Vision: loaded images for documents", { count: visionDataByDocId.size });
    }
  }

  return {
    docByChecklistItem,
    textByDocId,
    translatedTextByDocId,
    relevantChunksByItemId,
    visionDataByDocId,
    metadataByDocId,
  };
}

export interface AgencyEvaluationInput {
  applicationId: string;
  applicantId: string;
  userId: string;
  completion?: {
    jobId: string;
    token: string;
    started: number;
    calls: import("@/infra/evaluation-metrics").EvaluationCallMetric[];
  };
}

export async function runAgencyEvaluation(input: AgencyEvaluationInput) {
  const db = getDB();

  // ---------------------------------------------------------------------------
  // Load application, applicant, checklist items, and uploaded documents
  // ---------------------------------------------------------------------------

  const snapshot = await loadReviewSnapshot({ db, applicationId: input.applicationId });
  if (snapshot.application.finalSubmissionAt)
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "This case was submitted. A new review cannot start.",
    );
  const availability = getReviewAvailability({
    applicantId: input.applicantId,
    items: snapshot.checklistItems,
    documents: snapshot.documents,
  });
  if (!availability.canReview) throw new ZSAError("PRECONDITION_FAILED", availability.reason!);
  const { application } = snapshot;
  const routeContext = buildReviewRouteContext({ ...snapshot, applicantId: input.applicantId });
  const checklistItems = snapshot.checklistItems
    .filter(
      (item) =>
        item.applicability !== "does_not_apply" &&
        (item.applicantId === input.applicantId || item.applicantId === null),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const itemIds = new Set(checklistItems.map((item) => item.id));
  const uploadedDocuments = snapshot.documents.filter(
    (document) => document.checklistItemId && itemIds.has(document.checklistItemId),
  );
  const previousEvaluation = await db.query.documentEvaluationTable.findFirst({
    where: and(
      eq(documentEvaluationTable.applicationId, application.id),
      eq(documentEvaluationTable.applicantId, input.applicantId),
    ),
    orderBy: newestEvaluationOrder,
  });

  const openai = getOpenAIClient();

  // ---------------------------------------------------------------------------
  // Application context string — injected into every per-document prompt
  // ---------------------------------------------------------------------------
  const applicationContext = `Review this applicant using their own passport and history. Unknown fields are not proof of compliance.
Case and full party context: ${sanitizeForPrompt(JSON.stringify(routeContext), 30000)}`;

  const evidence = await loadEvaluationEvidence({
    applicationId: application.id,
    checklistItems,
    uploadedDocuments,
    previousEvaluation,
    openai,
  });
  if (
    ![...evidence.docByChecklistItem.values()].some(
      (document) =>
        evidence.textByDocId.get(document.id)?.trim() ||
        evidence.visionDataByDocId.get(document.id)?.length,
    )
  ) {
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "No usable document evidence. Retry processing or replace the files.",
    );
  }
  const preparedSnapshot = await loadReviewSnapshot({ db, applicationId: application.id });
  if (
    buildReviewContextHash({ ...snapshot, documents: preparedSnapshot.documents }) !==
      preparedSnapshot.reviewContextHash ||
    [...evidence.docByChecklistItem.values()].some((document) => {
      const current = preparedSnapshot.documents.find(
        (candidate) => candidate.checklistItemId === document.checklistItemId,
      );
      return (
        current?.id !== document.id ||
        (current?.textContent ?? "") !== (evidence.textByDocId.get(document.id) ?? "")
      );
    })
  ) {
    throw new ZSAError(
      "PRECONDITION_FAILED",
      "The case or documents changed while evidence was prepared. Run review again.",
    );
  }
  const checkpointClaim = input.completion
    ? {
        jobId: input.completion.jobId,
        token: input.completion.token,
        applicationId: input.applicationId,
        applicantId: input.applicantId,
        contextHash: preparedSnapshot.reviewContextHash,
      }
    : undefined;
  const resumeDocuments = checkpointClaim ? await loadReviewCheckpoint(checkpointClaim) : undefined;
  const { evaluationData, docSnapshots, scoreConfidence, ensembleDivergence, routeAssessment } =
    await runCaseEvaluation({
      checklistItems,
      evidence,
      previousEvaluation,
      resumeDocuments,
      onDocumentEvaluated: checkpointClaim
        ? (checkpoint) => saveReviewCheckpoint({ ...checkpointClaim, checkpoint })
        : undefined,
      applicationContext,
      visaType: application.visaType,
      routeContext,
    });

  // ---------------------------------------------------------------------------
  // Persist evaluation and update application/applicant scores
  // ---------------------------------------------------------------------------

  const evaluation = await publishAgencyReview({
    db,
    applicationId: application.id,
    userId: input.userId,
    completion: input.completion,
    evaluation: {
      applicationId: application.id,
      applicantId: input.applicantId,
      overallScore: evaluationData.overallScore,
      reviewStatus: "complete",
      riskLevel: evaluationData.riskLevel,
      summary: evaluationData.summary,
      redFlags: evaluationData.redFlags ?? [],
      strengths: evaluationData.strengths ?? [],
      recommendations: evaluationData.recommendations ?? [],
      itemFeedback: evaluationData.itemFeedback ?? {},
      docSnapshots,
      scoreConfidence,
      ensembleDivergence,
      routeAssessment,
      reviewContextHash: preparedSnapshot.reviewContextHash,
    },
  });

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
  }).catch((error) =>
    logger.error("Failed to record review event", { applicationId: application.id, error }),
  );

  revalidatePath(`/dashboard/${application.id}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/issues");
  revalidatePath("/dashboard/reports");
  return evaluation;
}
