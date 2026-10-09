import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDocumentPipelineState } from "@/db/schema";
import { ensureDocumentExtraction, indexExtractedDocument } from "@/services/document-pipeline";

const {
  mockGetDB,
  mockGetRuntimeContext,
  mockGetR2Bucket,
  mockGetFromR2,
  mockGetPdfPageCount,
  mockExtractTextFromPdf,
  mockExtractTextFromImage,
  mockExtractTextFromRenderedPdfPages,
  mockExtractPdfMetadata,
  mockRenderPdfPagesForExtraction,
  mockGetOpenAIClient,
} = vi.hoisted(() => ({
  mockGetDB: vi.fn(),
  mockGetRuntimeContext: vi.fn(),
  mockGetR2Bucket: vi.fn(),
  mockGetFromR2: vi.fn(),
  mockGetPdfPageCount: vi.fn(),
  mockExtractTextFromPdf: vi.fn(),
  mockExtractTextFromImage: vi.fn(),
  mockExtractTextFromRenderedPdfPages: vi.fn(),
  mockExtractPdfMetadata: vi.fn(),
  mockRenderPdfPagesForExtraction: vi.fn(),
  mockGetOpenAIClient: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: mockGetRuntimeContext,
}));

vi.mock("@/lib/r2", () => ({
  getR2Bucket: mockGetR2Bucket,
  getFromR2: mockGetFromR2,
}));

vi.mock("@/services/pdf-parser", () => ({
  getPdfPageCount: mockGetPdfPageCount,
  extractTextFromPdf: mockExtractTextFromPdf,
  extractTextFromImage: mockExtractTextFromImage,
  extractTextFromRenderedPdfPages: mockExtractTextFromRenderedPdfPages,
  extractPdfMetadata: mockExtractPdfMetadata,
  renderPdfPagesForExtraction: mockRenderPdfPagesForExtraction,
  MAX_PDF_PAGE_COUNT: 40,
}));

vi.mock("@/lib/openai", () => ({
  getOpenAIClient: mockGetOpenAIClient,
}));

interface MockDocumentRecord {
  id: string;
  applicationId: string;
  fileKey: string;
  fileName: string;
  mimeType: string;
  textContent: string | null;
  extractionStatus: string;
  indexingStatus: string;
  extractionMethod: string | null;
  extractedAt: Date | null;
  indexingAttemptedAt: Date | null;
  pageCount: number | null;
  imageDescription: string | null;
  extractionPayload: Record<string, unknown> | null;
  chunkCount: number;
}

function createMockDatabase(document: MockDocumentRecord | null) {
  const updateSetCalls: Array<Record<string, unknown>> = [];
  const findFirst = vi.fn(async () => document);
  const where = vi.fn(async () => undefined);
  const set = vi.fn((values: Record<string, unknown>) => {
    updateSetCalls.push(values);
    if (document) {
      Object.assign(document, values);
    }

    return { where };
  });
  const update = vi.fn(() => ({ set }));

  return {
    db: {
      query: {
        uploadedDocumentTable: {
          findFirst,
        },
      },
      update,
    },
    updateSetCalls,
  };
}

describe("getDocumentPipelineState", () => {
  it("treats queued extraction and queued indexing as not ready", () => {
    expect(
      getDocumentPipelineState({
        extractionStatus: "queued",
        indexingStatus: "queued",
      }),
    ).toEqual({
      isReadableByAI: false,
      isIndexedForSearch: false,
    });
  });

  it("treats completed extraction and completed indexing as fully ready", () => {
    expect(
      getDocumentPipelineState({
        extractionStatus: "completed",
        indexingStatus: "completed",
      }),
    ).toEqual({
      isReadableByAI: true,
      isIndexedForSearch: true,
    });
  });

  it("keeps extraction readiness even when indexing fails", () => {
    expect(
      getDocumentPipelineState({
        extractionStatus: "completed",
        indexingStatus: "failed",
      }),
    ).toEqual({
      isReadableByAI: true,
      isIndexedForSearch: false,
    });
  });

  it("treats failed extraction and skipped indexing as unavailable", () => {
    expect(
      getDocumentPipelineState({
        extractionStatus: "failed",
        indexingStatus: "skipped",
      }),
    ).toEqual({
      isReadableByAI: false,
      isIndexedForSearch: false,
    });
  });
});

describe("document pipeline service", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockGetR2Bucket.mockResolvedValue({});
    mockGetFromR2.mockResolvedValue({
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    mockGetPdfPageCount.mockResolvedValue(2);
    mockExtractPdfMetadata.mockResolvedValue({ pageCount: 2 });
    mockGetRuntimeContext.mockResolvedValue({
      env: {
        VECTORIZE: {
          upsert: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
    mockGetOpenAIClient.mockReturnValue({
      embeddings: {
        create: vi.fn(async ({ input }: { input: string[] }) => ({
          data: input.map(() => ({ embedding: [0.1, 0.2, 0.3] })),
        })),
      },
    });
  });

  it("returns stored extraction without re-reading R2 when text already exists", async () => {
    const document: MockDocumentRecord = {
      id: "doc_1",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      textContent: "Stored text",
      extractionStatus: "completed",
      indexingStatus: "queued",
      extractionMethod: "pdf",
      extractedAt: new Date(),
      indexingAttemptedAt: null,
      pageCount: 2,
      imageDescription: null,
      extractionPayload: null,
      chunkCount: 0,
    };
    const { db } = createMockDatabase(document);
    mockGetDB.mockReturnValue(db);

    const result = await ensureDocumentExtraction({ documentId: "doc_1" });

    expect(result).toMatchObject({
      documentId: "doc_1",
      success: true,
      textContent: "Stored text",
      extractionStatus: "completed",
      reusedStoredExtraction: true,
    });
    expect(mockGetFromR2).not.toHaveBeenCalled();
    expect(mockExtractTextFromPdf).not.toHaveBeenCalled();
    expect(mockExtractTextFromImage).not.toHaveBeenCalled();
  });

  it("dispatches to the PDF extractor when extraction is missing", async () => {
    const document: MockDocumentRecord = {
      id: "doc_2",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "bank-statement.pdf",
      mimeType: "application/pdf",
      textContent: null,
      extractionStatus: "queued",
      indexingStatus: "queued",
      extractionMethod: null,
      extractedAt: null,
      indexingAttemptedAt: null,
      pageCount: null,
      imageDescription: null,
      extractionPayload: null,
      chunkCount: 0,
    };
    const { db, updateSetCalls } = createMockDatabase(document);
    mockGetDB.mockReturnValue(db);
    mockExtractTextFromPdf.mockResolvedValue({
      success: true,
      text: "  Page one text  ",
    });

    const result = await ensureDocumentExtraction({ documentId: "doc_2" });

    expect(mockGetFromR2).toHaveBeenCalledTimes(1);
    expect(mockExtractTextFromPdf).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      documentId: "doc_2",
      success: true,
      extractionStatus: "completed",
      extractionMethod: "pdf_native",
      textContent: "Page one text",
      pageCount: 2,
    });
    expect(document).toMatchObject({
      textContent: "Page one text",
      extractionStatus: "completed",
      extractionMethod: "pdf_native",
      pageCount: 2,
    });
    expect(updateSetCalls[0]).toMatchObject({
      extractionStatus: "completed",
      extractionMethod: "pdf_native",
      textContent: "Page one text",
    });
  });

  it("keeps PDF extraction successful when metadata parsing fails", async () => {
    const document: MockDocumentRecord = {
      id: "doc_2b",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "bank-statement.pdf",
      mimeType: "application/pdf",
      textContent: null,
      extractionStatus: "queued",
      indexingStatus: "queued",
      extractionMethod: null,
      extractedAt: null,
      indexingAttemptedAt: null,
      pageCount: null,
      imageDescription: null,
      extractionPayload: null,
      chunkCount: 0,
    };
    const { db } = createMockDatabase(document);
    mockGetDB.mockReturnValue(db);
    mockExtractPdfMetadata.mockRejectedValueOnce(new Error("metadata parse failed"));
    mockExtractTextFromPdf.mockResolvedValue({
      success: true,
      text: "  Page one text  ",
    });

    const result = await ensureDocumentExtraction({ documentId: "doc_2b" });

    expect(result).toMatchObject({
      documentId: "doc_2b",
      success: true,
      extractionStatus: "completed",
      extractionMethod: "pdf_native",
      textContent: "Page one text",
    });
    expect(document).toMatchObject({
      extractionStatus: "completed",
      textContent: "Page one text",
      extractionMethod: "pdf_native",
    });
  });

  it("rejects PDFs above the supported page limit before extraction", async () => {
    const document: MockDocumentRecord = {
      id: "doc_2c",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "huge-bundle.pdf",
      mimeType: "application/pdf",
      textContent: null,
      extractionStatus: "queued",
      indexingStatus: "queued",
      extractionMethod: null,
      extractedAt: null,
      indexingAttemptedAt: null,
      pageCount: null,
      imageDescription: null,
      extractionPayload: null,
      chunkCount: 0,
    };
    const { db, updateSetCalls } = createMockDatabase(document);
    mockGetDB.mockReturnValue(db);
    mockGetPdfPageCount.mockResolvedValue(41);

    const result = await ensureDocumentExtraction({ documentId: "doc_2c" });

    expect(result).toMatchObject({
      documentId: "doc_2c",
      success: false,
      extractionStatus: "failed",
      pageCount: 41,
      error: expect.stringContaining("40"),
    });
    expect(mockExtractTextFromPdf).not.toHaveBeenCalled();
    expect(document).toMatchObject({
      extractionStatus: "failed",
      pageCount: 41,
      textContent: null,
    });
    expect(updateSetCalls[0]).toMatchObject({
      extractionStatus: "failed",
      pageCount: 41,
    });
  });

  it("falls back to page-by-page AI extraction when native PDF extraction is empty", async () => {
    const document: MockDocumentRecord = {
      id: "doc_2d",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      textContent: null,
      extractionStatus: "queued",
      indexingStatus: "queued",
      extractionMethod: null,
      extractedAt: null,
      indexingAttemptedAt: null,
      pageCount: null,
      imageDescription: null,
      extractionPayload: null,
      chunkCount: 0,
    };
    const { db, updateSetCalls } = createMockDatabase(document);
    mockGetDB.mockReturnValue(db);
    mockGetPdfPageCount.mockResolvedValue(3);
    mockExtractTextFromPdf.mockResolvedValue({
      success: false,
      text: "",
      error: "No extractable text",
    });
    mockRenderPdfPagesForExtraction.mockResolvedValue({
      success: true,
      pageCount: 3,
      pages: [
        { pageNumber: 1, imageDataUrl: "data:image/jpeg;base64,page-1" },
        { pageNumber: 2, imageDataUrl: "data:image/jpeg;base64,page-2" },
        { pageNumber: 3, imageDataUrl: "data:image/jpeg;base64,page-3" },
      ],
    });
    mockExtractTextFromRenderedPdfPages.mockResolvedValue({
      success: true,
      text: "PAGE 1\n\nPAGE 2\n\nPAGE 3",
      pages: [
        { pageNumber: 1, text: "PAGE 1", success: true },
        { pageNumber: 2, text: "PAGE 2", success: true },
        { pageNumber: 3, text: "PAGE 3", success: true },
      ],
    });

    const result = await ensureDocumentExtraction({ documentId: "doc_2d" });

    expect(mockExtractTextFromPdf).toHaveBeenCalledTimes(1);
    expect(mockRenderPdfPagesForExtraction).toHaveBeenCalledTimes(1);
    expect(mockExtractTextFromRenderedPdfPages).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      documentId: "doc_2d",
      success: true,
      extractionStatus: "completed",
      extractionMethod: "pdf_page_ai",
      pageCount: 3,
      textContent: "PAGE 1\n\nPAGE 2\n\nPAGE 3",
    });
    expect(result.extractionPayload).toMatchObject({
      extractionMode: "page_ai",
    });
    expect(
      (result.extractionPayload as { pages: Array<{ pageNumber: number }> }).pages.map(
        (page) => page.pageNumber,
      ),
    ).toEqual([1, 2, 3]);
    expect(document).toMatchObject({
      extractionStatus: "completed",
      extractionMethod: "pdf_page_ai",
      pageCount: 3,
      textContent: "PAGE 1\n\nPAGE 2\n\nPAGE 3",
    });
    expect(updateSetCalls[0]).toMatchObject({
      extractionStatus: "completed",
      extractionMethod: "pdf_page_ai",
      pageCount: 3,
    });
  });

  it("dispatches to the image extractor for JPEG and stores the parsed description", async () => {
    const document: MockDocumentRecord = {
      id: "doc_3",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "passport.jpg",
      mimeType: "image/jpeg",
      textContent: null,
      extractionStatus: "queued",
      indexingStatus: "queued",
      extractionMethod: null,
      extractedAt: null,
      indexingAttemptedAt: null,
      pageCount: null,
      imageDescription: null,
      extractionPayload: null,
      chunkCount: 0,
    };
    const { db } = createMockDatabase(document);
    mockGetDB.mockReturnValue(db);
    mockExtractTextFromImage.mockResolvedValue({
      success: true,
      text: ["IMAGE_DESCRIPTION: An open laptop on a table.", "READABLE_TEXT:", "Hello world"].join(
        "\n",
      ),
    });

    const result = await ensureDocumentExtraction({ documentId: "doc_3" });

    expect(mockExtractTextFromImage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      documentId: "doc_3",
      success: true,
      extractionStatus: "completed",
      extractionMethod: "image",
      imageDescription: "An open laptop on a table.",
      textContent: expect.stringContaining("Hello world"),
    });
    expect(document).toMatchObject({
      extractionStatus: "completed",
      extractionMethod: "image",
      imageDescription: "An open laptop on a table.",
      textContent: expect.stringContaining("IMAGE_DESCRIPTION: An open laptop on a table."),
    });
  });

  it("reconciles stored text into authoritative extraction and indexing state", async () => {
    const document: MockDocumentRecord = {
      id: "doc_3b",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      textContent: "Existing stored text",
      extractionStatus: "queued",
      indexingStatus: "queued",
      extractionMethod: null,
      extractedAt: null,
      indexingAttemptedAt: null,
      pageCount: null,
      imageDescription: null,
      extractionPayload: { source: "legacy" },
      chunkCount: 2,
    };
    const { db, updateSetCalls } = createMockDatabase(document);
    mockGetDB.mockReturnValue(db);

    const result = await ensureDocumentExtraction({ documentId: "doc_3b" });

    expect(result).toMatchObject({
      documentId: "doc_3b",
      success: true,
      reusedStoredExtraction: true,
      extractionStatus: "completed",
      extractionMethod: "pdf",
      textContent: "Existing stored text",
    });
    expect(document).toMatchObject({
      extractionStatus: "completed",
      indexingStatus: "completed",
      extractionMethod: "pdf",
      textContent: "Existing stored text",
    });
    expect(updateSetCalls[0]).toMatchObject({
      extractionStatus: "completed",
      indexingStatus: "completed",
      extractionMethod: "pdf",
      textContent: "Existing stored text",
    });
  });

  it("skips indexing when there is no extracted text to index", async () => {
    const document: MockDocumentRecord = {
      id: "doc_4",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      textContent: null,
      extractionStatus: "failed",
      indexingStatus: "queued",
      extractionMethod: "pdf",
      extractedAt: null,
      indexingAttemptedAt: null,
      pageCount: null,
      imageDescription: null,
      extractionPayload: null,
      chunkCount: 0,
    };
    const { db, updateSetCalls } = createMockDatabase(document);
    mockGetDB.mockReturnValue(db);

    const result = await indexExtractedDocument({ documentId: "doc_4" });

    expect(result).toMatchObject({
      documentId: "doc_4",
      success: true,
      indexingStatus: "skipped",
      chunkCount: 0,
      skippedBecauseNoText: true,
    });
    expect(document).toMatchObject({
      indexingStatus: "skipped",
      chunkCount: 0,
    });
    expect(updateSetCalls[0]).toMatchObject({
      indexingStatus: "skipped",
      chunkCount: 0,
    });
    expect(mockGetOpenAIClient).not.toHaveBeenCalled();
    expect(mockGetRuntimeContext).not.toHaveBeenCalled();
  });

  it("indexes stored text even when extraction status is not completed", async () => {
    const vectorizeUpsert = vi.fn().mockResolvedValue(undefined);
    mockGetRuntimeContext.mockResolvedValue({
      env: {
        VECTORIZE: {
          upsert: vectorizeUpsert,
        },
      },
    });

    const document: MockDocumentRecord = {
      id: "doc_5",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "passport.pdf",
      mimeType: "application/pdf",
      textContent: "First paragraph.\n\nSecond paragraph.",
      extractionStatus: "failed",
      indexingStatus: "queued",
      extractionMethod: "pdf",
      extractedAt: null,
      indexingAttemptedAt: null,
      pageCount: null,
      imageDescription: null,
      extractionPayload: null,
      chunkCount: 0,
    };
    const { db } = createMockDatabase(document);
    mockGetDB.mockReturnValue(db);

    const result = await indexExtractedDocument({ documentId: "doc_5" });

    expect(result).toMatchObject({
      documentId: "doc_5",
      success: true,
      indexingStatus: "completed",
      chunkCount: 1,
    });
    expect(document).toMatchObject({
      extractionStatus: "failed",
      indexingStatus: "completed",
      chunkCount: 1,
    });
    expect(vectorizeUpsert).toHaveBeenCalledTimes(1);
    expect(mockGetOpenAIClient).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["long internal spaces", "START" + " ".repeat(6500) + "TAIL_MARKER"],
    ["one long paragraph", "a".repeat(11_990) + "TAIL_MARKER"],
    [
      "overlap between large paragraphs",
      "a".repeat(3100) + "\n\n" + "b".repeat(3090) + "TAIL_MARKER",
    ],
  ])("indexes all text within the chunk limit: %s", async (_name, textContent) => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    mockGetRuntimeContext.mockReturnValue({ env: { VECTORIZE: { upsert } } });
    const document: MockDocumentRecord = {
      id: "long_doc",
      applicationId: "app_1",
      fileKey: "file-key",
      fileName: "statement.pdf",
      mimeType: "application/pdf",
      textContent,
      extractionStatus: "completed",
      indexingStatus: "queued",
      extractionMethod: "pdf",
      extractedAt: new Date(),
      indexingAttemptedAt: null,
      pageCount: 1,
      imageDescription: null,
      extractionPayload: null,
      chunkCount: 0,
    };
    mockGetDB.mockReturnValue(createMockDatabase(document).db);

    const result = await indexExtractedDocument({ documentId: document.id });

    expect(result.success).toBe(true);
    const vectors = upsert.mock.calls[0][0] as Array<{ metadata: { content: string } }>;
    expect(vectors.length).toBeGreaterThan(1);
    expect(
      vectors.every(
        (vector) => vector.metadata.content.length > 0 && vector.metadata.content.length <= 3200,
      ),
    ).toBe(true);
    expect(vectors.at(-1)?.metadata.content).toContain("TAIL_MARKER");
    const embeddings = mockGetOpenAIClient.mock.results[0].value.embeddings.create;
    expect(embeddings.mock.calls[0][0].input).toEqual(
      vectors.map((vector) => vector.metadata.content),
    );
  });
});
