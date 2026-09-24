import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthorizeApplicationRouteAccess,
  mockRequireRouteSession,
  mockGetCloudflareContext,
  mockGetDB,
  mockUploadToR2,
  mockBuildR2Key,
  mockTrackUsage,
  mockRecordMarketingEvent,
  mockQueueDocumentExtraction,
  mockGetPdfPageCount,
  mockLoggerError,
  mockLogAlert,
} = vi.hoisted(() => ({
  mockAuthorizeApplicationRouteAccess: vi.fn(),
  mockRequireRouteSession: vi.fn(),
  mockGetCloudflareContext: vi.fn(),
  mockGetDB: vi.fn(),
  mockUploadToR2: vi.fn(),
  mockBuildR2Key: vi.fn(),
  mockTrackUsage: vi.fn(),
  mockRecordMarketingEvent: vi.fn(),
  mockQueueDocumentExtraction: vi.fn(),
  mockGetPdfPageCount: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLogAlert: vi.fn(),
}));

vi.mock("@/app/api/_utils/request-auth", () => ({
  requireRouteSession: mockRequireRouteSession,
}));

vi.mock("@/app/api/_utils/application-route-auth", () => ({
  authorizeApplicationRouteAccess: mockAuthorizeApplicationRouteAccess,
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: mockGetCloudflareContext,
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("@/lib/r2", () => ({
  uploadToR2: mockUploadToR2,
  buildR2Key: mockBuildR2Key,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
}));

vi.mock("@/infra/usage-tracking", () => ({
  trackUsage: mockTrackUsage,
  USAGE_EVENTS: {
    DOCUMENT_UPLOADED: "document_uploaded",
  },
}));

vi.mock("@/server/marketing/events", () => ({
  recordMarketingEvent: mockRecordMarketingEvent,
}));

vi.mock("@/services/document-pipeline", () => ({
  queueDocumentExtraction: mockQueueDocumentExtraction,
}));

vi.mock("@/services/pdf-parser", () => ({
  getPdfPageCount: mockGetPdfPageCount,
  MAX_PDF_PAGE_COUNT: 40,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: mockLoggerError,
  },
  logAlert: mockLogAlert,
}));

import { POST as uploadPdfPOST } from "@/app/api/documents/upload/pdf/route";
import { POST as uploadImagePOST } from "@/app/api/documents/upload/image/route";

function createUploadDbMock({
  insertedDocumentId = "doc_123",
}: {
  insertedDocumentId?: string;
} = {}) {
  const insertValuesCalls: Array<Record<string, unknown>> = [];
  const checklistStatusUpdates: Array<Record<string, unknown>> = [];

  const returning = vi.fn(async () => [
    {
      id: insertedDocumentId,
      fileName: "uploaded-file",
      fileSize: 2048,
    },
  ]);
  const values = vi.fn((payload: Record<string, unknown>) => {
    insertValuesCalls.push(payload);
    return { returning };
  });
  const insert = vi.fn(() => ({ values }));

  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn((payload: Record<string, unknown>) => {
    checklistStatusUpdates.push(payload);
    return { where: updateWhere };
  });
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    db: {
      query: {
        applicantTable: {
          findFirst: vi.fn(async () => ({ id: "applicant_123" })),
        },
        checklistItemTable: {
          findFirst: vi.fn(async () => ({ id: "item_123", applicantId: "applicant_123" })),
        },
      },
      insert,
      update,
    },
    insertValuesCalls,
    checklistStatusUpdates,
  };
}

describe("document upload routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireRouteSession.mockResolvedValue({
      session: {
        user: {
          id: "user_123",
        },
      },
    });
    mockAuthorizeApplicationRouteAccess.mockResolvedValue({
      session: {
        user: {
          id: "user_123",
        },
      },
    });
    mockGetCloudflareContext.mockResolvedValue({
      env: {
        R2: {},
      },
      ctx: {
        waitUntil: vi.fn(),
      },
    });
    mockUploadToR2.mockResolvedValue(undefined);
    mockBuildR2Key.mockReturnValue("file-key");
    mockRecordMarketingEvent.mockResolvedValue(undefined);
    mockQueueDocumentExtraction.mockResolvedValue(undefined);
    mockGetPdfPageCount.mockResolvedValue(2);
  });

  it("rejects non-PDF files on the dedicated PDF upload route", async () => {
    const response = await uploadPdfPOST(
      new Request("http://localhost:3000/api/documents/upload/pdf", {
        method: "POST",
        body: (() => {
          const formData = new FormData();
          formData.set("file", new File(["hello"], "passport.png", { type: "image/png" }));
          formData.set("applicationId", "app_123");
          formData.set("applicantId", "applicant_123");
          formData.set("checklistItemId", "item_123");
          return formData;
        })(),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported file type. Allowed type: PDF.",
    });
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
  });

  it("rejects non-image files on the dedicated image upload route", async () => {
    const response = await uploadImagePOST(
      new Request("http://localhost:3000/api/documents/upload/image", {
        method: "POST",
        body: (() => {
          const formData = new FormData();
          formData.set("file", new File(["hello"], "passport.pdf", { type: "application/pdf" }));
          formData.set("applicationId", "app_123");
          formData.set("applicantId", "applicant_123");
          formData.set("checklistItemId", "item_123");
          return formData;
        })(),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported file type. Allowed types: JPEG, PNG.",
    });
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
  });

  it("rejects PDFs above the supported page limit", async () => {
    const { db } = createUploadDbMock();
    mockGetDB.mockReturnValue(db);
    mockGetPdfPageCount.mockResolvedValue(41);

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "bundle.pdf", { type: "application/pdf" }));
    formData.set("applicationId", "app_123");
    formData.set("applicantId", "applicant_123");
    formData.set("checklistItemId", "item_123");

    const response = await uploadPdfPOST(
      new Request("http://localhost:3000/api/documents/upload/pdf", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain("40");
    expect(mockUploadToR2).not.toHaveBeenCalled();
    expect(mockQueueDocumentExtraction).not.toHaveBeenCalled();
  });

  it("returns success for PDF uploads before background extraction resolves", async () => {
    const { db, insertValuesCalls } = createUploadDbMock({ insertedDocumentId: "doc_pdf" });
    const waitUntil = vi.fn();
    mockGetDB.mockReturnValue(db);
    mockGetCloudflareContext.mockResolvedValue({
      env: { R2: {} },
      ctx: { waitUntil },
    });
    mockQueueDocumentExtraction.mockReturnValue(new Promise(() => undefined));

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "passport.pdf", { type: "application/pdf" }));
    formData.set("applicationId", "app_123");
    formData.set("applicantId", "applicant_123");
    formData.set("checklistItemId", "item_123");

    const response = await uploadPdfPOST(
      new Request("http://localhost:3000/api/documents/upload/pdf", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      documentId: "doc_pdf",
      fileName: "uploaded-file",
      fileSize: 2048,
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(mockQueueDocumentExtraction).toHaveBeenCalledWith({
      documentId: "doc_pdf",
    });
    expect(insertValuesCalls[0]).toMatchObject({
      mimeType: "application/pdf",
      extractionStatus: "queued",
      indexingStatus: "queued",
      pageCount: 2,
    });
  });

  it("returns success for image uploads before background extraction resolves", async () => {
    const { db, insertValuesCalls } = createUploadDbMock({ insertedDocumentId: "doc_img" });
    const waitUntil = vi.fn();
    mockGetDB.mockReturnValue(db);
    mockGetCloudflareContext.mockResolvedValue({
      env: { R2: {} },
      ctx: { waitUntil },
    });
    mockQueueDocumentExtraction.mockReturnValue(new Promise(() => undefined));

    const formData = new FormData();
    formData.set("file", new File([new Uint8Array([1, 2, 3])], "passport.png", { type: "image/png" }));
    formData.set("applicationId", "app_123");
    formData.set("applicantId", "applicant_123");
    formData.set("checklistItemId", "item_123");

    const response = await uploadImagePOST(
      new Request("http://localhost:3000/api/documents/upload/image", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      documentId: "doc_img",
      fileName: "uploaded-file",
      fileSize: 2048,
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(mockQueueDocumentExtraction).toHaveBeenCalledWith({
      documentId: "doc_img",
    });
    expect(insertValuesCalls[0]).toMatchObject({
      mimeType: "image/png",
      extractionStatus: "queued",
      indexingStatus: "queued",
      pageCount: 1,
    });
  });
});
