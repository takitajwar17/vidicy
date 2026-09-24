import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const {
  mockAuthorizeApplicationRouteAccess,
  mockGetSessionFromCookie,
  mockGetDB,
  mockEnsureDocumentExtraction,
  mockQueueDocumentExtraction,
  mockCheckActionRateLimit,
} = vi.hoisted(() => ({
  mockAuthorizeApplicationRouteAccess: vi.fn(),
  mockGetSessionFromCookie: vi.fn(),
  mockGetDB: vi.fn(),
  mockEnsureDocumentExtraction: vi.fn(),
  mockQueueDocumentExtraction: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
}));

vi.mock("@/app/api/_utils/application-route-auth", () => ({
  authorizeApplicationRouteAccess: mockAuthorizeApplicationRouteAccess,
}));

vi.mock("@/utils/auth", () => ({
  getSessionFromCookie: mockGetSessionFromCookie,
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
  logAlert: vi.fn(),
}));

vi.mock("@/infra/action-rate-limit", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
}));

vi.mock("@/infra/with-rate-limit", () => ({
  withRateLimit: async <T>(fn: () => Promise<T>) => fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

vi.mock("@/services/document-pipeline", () => ({
  ensureDocumentExtraction: mockEnsureDocumentExtraction,
  queueDocumentExtraction: mockQueueDocumentExtraction,
}));

vi.mock("@/services/pdf-parser", () => ({
  extractTextFromPdf: vi.fn(),
  getPdfPageCount: vi.fn(),
  MAX_PDF_PAGE_COUNT: 40,
}));

vi.mock("@/services/atlas-prompt", () => ({
  buildAtlasSystemPrompt: vi.fn(() => "system prompt"),
  sanitizeForPrompt: vi.fn((value: string) => value),
}));

vi.mock("@/lib/openai", () => ({
  getOpenAIClient: vi.fn(),
}));

vi.mock("@/lib/r2", () => ({
  uploadToR2: vi.fn(),
  buildR2Key: vi.fn(() => "file-key"),
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
}));

vi.mock("@/infra/usage-tracking", () => ({
  trackUsage: vi.fn(),
  USAGE_EVENTS: {
    DOCUMENT_UPLOADED: "document_uploaded",
  },
}));

vi.mock("@/server/marketing/events", () => ({
  recordMarketingEvent: vi.fn(),
}));

import { POST as uploadPdfPOST } from "@/app/api/documents/upload/pdf/route";
import { POST as uploadImagePOST } from "@/app/api/documents/upload/image/route";
import { GET as documentPreviewGET } from "@/app/api/document-preview/[documentId]/route";
import { POST as chatWithPdfPOST } from "@/app/api/chat-with-pdf/route";

function deniedResponse() {
  return NextResponse.json({ error: "Shared auth denied" }, { status: 403 });
}

function expectDefinedResponse(response: Response | undefined): Response {
  expect(response).toBeDefined();
  if (!response) {
    throw new Error("Expected a response");
  }
  return response;
}

describe("application-protected route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionFromCookie.mockResolvedValue({
      userId: "user_123",
      user: {
        id: "user_123",
        email: "owner@example.com",
      },
    });
    mockCheckActionRateLimit.mockResolvedValue(undefined);
    mockEnsureDocumentExtraction.mockResolvedValue(undefined);
    mockQueueDocumentExtraction.mockResolvedValue(undefined);
    mockAuthorizeApplicationRouteAccess.mockResolvedValue({
      response: deniedResponse(),
    });
  });

  it("documents/upload/pdf returns the shared auth response for application access denial", async () => {
    const formData = new FormData();
    formData.set("file", new File(["hello"], "evidence.pdf", { type: "application/pdf" }));
    formData.set("applicationId", "app_123");
    formData.set("checklistItemId", "item_123");

    const response = await uploadPdfPOST(
      new Request("http://localhost:3000/api/documents/upload/pdf", {
        method: "POST",
        body: formData,
      }),
    );

    expect(mockAuthorizeApplicationRouteAccess).toHaveBeenCalledWith(
      "app_123",
      "access_application",
    );
    const resolved = expectDefinedResponse(response);
    expect(resolved.status).toBe(403);
    await expect(resolved.json()).resolves.toEqual({ error: "Shared auth denied" });
  });

  it("documents/upload/image returns the shared auth response for application access denial", async () => {
    const formData = new FormData();
    formData.set("file", new File(["hello"], "passport.png", { type: "image/png" }));
    formData.set("applicationId", "app_123");
    formData.set("checklistItemId", "item_123");

    const response = await uploadImagePOST(
      new Request("http://localhost:3000/api/documents/upload/image", {
        method: "POST",
        body: formData,
      }),
    );

    expect(mockAuthorizeApplicationRouteAccess).toHaveBeenCalledWith(
      "app_123",
      "access_application",
    );
    const resolved = expectDefinedResponse(response);
    expect(resolved.status).toBe(403);
    await expect(resolved.json()).resolves.toEqual({ error: "Shared auth denied" });
  });

  it("document-preview returns the shared auth response for document application access denial", async () => {
    mockGetDB.mockReturnValue({
      query: {
        uploadedDocumentTable: {
          findFirst: vi.fn().mockResolvedValue({
            id: "doc_123",
            applicationId: "app_123",
            fileKey: "file-key",
            fileName: "evidence.pdf",
            mimeType: "application/pdf",
          }),
        },
        visaApplicationTable: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const response = await documentPreviewGET(
      new Request("http://localhost:3000/api/document-preview/doc_123"),
      { params: Promise.resolve({ documentId: "doc_123" }) },
    );

    expect(mockAuthorizeApplicationRouteAccess).toHaveBeenCalledWith(
      "app_123",
      "access_application",
    );
    const resolved = expectDefinedResponse(response);
    expect(resolved.status).toBe(403);
    await expect(resolved.json()).resolves.toEqual({ error: "Shared auth denied" });
  });

  it("chat-with-pdf returns the shared auth response for application access denial", async () => {
    mockGetDB.mockReturnValue({
      query: {
        visaApplicationTable: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const formData = new FormData();
    formData.set("file", new File(["hello"], "brief.pdf", { type: "application/pdf" }));
    formData.set("applicationId", "app_123");
    formData.set("conversationId", "conversation_123");

    const response = await chatWithPdfPOST(
      new Request("http://localhost:3000/api/chat-with-pdf", {
        method: "POST",
        body: formData,
      }),
    );

    expect(mockAuthorizeApplicationRouteAccess).toHaveBeenCalledWith(
      "app_123",
      "access_application",
    );
    const resolved = expectDefinedResponse(response);
    expect(resolved.status).toBe(403);
    await expect(resolved.json()).resolves.toEqual({ error: "Shared auth denied" });
  });
});
