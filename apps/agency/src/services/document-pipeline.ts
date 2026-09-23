import "server-only"

import { eq } from "drizzle-orm"
import { getCloudflareContext } from "@opennextjs/cloudflare"

import { AI_TIMEOUT_EMBEDDING_MS } from "@/constants"
import { getDB } from "@/db"
import {
  DOCUMENT_EXTRACTION_STATUS,
  DOCUMENT_INDEXING_STATUS,
  type DocumentExtractionPayload,
  type DocumentExtractionStatus,
  type DocumentIndexingStatus,
  uploadedDocumentTable,
  isSupportedDocumentMimeType,
} from "@/db/schema"
import { logger, logAlert } from "@/infra/logger"
import { getOpenAIClient } from "@/lib/openai"
import { getFromR2, getR2Bucket } from "@/lib/r2"
import {
  MAX_PDF_PAGE_COUNT,
  extractPdfMetadata,
  extractTextFromImage,
  extractTextFromPdf,
  extractTextFromRenderedPdfPages,
  getPdfPageCount,
  renderPdfPagesForExtraction,
} from "@/services/pdf-parser"

interface DocumentPipelineRecord {
  id: string
  applicationId: string
  fileKey: string
  fileName: string
  mimeType: string
  textContent: string | null
  extractionStatus: DocumentExtractionStatus
  indexingStatus: DocumentIndexingStatus
  extractionMethod: string | null
  extractedAt: Date | null
  indexingAttemptedAt: Date | null
  pageCount: number | null
  imageDescription: string | null
  extractionPayload: DocumentExtractionPayload | null
  chunkCount: number
}

export interface DocumentExtractionResult {
  documentId: string
  applicationId: string
  mimeType: string
  success: boolean
  extractionStatus: DocumentExtractionStatus
  extractionMethod: string | null
  textContent: string
  pageCount: number | null
  imageDescription: string | null
  extractionPayload: DocumentExtractionPayload | null
  reusedStoredExtraction: boolean
  error?: string
}

export interface DocumentIndexingResult {
  documentId: string
  success: boolean
  indexingStatus: DocumentIndexingStatus
  chunkCount: number
  reusedExistingIndex: boolean
  skippedBecauseNoText: boolean
  error?: string
}

export interface QueueDocumentExtractionResult {
  extraction: DocumentExtractionResult
  indexing: DocumentIndexingResult
}

interface ExtractionInput {
  documentId: string
}

interface PipelineTextChunk {
  content: string
  index: number
}

const MAX_STORED_TEXT_CHARS = 50_000
const EMPTY_TEXT_SENTINEL = "NO_EXTRACTABLE_TEXT"
const PDF_NATIVE_EXTRACTION_METHOD = "pdf_native"
const PDF_PAGE_AI_EXTRACTION_METHOD = "pdf_page_ai"

function chunkText(text: string): Array<PipelineTextChunk> {
  const MAX_CHARS = 3200
  const OVERLAP_CHARS = 320

  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)

  if (paragraphs.length === 0) return []

  const chunks: Array<PipelineTextChunk> = []
  let current = ""
  let chunkIndex = 0

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length + 2 > MAX_CHARS && current.length > 0) {
      chunks.push({ content: current.trim(), index: chunkIndex++ })
      current = current.slice(-OVERLAP_CHARS).trimStart() + "\n\n" + paragraph
    } else {
      current += (current ? "\n\n" : "") + paragraph
    }
  }

  if (current.trim()) {
    chunks.push({ content: current.trim(), index: chunkIndex })
  }

  if (chunks.length === 0 && text.trim()) {
    chunks.push({ content: text.trim(), index: 0 })
  }

  return chunks
}

function truncateStoredText(text: string): string {
  return text.length > MAX_STORED_TEXT_CHARS ? text.slice(0, MAX_STORED_TEXT_CHARS) : text
}

function buildDocumentSelection() {
  return {
    id: true,
    applicationId: true,
    fileKey: true,
    fileName: true,
    mimeType: true,
    textContent: true,
    extractionStatus: true,
    indexingStatus: true,
    extractionMethod: true,
    extractedAt: true,
    indexingAttemptedAt: true,
    pageCount: true,
    imageDescription: true,
    extractionPayload: true,
    chunkCount: true,
  } as const
}

async function loadDocument(documentId: string): Promise<DocumentPipelineRecord> {
  const db = getDB()
  const document = await db.query.uploadedDocumentTable.findFirst({
    where: eq(uploadedDocumentTable.id, documentId),
    columns: buildDocumentSelection(),
  })

  if (!document) {
    throw new Error(`Uploaded document not found: ${documentId}`)
  }

  return document as DocumentPipelineRecord
}

function getDefaultExtractionMethod(mimeType: string): string {
  return mimeType.startsWith("image/") ? "image" : "pdf"
}

function buildStoredExtractionResult(document: DocumentPipelineRecord): DocumentExtractionResult {
  const textContent = document.textContent?.trim() ?? ""

  return {
    documentId: document.id,
    applicationId: document.applicationId,
    mimeType: document.mimeType,
    success: textContent.length > 0,
    extractionStatus:
      document.extractionStatus === DOCUMENT_EXTRACTION_STATUS.FAILED
        ? DOCUMENT_EXTRACTION_STATUS.FAILED
        : DOCUMENT_EXTRACTION_STATUS.COMPLETED,
    extractionMethod: document.extractionMethod ?? getDefaultExtractionMethod(document.mimeType),
    textContent,
    pageCount: document.pageCount ?? null,
    imageDescription: document.imageDescription ?? null,
    extractionPayload: document.extractionPayload ?? null,
    reusedStoredExtraction: true,
  }
}

function parseImageExtractionResponse(rawText: string): {
  imageDescription: string | null
  normalizedText: string
} {
  const trimmed = rawText.trim()
  const match = trimmed.match(/^IMAGE_DESCRIPTION:\s*([\s\S]*?)\nREADABLE_TEXT:\s*([\s\S]*)$/)

  if (!match) {
    return {
      imageDescription: null,
      normalizedText: trimmed,
    }
  }

  const imageDescription = match[1].trim() || null
  const readableText = match[2].trim()

  if (!readableText || readableText === EMPTY_TEXT_SENTINEL) {
    return {
      imageDescription,
      normalizedText: imageDescription ? `IMAGE_DESCRIPTION: ${imageDescription}` : trimmed,
    }
  }

  return {
    imageDescription,
    normalizedText: trimmed,
  }
}

function combineErrorMessages(
  ...messages: Array<string | null | undefined>
): string | undefined {
  const combined = messages
    .filter((message): message is string => typeof message === "string" && message.trim().length > 0)
    .join(" | ")

  return combined || undefined
}

function buildPdfExtractionPayload({
  extractionMode,
  pageCount,
  textContent,
  pages,
  error,
  maxPageCount,
}: {
  extractionMode: "native" | "page_ai" | "page_limit_rejection"
  pageCount: number | null
  textContent?: string
  pages?: unknown[]
  error?: string
  maxPageCount?: number
}): DocumentExtractionPayload {
  return {
    source: "pdf",
    extractionMode,
    pageCount,
    ...(typeof textContent === "string" ? { textLength: textContent.length } : {}),
    ...(pages ? { pages } : {}),
    ...(error ? { error } : {}),
    ...(typeof maxPageCount === "number" ? { maxPageCount } : {}),
  }
}

function normalizePageCount(pageCount: number | null | undefined): number | null {
  return typeof pageCount === "number" && pageCount > 0 ? pageCount : null
}

async function persistExtractionResult({
  documentId,
  extractionStatus,
  extractionMethod,
  textContent,
  imageDescription,
  pageCount,
  extractionPayload,
}: {
  documentId: string
  extractionStatus: DocumentExtractionStatus
  extractionMethod: string | null
  textContent: string
  imageDescription: string | null
  pageCount: number | null
  extractionPayload: DocumentExtractionPayload | null
}): Promise<void> {
  const db = getDB()
  await db
    .update(uploadedDocumentTable)
    .set({
      extractionStatus,
      extractionMethod,
      extractedAt: new Date(),
      pageCount,
      imageDescription,
      extractionPayload,
      textContent: textContent ? truncateStoredText(textContent) : null,
    })
    .where(eq(uploadedDocumentTable.id, documentId))
}

async function reconcileStoredExtraction(document: DocumentPipelineRecord): Promise<void> {
  const storedText = document.textContent?.trim() ?? ""
  if (storedText.length === 0) return

  const now = new Date()
  const nextIndexingStatus =
    document.chunkCount > 0 ? DOCUMENT_INDEXING_STATUS.COMPLETED : document.indexingStatus

  const nextValues: Record<string, unknown> = {
    extractionStatus: DOCUMENT_EXTRACTION_STATUS.COMPLETED,
    extractionMethod: document.extractionMethod ?? getDefaultExtractionMethod(document.mimeType),
    extractedAt: document.extractedAt ?? now,
    textContent: truncateStoredText(storedText),
  }

  if (document.pageCount != null) {
    nextValues.pageCount = document.pageCount
  }

  if (document.imageDescription != null) {
    nextValues.imageDescription = document.imageDescription
  }

  if (document.extractionPayload != null) {
    nextValues.extractionPayload = document.extractionPayload
  }

  if (nextIndexingStatus !== document.indexingStatus) {
    nextValues.indexingStatus = nextIndexingStatus
    nextValues.indexingAttemptedAt = document.indexingAttemptedAt ?? now
  }

  await getDB()
    .update(uploadedDocumentTable)
    .set(nextValues)
    .where(eq(uploadedDocumentTable.id, document.id))
}

async function persistExtractionFailure({
  documentId,
  extractionStatus,
  extractionMethod,
  error,
  pageCount,
  extractionPayload,
}: {
  documentId: string
  extractionStatus: DocumentExtractionStatus
  extractionMethod: string | null
  error: unknown
  pageCount: number | null
  extractionPayload?: DocumentExtractionPayload | null
}): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await persistExtractionResult({
    documentId,
    extractionStatus,
    extractionMethod,
    textContent: "",
    imageDescription: null,
    pageCount,
    extractionPayload: {
      error: message,
      extractionMethod,
      pageCount,
      ...(extractionPayload ?? {}),
    },
  })
}

async function fetchDocumentBytes(fileKey: string): Promise<Uint8Array> {
  const r2 = await getR2Bucket()
  const object = await getFromR2(r2, fileKey)
  if (!object) {
    throw new Error(`R2 object not found: ${fileKey}`)
  }

  return new Uint8Array(await object.arrayBuffer())
}

export async function extractPdfDocument({
  documentId,
}: ExtractionInput): Promise<DocumentExtractionResult> {
  const document = await loadDocument(documentId)

  try {
    const bytes = await fetchDocumentBytes(document.fileKey)
    const detectedPageCount = normalizePageCount(await getPdfPageCount(bytes).catch(() => null))
    const metadata = await extractPdfMetadata(bytes).catch(() => null)
    const pageCount =
      detectedPageCount ?? normalizePageCount(metadata?.pageCount) ?? document.pageCount ?? null

    if (pageCount != null && pageCount > MAX_PDF_PAGE_COUNT) {
      const message = `PDF exceeds supported page limit of ${MAX_PDF_PAGE_COUNT} pages`
      const extractionPayload = buildPdfExtractionPayload({
        extractionMode: "page_limit_rejection",
        pageCount,
        error: message,
        maxPageCount: MAX_PDF_PAGE_COUNT,
      })

      await persistExtractionFailure({
        documentId,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
        extractionMethod: null,
        error: message,
        pageCount,
        extractionPayload,
      })

      return {
        documentId,
        applicationId: document.applicationId,
        mimeType: document.mimeType,
        success: false,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
        extractionMethod: null,
        textContent: "",
        pageCount,
        imageDescription: null,
        extractionPayload,
        reusedStoredExtraction: false,
        error: message,
      }
    }

    const nativeExtraction = await extractTextFromPdf(bytes, {
      enableOpenAiFallback: false,
    })

    if (nativeExtraction.success) {
      const textContent = nativeExtraction.text.trim()
      const extractionPayload = buildPdfExtractionPayload({
        extractionMode: "native",
        pageCount,
        textContent,
      })

      await persistExtractionResult({
        documentId,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.COMPLETED,
        extractionMethod: PDF_NATIVE_EXTRACTION_METHOD,
        textContent,
        imageDescription: null,
        pageCount,
        extractionPayload,
      })

      return {
        documentId,
        applicationId: document.applicationId,
        mimeType: document.mimeType,
        success: true,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.COMPLETED,
        extractionMethod: PDF_NATIVE_EXTRACTION_METHOD,
        textContent,
        pageCount,
        imageDescription: null,
        extractionPayload,
        reusedStoredExtraction: false,
      }
    }

    const renderedPages = await renderPdfPagesForExtraction({
      bytes,
      maxPages: MAX_PDF_PAGE_COUNT,
    })
    const renderedPageCount = normalizePageCount(renderedPages.pageCount) ?? pageCount

    if (!renderedPages.success || renderedPages.pages.length === 0) {
      const message =
        combineErrorMessages(nativeExtraction.error, renderedPages.error) ?? "PDF extraction failed"
      const extractionPayload = buildPdfExtractionPayload({
        extractionMode: "page_ai",
        pageCount: renderedPageCount,
        error: message,
      })

      await persistExtractionFailure({
        documentId,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
        extractionMethod: PDF_PAGE_AI_EXTRACTION_METHOD,
        error: message,
        pageCount: renderedPageCount,
        extractionPayload,
      })

      return {
        documentId,
        applicationId: document.applicationId,
        mimeType: document.mimeType,
        success: false,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
        extractionMethod: PDF_PAGE_AI_EXTRACTION_METHOD,
        textContent: "",
        pageCount: renderedPageCount,
        imageDescription: null,
        extractionPayload,
        reusedStoredExtraction: false,
        error: message,
      }
    }

    const pageExtraction = await extractTextFromRenderedPdfPages({
      pages: renderedPages.pages,
      filenamePrefix: document.fileName.replace(/\.pdf$/i, ""),
    })

    if (!pageExtraction.success) {
      const message =
        combineErrorMessages(nativeExtraction.error, pageExtraction.error) ?? "PDF extraction failed"
      const extractionPayload = buildPdfExtractionPayload({
        extractionMode: "page_ai",
        pageCount: renderedPageCount,
        pages: pageExtraction.pages,
        error: message,
      })

      await persistExtractionFailure({
        documentId,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
        extractionMethod: PDF_PAGE_AI_EXTRACTION_METHOD,
        error: message,
        pageCount: renderedPageCount,
        extractionPayload,
      })

      return {
        documentId,
        applicationId: document.applicationId,
        mimeType: document.mimeType,
        success: false,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
        extractionMethod: PDF_PAGE_AI_EXTRACTION_METHOD,
        textContent: "",
        pageCount: renderedPageCount,
        imageDescription: null,
        extractionPayload,
        reusedStoredExtraction: false,
        error: message,
      }
    }

    const textContent = pageExtraction.text.trim()
    const extractionPayload = buildPdfExtractionPayload({
      extractionMode: "page_ai",
      pageCount: renderedPageCount,
      textContent,
      pages: pageExtraction.pages,
    })

    await persistExtractionResult({
      documentId,
      extractionStatus: DOCUMENT_EXTRACTION_STATUS.COMPLETED,
      extractionMethod: PDF_PAGE_AI_EXTRACTION_METHOD,
      textContent,
      imageDescription: null,
      pageCount: renderedPageCount,
      extractionPayload,
    })

    return {
      documentId,
      applicationId: document.applicationId,
      mimeType: document.mimeType,
      success: true,
      extractionStatus: DOCUMENT_EXTRACTION_STATUS.COMPLETED,
      extractionMethod: PDF_PAGE_AI_EXTRACTION_METHOD,
      textContent,
      pageCount: renderedPageCount,
      imageDescription: null,
      extractionPayload,
      reusedStoredExtraction: false,
    }
  } catch (error) {
    const pageCount = document.pageCount ?? null
    await persistExtractionFailure({
      documentId,
      extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
      extractionMethod: PDF_NATIVE_EXTRACTION_METHOD,
      error,
      pageCount,
      extractionPayload: buildPdfExtractionPayload({
        extractionMode: "native",
        pageCount,
        error: error instanceof Error ? error.message : String(error),
      }),
    })

    const message = error instanceof Error ? error.message : String(error)
    const extractionPayload = buildPdfExtractionPayload({
      extractionMode: "native",
      pageCount,
      error: message,
    })

    return {
      documentId,
      applicationId: document.applicationId,
      mimeType: document.mimeType,
      success: false,
      extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
      extractionMethod: PDF_NATIVE_EXTRACTION_METHOD,
      textContent: "",
      pageCount,
      imageDescription: null,
      extractionPayload,
      reusedStoredExtraction: false,
      error: message,
    }
  }
}

export async function extractImageDocument({
  documentId,
}: ExtractionInput): Promise<DocumentExtractionResult> {
  const document = await loadDocument(documentId)

  try {
    const bytes = await fetchDocumentBytes(document.fileKey)
    const extraction = await extractTextFromImage({
      bytes,
      mimeType: document.mimeType as `image/${string}`,
      filename: document.fileName,
    })

    if (!extraction.success) {
      await persistExtractionFailure({
        documentId,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
        extractionMethod: "image",
        error: extraction.error ?? "Image extraction failed",
        pageCount: 1,
      })

      return {
        documentId,
        applicationId: document.applicationId,
        mimeType: document.mimeType,
        success: false,
        extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
        extractionMethod: "image",
        textContent: "",
        pageCount: 1,
        imageDescription: null,
        extractionPayload: {
          error: extraction.error ?? "Image extraction failed",
          source: "image",
        },
        reusedStoredExtraction: false,
        error: extraction.error,
      }
    }

    const parsed = parseImageExtractionResponse(extraction.text)
    const textContent = parsed.normalizedText
    const imageDescription = parsed.imageDescription

    await persistExtractionResult({
      documentId,
      extractionStatus: DOCUMENT_EXTRACTION_STATUS.COMPLETED,
      extractionMethod: "image",
      textContent,
      imageDescription,
      pageCount: 1,
      extractionPayload: {
        imageDescription,
        source: "image",
        textLength: textContent.length,
      },
    })

    return {
      documentId,
      applicationId: document.applicationId,
      mimeType: document.mimeType,
      success: true,
      extractionStatus: DOCUMENT_EXTRACTION_STATUS.COMPLETED,
      extractionMethod: "image",
      textContent,
      pageCount: 1,
      imageDescription,
      extractionPayload: {
        imageDescription,
        source: "image",
        textLength: textContent.length,
      },
      reusedStoredExtraction: false,
    }
  } catch (error) {
    await persistExtractionFailure({
      documentId,
      extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
      extractionMethod: "image",
      error,
      pageCount: 1,
    })

    const message = error instanceof Error ? error.message : String(error)
    return {
      documentId,
      applicationId: document.applicationId,
      mimeType: document.mimeType,
      success: false,
      extractionStatus: DOCUMENT_EXTRACTION_STATUS.FAILED,
      extractionMethod: "image",
      textContent: "",
      pageCount: 1,
      imageDescription: null,
      extractionPayload: {
        error: message,
        source: "image",
      },
      reusedStoredExtraction: false,
      error: message,
    }
  }
}

export async function ensureDocumentExtraction({
  documentId,
}: ExtractionInput): Promise<DocumentExtractionResult> {
  const document = await loadDocument(documentId)
  const storedText = document.textContent?.trim() ?? ""

  if (storedText.length > 0) {
    await reconcileStoredExtraction(document)
    const reconciledDocument = {
      ...document,
      extractionStatus: DOCUMENT_EXTRACTION_STATUS.COMPLETED,
      extractionMethod: document.extractionMethod ?? getDefaultExtractionMethod(document.mimeType),
      extractedAt: document.extractedAt ?? new Date(),
      textContent: truncateStoredText(storedText),
      indexingStatus:
        document.chunkCount > 0 ? DOCUMENT_INDEXING_STATUS.COMPLETED : document.indexingStatus,
      indexingAttemptedAt:
        document.chunkCount > 0 ? document.indexingAttemptedAt ?? new Date() : document.indexingAttemptedAt,
    }

    return buildStoredExtractionResult(reconciledDocument)
  }

  if (!isSupportedDocumentMimeType(document.mimeType)) {
    const extractionStatus = DOCUMENT_EXTRACTION_STATUS.UNSUPPORTED
    await persistExtractionResult({
      documentId,
      extractionStatus,
      extractionMethod: null,
      textContent: "",
      imageDescription: null,
      pageCount: null,
      extractionPayload: {
        mimeType: document.mimeType,
        source: "unsupported",
      },
    })

    return {
      documentId,
      applicationId: document.applicationId,
      mimeType: document.mimeType,
      success: false,
      extractionStatus,
      extractionMethod: null,
      textContent: "",
      pageCount: null,
      imageDescription: null,
      extractionPayload: {
        mimeType: document.mimeType,
        source: "unsupported",
      },
      reusedStoredExtraction: false,
      error: `Unsupported MIME type: ${document.mimeType}`,
    }
  }

  return document.mimeType.startsWith("image/")
    ? extractImageDocument({ documentId })
    : extractPdfDocument({ documentId })
}

export async function indexExtractedDocument({
  documentId,
}: ExtractionInput): Promise<DocumentIndexingResult> {
  const document = await loadDocument(documentId)
  const storedText = document.textContent?.trim() ?? ""

  if (storedText.length === 0) {
    await getDB()
      .update(uploadedDocumentTable)
      .set({
        indexingStatus: DOCUMENT_INDEXING_STATUS.SKIPPED,
        indexingAttemptedAt: new Date(),
        chunkCount: 0,
      })
      .where(eq(uploadedDocumentTable.id, documentId))

    return {
      documentId,
      success: true,
      indexingStatus: DOCUMENT_INDEXING_STATUS.SKIPPED,
      chunkCount: 0,
      reusedExistingIndex: false,
      skippedBecauseNoText: true,
    }
  }

  if (
    document.indexingStatus === DOCUMENT_INDEXING_STATUS.COMPLETED &&
    document.chunkCount > 0
  ) {
    return {
      documentId,
      success: true,
      indexingStatus: DOCUMENT_INDEXING_STATUS.COMPLETED,
      chunkCount: document.chunkCount,
      reusedExistingIndex: true,
      skippedBecauseNoText: false,
    }
  }

  const db = getDB()
  const now = new Date()

  await db
    .update(uploadedDocumentTable)
    .set({
      indexingStatus: DOCUMENT_INDEXING_STATUS.INDEXING,
      indexingAttemptedAt: now,
    })
    .where(eq(uploadedDocumentTable.id, documentId))

  try {
    const chunks = chunkText(storedText)
    if (chunks.length === 0) {
      await db
        .update(uploadedDocumentTable)
        .set({
          indexingStatus: DOCUMENT_INDEXING_STATUS.SKIPPED,
          indexingAttemptedAt: now,
          chunkCount: 0,
        })
        .where(eq(uploadedDocumentTable.id, documentId))

      return {
        documentId,
        success: true,
        indexingStatus: DOCUMENT_INDEXING_STATUS.SKIPPED,
        chunkCount: 0,
        reusedExistingIndex: false,
        skippedBecauseNoText: true,
      }
    }

    const openai = getOpenAIClient()
    const { env } = await getCloudflareContext({ async: true })

    if (!env.VECTORIZE) {
      await db
        .update(uploadedDocumentTable)
        .set({
          indexingStatus: DOCUMENT_INDEXING_STATUS.SKIPPED,
          indexingAttemptedAt: now,
          chunkCount: 0,
        })
        .where(eq(uploadedDocumentTable.id, documentId))

      logger.warn("VECTORIZE not available — skipping document indexing", { documentId })
      return {
        documentId,
        success: true,
        indexingStatus: DOCUMENT_INDEXING_STATUS.SKIPPED,
        chunkCount: 0,
        reusedExistingIndex: false,
        skippedBecauseNoText: false,
      }
    }

    const embeddings: number[][] = []
    const EMBEDDING_BATCH_SIZE = 500

    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE)
      const response = await openai.embeddings.create(
        {
          model: "text-embedding-3-small",
          input: batch.map((chunk) => chunk.content),
        },
        { signal: AbortSignal.timeout(AI_TIMEOUT_EMBEDDING_MS) },
      )
      embeddings.push(...response.data.map((item) => item.embedding))
    }

    const vectors = chunks.map((chunk, index) => ({
      id: `${documentId}-${chunk.index}`,
      values: embeddings[index],
      metadata: {
        applicationId: document.applicationId,
        chunkIndex: chunk.index,
        content: chunk.content.slice(0, 3500),
        documentId,
      },
    }))

    await env.VECTORIZE.upsert(vectors)

    await db
      .update(uploadedDocumentTable)
      .set({
        indexingStatus: DOCUMENT_INDEXING_STATUS.COMPLETED,
        indexingAttemptedAt: now,
        chunkCount: chunks.length,
      })
      .where(eq(uploadedDocumentTable.id, documentId))

    return {
      documentId,
      success: true,
      indexingStatus: DOCUMENT_INDEXING_STATUS.COMPLETED,
      chunkCount: chunks.length,
      reusedExistingIndex: false,
      skippedBecauseNoText: false,
    }
  } catch (error) {
    logAlert("vectorize_failure", "Document indexing failed", { documentId, error })
    await db
      .update(uploadedDocumentTable)
      .set({
        indexingStatus: DOCUMENT_INDEXING_STATUS.FAILED,
        indexingAttemptedAt: now,
      })
      .where(eq(uploadedDocumentTable.id, documentId))

    const message = error instanceof Error ? error.message : String(error)
    return {
      documentId,
      success: false,
      indexingStatus: DOCUMENT_INDEXING_STATUS.FAILED,
      chunkCount: 0,
      reusedExistingIndex: false,
      skippedBecauseNoText: false,
      error: message,
    }
  }
}

export async function queueDocumentExtraction({
  documentId,
}: ExtractionInput): Promise<QueueDocumentExtractionResult> {
  const extraction = await ensureDocumentExtraction({ documentId })
  const indexing = await indexExtractedDocument({ documentId })

  return {
    extraction,
    indexing,
  }
}
