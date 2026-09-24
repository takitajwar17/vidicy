import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireRouteSession,
  mockAuthorizeApplicationRouteAccess,
  mockGetDB,
  mockWithRateLimit,
  mockGetCloudflareContext,
  mockGetOpenAIClient,
  mockBuildAtlasSystemPrompt,
  mockUploadToR2,
  mockBuildR2Key,
  mockCheckActionRateLimit,
  mockEnsureDocumentExtraction,
  mockQueueDocumentExtraction,
  mockGetPdfPageCount,
  mockLoggerWarn,
  mockLoggerError,
  mockLogAlert,
} = vi.hoisted(() => ({
  mockRequireRouteSession: vi.fn(),
  mockAuthorizeApplicationRouteAccess: vi.fn(),
  mockGetDB: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockGetCloudflareContext: vi.fn(),
  mockGetOpenAIClient: vi.fn(),
  mockBuildAtlasSystemPrompt: vi.fn(),
  mockUploadToR2: vi.fn(),
  mockBuildR2Key: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockEnsureDocumentExtraction: vi.fn(),
  mockQueueDocumentExtraction: vi.fn(),
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

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: mockGetCloudflareContext,
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

vi.mock("@/services/document-pipeline", () => ({
  ensureDocumentExtraction: mockEnsureDocumentExtraction,
  queueDocumentExtraction: mockQueueDocumentExtraction,
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
    mockGetCloudflareContext.mockResolvedValue({
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
    mockQueueDocumentExtraction.mockResolvedValue({
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

  it("chat-with-pdf uses shared extraction and background queueing instead of the legacy PDF path", async () => {
    const { db, insertPayloads } = createChatDbMock();
    const waitUntil = vi.fn();
    mockGetDB.mockReturnValue(db);
    mockGetCloudflareContext.mockResolvedValue({
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
    expect(mockQueueDocumentExtraction).toHaveBeenCalledWith({
      documentId: "doc_upload",
    });
    expect(waitUntil).toHaveBeenCalled();
  });
});
