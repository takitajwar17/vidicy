import { measureProviderCall } from "@/infra/evaluation-metrics";
import { withGeminiCapacity } from "@/infra/google/gemini-capacity";
import "server-only";
import { logger } from "@/infra/logger";
import { AI_TIMEOUT_CHAT_MS } from "@/constants";
import { getOpenAIClient, isModelAvailabilityError, isTimeoutLikeAIError } from "@/lib/openai";
import { ThinkingLevel } from "@google/genai";
import { GEMINI_DOCUMENT_EXTRACTION_MODEL, getGeminiClient } from "@/lib/gemini";
import { buildGeminiDocumentPrompt, GEMINI_DOCUMENT_EMPTY_SENTINEL } from "@/lib/gemini-document";
import {
  OPENAI_DOC_EXTRACT_PRIMARY_MODEL,
  OPENAI_DOC_EXTRACT_FALLBACK_MODEL,
} from "@/lib/review-pipeline-version";

/**
 * Shared PDF text extraction service.
 *
 * This is the single source of truth for PDF parsing across the entire app.
 * Used by:
 *  - document upload background extraction
 *  - /api/chat-with-pdf     — immediate PDF chat
 *  - evaluateDocumentsAction — evaluation suite
 *
 * Powered by `unpdf` (edge-compatible PDF.js wrapper).
 */

export interface PdfParseResult {
  /** Extracted plain text. Empty string on failure. */
  text: string;
  /** Whether text was successfully extracted. */
  success: boolean;
  /** Human-readable error message when success is false. */
  error?: string;
}

const OPENAI_DOC_EXTRACT_MAX_CHARS = 120_000;
const OPENAI_DOC_EXTRACT_EMPTY_SENTINEL = GEMINI_DOCUMENT_EMPTY_SENTINEL;
export const MAX_PDF_PAGE_COUNT = 40;

export interface RenderedPdfPageImage {
  pageNumber: number;
  imageDataUrl: string;
}

export interface RenderedPdfPagesResult {
  pages: RenderedPdfPageImage[];
  success: boolean;
  pageCount: number;
  error?: string;
}

export interface PdfPageAiExtractionPage {
  pageNumber: number;
  text: string;
  success: boolean;
  error?: string;
}

export interface PdfPageAiExtractionResult {
  pages: PdfPageAiExtractionPage[];
  success: boolean;
  text: string;
  error?: string;
}

interface OpenAIDocumentExtractionParams {
  bytes?: Uint8Array;
  dataUrl?: string;
  mimeType: "application/pdf" | `image/${string}`;
  filename: string;
  promptOverride?: string;
}

interface ExtractTextFromPdfOptions {
  enableOpenAiFallback?: boolean;
}

export function buildDocumentExtractionPrompt({
  mimeType,
}: {
  mimeType: "application/pdf" | `image/${string}`;
}): string {
  const isPdf = mimeType === "application/pdf";

  if (isPdf) {
    return (
      "Extract all readable text from this PDF." +
      " Preserve original wording, numbers, dates, and line breaks where possible." +
      " Return plain text only (no markdown, no explanation)." +
      ` If nothing is readable, return exactly: ${OPENAI_DOC_EXTRACT_EMPTY_SENTINEL}`
    );
  }

  return (
    "Describe exactly everything visible in the image before extracting text," +
    " without guessing intent, purpose, document type, or context beyond what is visibly present." +
    " Be literal and exhaustive, and note uncertainty when something is unclear." +
    " Then extract all readable text." +
    " Preserve original wording, numbers, dates, and line breaks where possible." +
    " Return plain text only, no markdown, in this exact format:\n" +
    "IMAGE_DESCRIPTION: <exact visual description>\n" +
    "READABLE_TEXT:\n" +
    "<verbatim extracted text>\n" +
    `If there is no readable text, still provide IMAGE_DESCRIPTION, then write exactly ${OPENAI_DOC_EXTRACT_EMPTY_SENTINEL} on the line after READABLE_TEXT:.`
  );
}

function shouldUseGeminiDocumentExtraction(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  const flag = process.env.GEMINI_DOCUMENT_EXTRACTION?.toLowerCase();
  return flag !== "0" && flag !== "false";
}

function shouldUseOpenAIDocumentExtractionFallback(): boolean {
  const flag = process.env.OPENAI_DOCUMENT_EXTRACTION_FALLBACK?.toLowerCase();
  if (flag === "0" || flag === "false") return false;
  if (process.env.NODE_ENV === "test") return false;
  return true;
}

function buildPdfPageImageExtractionPrompt(): string {
  return (
    "Extract all readable text from this image." +
    " Preserve original wording, numbers, dates, and line breaks where possible." +
    " Return plain text only (no markdown, no explanation)." +
    ` If nothing is readable, return exactly: ${OPENAI_DOC_EXTRACT_EMPTY_SENTINEL}`
  );
}

async function loadPdfJsDocument(bytes: Uint8Array) {
  const { DOMMatrix, ImageData, Path2D } = await import("@napi-rs/canvas");
  const graphics = globalThis as unknown as Record<string, unknown>;
  graphics.DOMMatrix ??= DOMMatrix;
  graphics.ImageData ??= ImageData;
  graphics.Path2D ??= Path2D;
  const { createIsomorphicCanvasFactory, getDocumentProxy } = await import("unpdf");
  const CanvasFactory = await createIsomorphicCanvasFactory(() => import("@napi-rs/canvas"));
  // PDF.js can transfer its input to a worker. Keep the caller's bytes intact
  // for storage, metadata, rendering, and extraction fallbacks.
  return getDocumentProxy(bytes.slice(), { CanvasFactory });
}

async function extractTextFromPdfNative(bytes: Uint8Array): Promise<PdfParseResult> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes.slice());
    const { text } = await extractText(pdf, { mergePages: true });

    if (!text || text.trim().length === 0) {
      return {
        text: "",
        success: false,
        error: "No extractable text — document may be scanned or image-only",
      };
    }

    return { text: text.trim(), success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: "", success: false, error: message };
  }
}

async function callOpenAITextExtraction({
  model,
  bytes,
  dataUrl: providedDataUrl,
  mimeType,
  filename,
  promptOverride,
}: {
  model: string;
  bytes?: Uint8Array;
  dataUrl?: string;
  mimeType: "application/pdf" | `image/${string}`;
  filename: string;
  promptOverride?: string;
}): Promise<PdfParseResult> {
  const openai = getOpenAIClient();
  const dataUrl =
    providedDataUrl ?? (bytes ? `data:${mimeType};base64,${bufferToBase64(bytes)}` : null);
  if (!dataUrl) {
    throw new Error("Document extraction requires bytes or a data URL");
  }

  const isPdf = mimeType === "application/pdf";
  const prompt = promptOverride ?? buildDocumentExtractionPrompt({ mimeType });

  const content = [
    { type: "input_text" as const, text: prompt },
    isPdf
      ? {
          type: "input_file" as const,
          filename,
          file_data: dataUrl,
        }
      : {
          type: "input_image" as const,
          detail: "high" as const,
          image_url: dataUrl,
        },
  ];

  const response = await measureProviderCall({
    model,
    stage: "extraction_fallback",
    run: () =>
      openai.responses.create(
        {
          model,
          input: [{ role: "user", content }],
          max_output_tokens: 6_000,
        },
        { signal: AbortSignal.timeout(AI_TIMEOUT_CHAT_MS) },
      ),
  });

  const raw = response.output_text?.trim() ?? "";
  if (!raw || raw === OPENAI_DOC_EXTRACT_EMPTY_SENTINEL) {
    return {
      text: "",
      success: false,
      error: "No extractable text — document may be scanned or image-only",
    };
  }

  return {
    text: raw.slice(0, OPENAI_DOC_EXTRACT_MAX_CHARS),
    success: true,
  };
}

async function callGeminiTextExtraction({
  bytes,
  mimeType,
}: {
  bytes: Uint8Array;
  mimeType: "application/pdf" | `image/${string}`;
}): Promise<PdfParseResult> {
  const gemini = getGeminiClient();
  const response = await measureProviderCall({
    model: GEMINI_DOCUMENT_EXTRACTION_MODEL,
    stage: "extraction",
    run: () =>
      withGeminiCapacity({
        timeoutMs: AI_TIMEOUT_CHAT_MS,
        run: (remainingMs) =>
          gemini.models.generateContent({
            model: GEMINI_DOCUMENT_EXTRACTION_MODEL,
            contents: [
              {
                inlineData: {
                  data: bufferToBase64(bytes),
                  mimeType,
                },
              },
              buildGeminiDocumentPrompt({ mimeType }),
            ],
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              abortSignal: AbortSignal.timeout(remainingMs),
              httpOptions: { timeout: remainingMs, retryOptions: { attempts: 1 } },
            },
          }),
      }),
  });

  const candidate = response.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`Gemini document extraction did not complete: ${candidate.finishReason}`);
  }

  const raw = response.text?.trim() ?? "";
  if (!raw || raw === GEMINI_DOCUMENT_EMPTY_SENTINEL) {
    return {
      text: "",
      success: false,
      error: "No extractable text — document may be scanned or image-only",
    };
  }

  return { text: raw.slice(0, OPENAI_DOC_EXTRACT_MAX_CHARS), success: true };
}

async function extractTextWithGemini({
  bytes,
  mimeType,
}: {
  bytes: Uint8Array;
  mimeType: "application/pdf" | `image/${string}`;
}): Promise<PdfParseResult> {
  try {
    const result = await callGeminiTextExtraction({ bytes, mimeType });
    logger.info("Recovered document text with Gemini document extraction", {
      provider: "vertex-ai",
      model: GEMINI_DOCUMENT_EXTRACTION_MODEL,
      mimeType,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Gemini document extraction failed", { error: message, mimeType });
    return { text: "", success: false, error: message };
  }
}

async function extractTextWithOpenAIDocumentFallback({
  bytes,
  dataUrl,
  mimeType,
  filename,
  promptOverride,
}: OpenAIDocumentExtractionParams): Promise<PdfParseResult> {
  try {
    return await callOpenAITextExtraction({
      model: OPENAI_DOC_EXTRACT_PRIMARY_MODEL,
      bytes,
      dataUrl,
      mimeType,
      filename,
      promptOverride,
    });
  } catch (primaryError) {
    const shouldRetryFallback =
      isModelAvailabilityError({
        error: primaryError,
        model: OPENAI_DOC_EXTRACT_PRIMARY_MODEL,
      }) || isTimeoutLikeAIError({ error: primaryError });

    if (!shouldRetryFallback) {
      const message = primaryError instanceof Error ? primaryError.message : String(primaryError);
      return { text: "", success: false, error: message };
    }

    logger.warn("Primary OpenAI document extraction model failed; retrying fallback", {
      model: OPENAI_DOC_EXTRACT_PRIMARY_MODEL,
      fallbackModel: OPENAI_DOC_EXTRACT_FALLBACK_MODEL,
      error: primaryError,
    });

    try {
      return await callOpenAITextExtraction({
        model: OPENAI_DOC_EXTRACT_FALLBACK_MODEL,
        bytes,
        dataUrl,
        mimeType,
        filename,
        promptOverride,
      });
    } catch (fallbackError) {
      const message =
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      return { text: "", success: false, error: message };
    }
  }
}

/**
 * Extracts plain text from a PDF given its raw bytes.
 *
 * Returns a result object rather than throwing so callers can treat
 * extraction failures as non-fatal (e.g. scanned / image-only PDFs).
 */
export async function extractTextFromPdf(
  bytes: Uint8Array,
  { enableOpenAiFallback = true }: ExtractTextFromPdfOptions = {},
): Promise<PdfParseResult> {
  const nativeResult = await extractTextFromPdfNative(bytes);
  if (nativeResult.success) {
    return nativeResult;
  }

  if (shouldUseGeminiDocumentExtraction()) {
    const geminiResult = await extractTextWithGemini({ bytes, mimeType: "application/pdf" });
    if (geminiResult.success) return geminiResult;
  }

  if (!enableOpenAiFallback || !shouldUseOpenAIDocumentExtractionFallback()) {
    return nativeResult;
  }

  const fallbackResult = await extractTextWithOpenAIDocumentFallback({
    bytes,
    mimeType: "application/pdf",
    filename: "uploaded-document.pdf",
  });

  if (fallbackResult.success) {
    logger.info("Recovered document text with OpenAI extraction fallback");
    return fallbackResult;
  }

  return {
    text: "",
    success: false,
    error: [nativeResult.error, fallbackResult.error].filter(Boolean).join(" | "),
  };
}

/**
 * Extracts text from an image file using OpenAI Responses API.
 * Used for scanned uploads where OCR-like extraction is needed.
 */
export async function extractTextFromImage({
  bytes,
  mimeType,
  filename,
}: {
  bytes: Uint8Array;
  mimeType: `image/${string}`;
  filename?: string;
}): Promise<PdfParseResult> {
  if (shouldUseGeminiDocumentExtraction()) {
    const geminiResult = await extractTextWithGemini({ bytes, mimeType });
    if (geminiResult.success) return geminiResult;
  }

  if (!shouldUseOpenAIDocumentExtractionFallback()) {
    return {
      text: "",
      success: false,
      error: "OpenAI document extraction fallback is disabled",
    };
  }

  return extractTextWithOpenAIDocumentFallback({
    bytes,
    mimeType,
    filename: filename ?? "uploaded-image",
  });
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const pdf = await loadPdfJsDocument(bytes);
  return pdf.numPages;
}

export async function renderPdfPagesForExtraction({
  bytes,
  maxPages = MAX_PDF_PAGE_COUNT,
}: {
  bytes: Uint8Array;
  maxPages?: number;
}): Promise<RenderedPdfPagesResult> {
  try {
    const pdf = await loadPdfJsDocument(bytes);
    const totalPages = pdf.numPages;
    const pagesToRender = Math.min(totalPages, maxPages);
    const pages: RenderedPdfPageImage[] = [];

    for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber++) {
      try {
        const page = await pdf.getPage(pageNumber);
        const defaultViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1200 / defaultViewport.width, 2.0);
        const viewport = page.getViewport({ scale });

        const { createCanvas } = await import("@napi-rs/canvas");
        const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("PDF canvas 2D context unavailable");
        }

        await page.render({
          canvas: null,
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        const base64 = canvas.toBuffer("image/jpeg", 85).toString("base64");

        pages.push({
          pageNumber,
          imageDataUrl: `data:image/jpeg;base64,${base64}`,
        });
      } catch (pageError) {
        logger.warn("PDF extraction page render failed", { pageNumber, error: pageError });
      }
    }

    return {
      pages,
      success: pages.length > 0,
      pageCount: totalPages,
      error: pages.length === 0 ? "No pages could be rendered" : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      pages: [],
      success: false,
      pageCount: 0,
      error: message,
    };
  }
}

export async function extractTextFromRenderedPdfPages({
  pages,
  filenamePrefix = "uploaded-document",
}: {
  pages: RenderedPdfPageImage[];
  filenamePrefix?: string;
}): Promise<PdfPageAiExtractionResult> {
  if (pages.length === 0) {
    return {
      pages: [],
      success: false,
      text: "",
      error: "No rendered PDF pages available for AI extraction",
    };
  }

  if (!shouldUseOpenAIDocumentExtractionFallback()) {
    return {
      pages: [],
      success: false,
      text: "",
      error: "OpenAI document extraction fallback is disabled",
    };
  }

  const sortedPages = [...pages].sort((left, right) => left.pageNumber - right.pageNumber);
  const extractedPages: PdfPageAiExtractionPage[] = [];

  for (const page of sortedPages) {
    const result = await extractTextWithOpenAIDocumentFallback({
      dataUrl: page.imageDataUrl,
      mimeType: "image/jpeg",
      filename: `${filenamePrefix}-page-${page.pageNumber}.jpg`,
      promptOverride: buildPdfPageImageExtractionPrompt(),
    });

    extractedPages.push({
      pageNumber: page.pageNumber,
      text: result.success ? result.text.trim() : "",
      success: result.success,
      error: result.error,
    });
  }

  const text = extractedPages
    .filter((page) => page.success && page.text.length > 0)
    .map((page) => page.text)
    .join("\n\n")
    .slice(0, OPENAI_DOC_EXTRACT_MAX_CHARS);

  if (text.length === 0) {
    return {
      pages: extractedPages,
      success: false,
      text: "",
      error:
        extractedPages
          .map((page) => page.error)
          .filter(Boolean)
          .join(" | ") || "No extractable text found across rendered PDF pages",
    };
  }

  return {
    pages: extractedPages,
    success: true,
    text,
  };
}

export interface PdfMetadataSignals {
  /** Authoring application (e.g. "Microsoft Word", "Adobe Acrobat") */
  creator: string | null;
  /** PDF renderer/library (e.g. "Adobe PDF Library 21.0") */
  producer: string | null;
  /** Parsed creation date, null if absent or unparseable */
  creationDate: Date | null;
  /** Parsed last-modification date, null if absent or unparseable */
  modDate: Date | null;
  /** True if ModDate is meaningfully later than CreationDate */
  isModified: boolean;
  /** Days between creation and last modification, null if dates unavailable */
  modificationGapDays: number | null;
  /** True if creation date is in the future (impossible for a genuine document) */
  creationInFuture: boolean;
  /** True if all metadata fields are empty (stripped metadata is suspicious) */
  hasNoMetadata: boolean;
  /** Total page count */
  pageCount: number;
}

/**
 * Parses a PDF date string of the form D:YYYYMMDDHHmmSSOHH'mm'
 * Returns null if the string is absent, malformed, or produces an invalid Date.
 */
function parsePdfDate(raw: unknown): Date | null {
  if (!raw || typeof raw !== "string") return null;
  // Strip leading "D:" prefix
  const s = raw.replace(/^D:/, "");
  // Extract components — everything after the seconds is optional timezone
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, min, sec] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${min}:${sec}Z`);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Extracts PDF metadata and computes document authenticity signals.
 *
 * Uses pdfjs getMetadata() to read the PDF information dictionary.
 * Only applicable to PDF files — call only when mimeType === "application/pdf".
 * Always non-fatal; returns a safe default on any error.
 */
export async function extractPdfMetadata(bytes: Uint8Array): Promise<PdfMetadataSignals> {
  const safe: PdfMetadataSignals = {
    creator: null,
    producer: null,
    creationDate: null,
    modDate: null,
    isModified: false,
    modificationGapDays: null,
    creationInFuture: false,
    hasNoMetadata: false,
    pageCount: 0,
  };

  try {
    const { DOMMatrix, ImageData, Path2D } = await import("@napi-rs/canvas");
    const graphics = globalThis as unknown as Record<string, unknown>;
    graphics.DOMMatrix ??= DOMMatrix;
    graphics.ImageData ??= ImageData;
    graphics.Path2D ??= Path2D;
    const { getResolvedPDFJS } = await import("unpdf");
    const { getDocument } = await getResolvedPDFJS();

    const pdf = await getDocument({ data: bytes.slice() }).promise;

    const { info } = (await pdf.getMetadata()) as {
      info: Record<string, unknown>;
      metadata: unknown;
    };

    const creator = typeof info.Creator === "string" ? info.Creator.trim() || null : null;
    const producer = typeof info.Producer === "string" ? info.Producer.trim() || null : null;
    const creationDate = parsePdfDate(info.CreationDate);
    const modDate = parsePdfDate(info.ModDate);
    const pageCount = pdf.numPages;

    const hasNoMetadata = !creator && !producer && !creationDate && !modDate;

    let isModified = false;
    let modificationGapDays: number | null = null;
    if (creationDate && modDate) {
      const gapMs = modDate.getTime() - creationDate.getTime();
      modificationGapDays = Math.round(gapMs / 86_400_000);
      // Only flag as modified if ModDate is at least 1 minute later than CreationDate
      isModified = gapMs > 60_000;
    }

    const creationInFuture = creationDate ? creationDate > new Date() : false;

    return {
      creator,
      producer,
      creationDate,
      modDate,
      isModified,
      modificationGapDays,
      creationInFuture,
      hasNoMetadata,
      pageCount,
    };
  } catch {
    return safe;
  }
}

export interface DocumentImagesResult {
  /** Base64 data URLs (JPEG or original format) for each page/image, ready for GPT-4o Vision. */
  images: string[];
  /** Whether at least one image was successfully produced. */
  success: boolean;
  /** Total page count for PDFs, 1 for image files. */
  pageCount: number;
  /** Human-readable error if success is false. */
  error?: string;
}

/**
 * Extracts visual representations of a document for GPT-4o Vision analysis.
 *
 * - Image files (JPEG, PNG, WebP, GIF): encoded as base64 data URLs directly.
 * - PDF files: first `maxPages` pages rendered to JPEG via PDF.js and the Node canvas.
 *   Falls back gracefully to { images: [], success: false } if rendering is not
 *   supported in the current runtime (e.g. local Next.js dev without canvas).
 *
 * Always non-fatal — callers must handle the case where images is empty.
 */
export async function extractDocumentImages(
  mimeType: string,
  bytes: Uint8Array,
  maxPages = 3,
): Promise<DocumentImagesResult> {
  // --- Image files: encode bytes directly as a base64 data URL ---
  if (mimeType.startsWith("image/")) {
    try {
      const base64 = bufferToBase64(bytes);
      return {
        images: [`data:${mimeType};base64,${base64}`],
        success: true,
        pageCount: 1,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { images: [], success: false, pageCount: 0, error: message };
    }
  }

  // --- PDFs: render pages via PDF.js and the Node canvas ---
  if (mimeType !== "application/pdf") {
    return {
      images: [],
      success: false,
      pageCount: 0,
      error: `Unsupported MIME type: ${mimeType}`,
    };
  }

  const renderedPages = await renderPdfPagesForExtraction({ bytes, maxPages });
  return {
    images: renderedPages.pages.map((page) => page.imageDataUrl),
    success: renderedPages.success,
    pageCount: renderedPages.pageCount,
    error: renderedPages.error,
  };
}

/**
 * Converts a Uint8Array to a base64 string.
 * Uses btoa with a typed-array-safe approach that works in all runtimes.
 */
function bufferToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
