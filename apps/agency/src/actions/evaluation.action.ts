"use server";

import { createServerAction, ZSAError } from "zsa";
import { z } from "zod";
import type OpenAI from "openai";
import { eq, and, asc } from "drizzle-orm";
import { getRuntimeContext } from "@/infra/runtime-context";
import { getDB } from "@/db";
import { getOpenAIClient } from "@/lib/openai";
import { queryDocumentChunksFromVectorize } from "@/lib/vectorize-query";
import {
  AI_MAX_TOKENS_LARGE,
  AI_MAX_COMBINED_TEXT_LENGTH,
  AI_TIMEOUT_CHAT_MS,
  AI_TIMEOUT_EMBEDDING_MS,
} from "@/constants";
import { requireApplicationPermission } from "@/utils/application-auth";
import { revalidatePath } from "next/cache";
import { checkActionRateLimit } from "@/infra/action-rate-limit";
import { logger } from "@/infra/logger";
import {
  extractDocumentImages,
  extractPdfMetadata,
  type PdfMetadataSignals,
} from "@/services/pdf-parser";
import { ensureDocumentExtraction } from "@/services/document-pipeline";
import { runCaseEvaluation } from "@/services/case-evaluation";
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
  MARKETING_EVENT_TYPE,
} from "@/db/schema";
import {
  newestDocumentOrder,
  newestEvaluationOrder,
  publishAgencyReview,
} from "@/server/agency-review";
import { recordMarketingEvent } from "@/server/marketing/events";

// ---------------------------------------------------------------------------
// 3. evaluateDocumentsAction
// ---------------------------------------------------------------------------

const evaluateDocumentsSchema = z.object({
  applicationId: z.string().min(1),
  applicantId: z.string().min(1),
});

const EVALUATION_TRANSLATION_MODEL = "gpt-4.1-mini";
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
          const response = await openai.chat.completions.create(
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
          );
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
        const embedResp = await openai.embeddings.create(
          {
            model: "text-embedding-3-small",
            input: queryTexts,
          },
          { signal: AbortSignal.timeout(AI_TIMEOUT_EMBEDDING_MS) },
        );

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

export const evaluateDocumentsAction = createServerAction()
  .input(evaluateDocumentsSchema)
  .handler(async ({ input }) => {
    const session = await requireApplicationPermission(
      input.applicationId,
      APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    );
    await checkActionRateLimit("evaluateDocuments", session.userId, 10);
    trackUsage({
      userId: session.userId,
      event: USAGE_EVENTS.EVALUATION_RUN,
      metadata: { applicationId: input.applicationId },
    });

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
          eq(applicantTable.applicationId, input.applicationId),
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
          eq(checklistItemTable.applicantId, input.applicantId),
        ),
        orderBy: [asc(checklistItemTable.sortOrder)],
      }),
      db.query.uploadedDocumentTable.findMany({
        where: and(
          eq(uploadedDocumentTable.applicationId, application.id),
          eq(uploadedDocumentTable.applicantId, input.applicantId),
        ),
        orderBy: newestDocumentOrder,
      }),
      db.query.documentEvaluationTable.findFirst({
        where: and(
          eq(documentEvaluationTable.applicationId, application.id),
          eq(documentEvaluationTable.applicantId, input.applicantId),
        ),
        orderBy: newestEvaluationOrder,
      }),
    ]);

    if (checklistItems.length === 0) {
      throw new ZSAError("NOT_FOUND", "No checklist items exist to evaluate for this application.");
    }

    if (uploadedDocuments.length === 0) {
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Please upload at least one document before running an evaluation.",
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

    const evidence = await loadEvaluationEvidence({
      applicationId: application.id,
      checklistItems,
      uploadedDocuments,
      previousEvaluation,
      openai,
    });
    const { evaluationData, docSnapshots, scoreConfidence, ensembleDivergence } =
      await runCaseEvaluation({
        checklistItems,
        evidence,
        previousEvaluation,
        applicationContext,
        visaType: application.visaType,
      });

    // ---------------------------------------------------------------------------
    // Persist evaluation and update application/applicant scores
    // ---------------------------------------------------------------------------

    const evaluation = await publishAgencyReview({
      db,
      applicationId: application.id,
      userId: session.userId,
      evaluation: {
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
  });
