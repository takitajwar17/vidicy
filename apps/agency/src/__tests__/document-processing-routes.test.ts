import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireRouteSession,
  mockAuthorizeApplicationRouteAccess,
  mockGetDB,
  mockWithRateLimit,
  mockGetRuntimeContext,
  mockGetOpenAIClient,
  mockBuildAtlasSystemPrompt,
  mockUploadToR2,
  mockBuildR2Key,
  mockCheckActionRateLimit,
  mockEnsureDocumentExtraction,
  mockEnqueueDocumentExtraction,
  mockGetPdfPageCount,
  mockLoggerWarn,
  mockLoggerError,
  mockLogAlert,
} = vi.hoisted(() => ({
  mockRequireRouteSession: vi.fn(),
  mockAuthorizeApplicationRouteAccess: vi.fn(),
  mockGetDB: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockGetRuntimeContext: vi.fn(),
  mockGetOpenAIClient: vi.fn(),
  mockBuildAtlasSystemPrompt: vi.fn(),
  mockUploadToR2: vi.fn(),
  mockBuildR2Key: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockEnsureDocumentExtraction: vi.fn(),
  mockEnqueueDocumentExtraction: vi.fn(),
  mockGetPdfPageCount: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLogAlert: vi.fn(),
}));

vi.mock("@/app/api/_utils/request-auth", () => ({
  requireRouteSession: mockRequireRouteSession,
}));

vi.mock("@/app/api/_utils/application-route-auth", () => ({
  authorizeApplicationRouteAccess: mockAuthorizeApplicationRouteAccess,
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("@/infra/with-rate-limit", () => ({
  withRateLimit: mockWithRateLimit,
}));

vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: mockGetRuntimeContext,
}));

vi.mock("@/lib/openai", () => ({
  getOpenAIClient: mockGetOpenAIClient,
  isModelAvailabilityError: vi.fn(() => false),
  isTimeoutLikeAIError: vi.fn(() => false),
}));

vi.mock("@/services/atlas-prompt", () => ({
  buildAtlasSystemPrompt: mockBuildAtlasSystemPrompt,
  sanitizeForPrompt: vi.fn((value: string) => value),
}));

vi.mock("@/lib/r2", () => ({
  uploadToR2: mockUploadToR2,
  buildR2Key: mockBuildR2Key,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
}));

vi.mock("@/infra/action-rate-limit", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
}));

vi.mock("@/infra/google/document-tasks", () => ({
  enqueueDocumentExtraction: mockEnqueueDocumentExtraction,
}));

vi.mock("@/services/document-pipeline", () => ({
  ensureDocumentExtraction: mockEnsureDocumentExtraction,
  queueDocumentExtraction: vi.fn(),
}));

vi.mock("@/services/pdf-parser", () => ({
  getPdfPageCount: mockGetPdfPageCount,
  MAX_PDF_PAGE_COUNT: 40,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
    info: vi.fn(),
  },
  logAlert: mockLogAlert,
}));

import { POST as chatWithPdfPOST } from "@/app/api/chat-with-pdf/route";

function createChatDbMock() {
  const insertPayloads: Array<Record<string, unknown>> = [];

  const db = {
    query: {
      uploadedDocumentTable: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      visaApplicationTable: {
        findFirst: vi.fn().mockResolvedValue({
          id: "app_123",
          visaType: "Study Permit",
          homeCountry: "Bangladesh",
          destinationCountry: "Canada",
          embassy: "Canada Dhaka",
          status: "checklist",
        }),
      },
      chatConversationTable: {
        findFirst: vi.fn().mockResolvedValue({
          id: "conv_123",
          applicationId: "app_123",
        }),
      },
      chatMessageTable: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      documentEvaluationTable: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      checklistItemTable: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      applicantTable: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn((payload: Record<string, unknown>) => {
        insertPayloads.push(payload);

        if (payload.fileKey) {
          return {
            returning: vi.fn().mockResolvedValue([
              {
                id: "doc_upload",
                ...payload,
              },
            ]),
          };
        }

        return {
          returning: vi.fn().mockResolvedValue([
            {
              id: `${String(payload.role)}_message`,
              ...payload,
            },
          ]),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  };

  return { db, insertPayloads };
}

describe("legacy document processing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireRouteSession.mockResolvedValue({
      session: {
        userId: "user_123",
        user: {
          id: "user_123",
        },
      },
    });
    mockAuthorizeApplicationRouteAccess.mockResolvedValue({
      session: {
        userId: "user_123",
        user: {
          id: "user_123",
        },
      },
    });
    mockWithRateLimit.mockImplementation(async (fn: () => Promise<unknown>) => fn());
    mockGetRuntimeContext.mockResolvedValue({
      env: {
        R2: {},
      },
      ctx: {
        waitUntil: vi.fn(),
      },
    });
    mockUploadToR2.mockResolvedValue(undefined);
    mockBuildR2Key.mockReturnValue("chat-upload-key");
    mockCheckActionRateLimit.mockResolvedValue(undefined);
    mockEnsureDocumentExtraction.mockResolvedValue({
      documentId: "doc_upload",
      applicationId: "app_123",
      mimeType: "application/pdf",
      success: true,
      extractionStatus: "completed",
      extractionMethod: "pdf_native",
      textContent: "Passport text",
      pageCount: 2,
      imageDescription: null,
      extractionPayload: null,
      reusedStoredExtraction: false,
    });
    mockEnqueueDocumentExtraction.mockResolvedValue({
      extraction: {
        success: true,
      },
      indexing: {
        success: true,
      },
    });
    mockGetPdfPageCount.mockResolvedValue(2);
    mockBuildAtlasSystemPrompt.mockReturnValue("system prompt");
    mockGetOpenAIClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "Assistant answer" } }],
          }),
        },
      },
    });
  });

  it.each([
    ["application/json", '{}'],
    ["multipart/form-data", "missing boundary"],
    ["multipart/form-data; boundary=expected", "--expected\r\nContent-Disposition: form-data; name=\"message\"\r\n\r\ntruncated"],
  ])("returns 400 for malformed form input: %s", async (contentType, body) => {
    const response = await chatWithPdfPOST(new Request("https://example.com/upload", {
      method: "POST", headers: { "Content-Type": contentType }, body,
    }));
    expect(response?.status).toBe(400);
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
  });

  it("bounds a chunked upload body before parsing ignored fields", async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull: (() => { let chunks = 0; return (controller: ReadableStreamDefaultController<Uint8Array>) => {
        if (++chunks <= 13) controller.enqueue(new Uint8Array(1024 * 1024));
        else controller.close();
      }; })(),
      cancel: cancelled,
    });
    const response = await chatWithPdfPOST(new Request("https://example.com/upload", {
      method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=upload" },
      body: stream, duplex: "half",
    } as RequestInit & { duplex: string }));
    expect(response?.status).toBe(413);
    expect(cancelled).toHaveBeenCalled();
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
  });

  it.each(["applicationId", "conversationId", "message", "thumbnail"])("rejects a File in chat field %s", async field => {
    const form = new FormData();
    form.set("file", new File(["pdf"], "passport.pdf", { type: "application/pdf" }));
    form.set("applicationId", "app_123");
    form.set(field, new File(["invalid"], "field.txt"));
    const response = await chatWithPdfPOST(new Request("https://example.com/api/chat-with-pdf", { method: "POST", body: form }));
    expect(response?.status).toBe(400);
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
  });

  it.each([["message", 16_001], ["thumbnail", 512_001]] as const)("rejects oversized chat field %s", async (field, length) => {
    const form = new FormData();
    form.set("file", new File(["pdf"], "passport.pdf", { type: "application/pdf" }));
    form.set("applicationId", "app_123");
    form.set(field, "x".repeat(length));
    const response = await chatWithPdfPOST(new Request("https://example.com/api/chat-with-pdf", { method: "POST", body: form }));
    expect(response?.status).toBe(400);
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
  });

  it("chat-with-pdf uses shared extraction and background queueing instead of the legacy PDF path", async () => {
    const { db, insertPayloads } = createChatDbMock();
    const waitUntil = vi.fn();
    mockGetDB.mockReturnValue(db);
    mockGetRuntimeContext.mockResolvedValue({
      env: {
        R2: {},
      },
      ctx: {
        waitUntil,
      },
    });

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "passport.pdf", { type: "application/pdf" }));
    formData.set("applicationId", "app_123");
    formData.set("conversationId", "conv_123");
    formData.set("message", "What does this document show?");

    const response = await chatWithPdfPOST(
      new Request("http://localhost:3000/api/chat-with-pdf", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error("Expected /api/chat-with-pdf to return a Response");
    }
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      userMessage?: { content?: string };
      assistantMessage?: { content?: string };
    };

    expect(body.userMessage?.content).toContain("passport.pdf");
    expect(body.assistantMessage?.content).toBe("Assistant answer");
    expect(insertPayloads[0]).toMatchObject({
      applicationId: "app_123",
      fileKey: "chat-upload-key",
      extractionStatus: "queued",
      indexingStatus: "queued",
      pageCount: 2,
    });
    expect(mockEnsureDocumentExtraction).toHaveBeenCalledWith({
      documentId: "doc_upload",
    });
    expect(mockEnqueueDocumentExtraction).toHaveBeenCalledWith({
      documentId: "doc_upload",
    });
    expect(waitUntil).toHaveBeenCalled();
  });
});
