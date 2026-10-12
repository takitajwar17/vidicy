import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthorizeApplicationRouteAccess,
  mockRequireRouteSession,
  mockGetRuntimeContext,
  mockGetDB,
  mockUploadToR2,
  mockBuildR2Key,
  mockTrackUsage,
  mockRecordMarketingEvent,
  mockEnqueueDocumentExtraction,
  mockGetPdfPageCount,
  mockLoggerError,
  mockLogAlert,
} = vi.hoisted(() => ({
  mockAuthorizeApplicationRouteAccess: vi.fn(),
  mockRequireRouteSession: vi.fn(),
  mockGetRuntimeContext: vi.fn(),
  mockGetDB: vi.fn(),
  mockUploadToR2: vi.fn(),
  mockBuildR2Key: vi.fn(),
  mockTrackUsage: vi.fn(),
  mockRecordMarketingEvent: vi.fn(),
  mockEnqueueDocumentExtraction: vi.fn(),
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

vi.mock("@/infra/runtime-context", () => ({
  getRuntimeContext: mockGetRuntimeContext,
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

vi.mock("@/infra/google/document-tasks", () => ({
  enqueueDocumentExtraction: mockEnqueueDocumentExtraction,
}));

vi.mock("@/services/document-pipeline", () => ({
  queueDocumentExtraction: vi.fn(),
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

  const db = {
    query: {
      visaApplicationTable: {
        findFirst: vi.fn(async () => ({ id: "app_123", finalSubmissionAt: null, trashedAt: null })),
      },
      applicantTable: {
        findFirst: vi.fn(async () => ({ id: "applicant_123" })),
      },
      checklistItemTable: {
        findFirst: vi.fn(async () => ({ id: "item_123", applicantId: "applicant_123" })),
      },
    },
    insert,
    update,
    batch: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    execute: vi.fn(async () => ({ rows: [{ id: "app_123" }] })),
    withTransaction: vi.fn(async (operation: () => Promise<unknown>) => operation()),
  };
  return {
    db,
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
    mockGetRuntimeContext.mockResolvedValue({
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
    mockEnqueueDocumentExtraction.mockResolvedValue(undefined);
    mockGetPdfPageCount.mockResolvedValue(2);
  });

  it.each([
    ["application/json", "{}"],
    ["multipart/form-data", "missing boundary"],
    [
      "multipart/form-data; boundary=expected",
      '--expected\r\nContent-Disposition: form-data; name="message"\r\n\r\ntruncated',
    ],
  ])("returns 400 for malformed form input: %s", async (contentType, body) => {
    const response = await uploadPdfPOST(
      new Request("https://example.com/upload", {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      }),
    );
    expect(response?.status).toBe(400);
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
  });

  it("bounds a chunked upload body before parsing ignored fields", async () => {
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull: (() => {
        let chunks = 0;
        return (controller: ReadableStreamDefaultController<Uint8Array>) => {
          if (++chunks <= 13) controller.enqueue(new Uint8Array(1024 * 1024));
          else controller.close();
        };
      })(),
      cancel: cancelled,
    });
    const response = await uploadPdfPOST(
      new Request("https://example.com/upload", {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data; boundary=upload" },
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: string }),
    );
    expect(response?.status).toBe(413);
    expect(cancelled).toHaveBeenCalled();
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
  });

  it.each(["applicationId", "applicantId", "checklistItemId"])(
    "rejects a File in the %s text field",
    async (field) => {
      const form = new FormData();
      form.set("file", new File(["pdf"], "passport.pdf", { type: "application/pdf" }));
      form.set("applicationId", "app_123");
      form.set("applicantId", "applicant_123");
      form.set("checklistItemId", "item_123");
      form.set(field, new File(["invalid"], "field.txt"));
      const response = await uploadPdfPOST(
        new Request("https://example.com/api/documents/upload/pdf", { method: "POST", body: form }),
      );
      expect(response.status).toBe(400);
      expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
      expect(mockUploadToR2).not.toHaveBeenCalled();
    },
  );

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
    formData.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "bundle.pdf", { type: "application/pdf" }),
    );
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
    expect(mockEnqueueDocumentExtraction).not.toHaveBeenCalled();
  });

  it("acknowledges a PDF upload after durable extraction work is accepted", async () => {
    const { db, insertValuesCalls } = createUploadDbMock({ insertedDocumentId: "doc_pdf" });
    const waitUntil = vi.fn();
    mockGetDB.mockReturnValue(db);
    mockGetRuntimeContext.mockResolvedValue({
      env: { R2: {} },
      ctx: { waitUntil },
    });
    mockEnqueueDocumentExtraction.mockResolvedValue({ taskName: "task_1", deduplicated: false });

    const formData = new FormData();
    formData.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "passport.pdf", { type: "application/pdf" }),
    );
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
    expect(mockEnqueueDocumentExtraction).toHaveBeenCalledWith({
      documentId: "doc_pdf",
    });
    expect(insertValuesCalls[0]).toMatchObject({
      mimeType: "application/pdf",
      extractionStatus: "queued",
      indexingStatus: "queued",
      pageCount: 2,
    });
  });

  it("acknowledges an image upload after durable extraction work is accepted", async () => {
    const { db, insertValuesCalls } = createUploadDbMock({ insertedDocumentId: "doc_img" });
    const waitUntil = vi.fn();
    mockGetDB.mockReturnValue(db);
    mockGetRuntimeContext.mockResolvedValue({
      env: { R2: {} },
      ctx: { waitUntil },
    });
    mockEnqueueDocumentExtraction.mockResolvedValue({ taskName: "task_1", deduplicated: false });

    const formData = new FormData();
    formData.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "passport.png", { type: "image/png" }),
    );
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
    expect(mockEnqueueDocumentExtraction).toHaveBeenCalledWith({
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

describe("upload workflow consistency", () => {
  it.each(["removed", "submitted"])(
    "rejects a case change during storage upload: %s",
    async (change) => {
      const { db } = createUploadDbMock();
      const deleteBlob = vi.fn().mockResolvedValue(undefined);
      mockGetDB.mockReturnValue(db);
      mockRequireRouteSession.mockResolvedValue({ session: { user: { id: "user_123" } } });
      mockAuthorizeApplicationRouteAccess.mockResolvedValue({
        session: { user: { id: "user_123" } },
      });
      mockGetRuntimeContext.mockResolvedValue({
        env: { R2: { delete: deleteBlob } },
        ctx: { waitUntil: vi.fn() },
      });
      mockUploadToR2.mockImplementationOnce(async () => {
        if (change === "removed")
          db.query.checklistItemTable.findFirst.mockResolvedValueOnce(null as never);
        else
          db.query.visaApplicationTable.findFirst.mockResolvedValueOnce({
            id: "app_123",
            finalSubmissionAt: new Date(),
            trashedAt: null,
          } as never);
      });
      mockEnqueueDocumentExtraction.mockClear();
      const form = new FormData();
      form.set("file", new File(["image"], "passport.png", { type: "image/png" }));
      form.set("applicationId", "app_123");
      form.set("checklistItemId", "item_123");
      const response = await uploadImagePOST(
        new Request("http://localhost/api/documents/upload/image", { method: "POST", body: form }),
      );
      expect(response.status).toBe(409);
      expect(db.insert).not.toHaveBeenCalled();
      expect(mockEnqueueDocumentExtraction).not.toHaveBeenCalled();
      expect(deleteBlob).toHaveBeenCalledWith("file-key");
    },
  );

  it("saves the selected document type and resets readiness in one transaction", async () => {
    const { db, insertValuesCalls, checklistStatusUpdates } = createUploadDbMock();
    mockGetDB.mockReturnValue(db);
    mockRequireRouteSession.mockResolvedValue({ session: { user: { id: "user_123" } } });
    mockAuthorizeApplicationRouteAccess.mockResolvedValue({
      session: { user: { id: "user_123" } },
    });
    mockGetRuntimeContext.mockResolvedValue({ env: { R2: {} }, ctx: { waitUntil: vi.fn() } });
    mockEnqueueDocumentExtraction.mockResolvedValue(undefined);
    mockRecordMarketingEvent.mockRejectedValueOnce(new Error("analytics unavailable"));
    const formData = new FormData();
    formData.set("file", new File(["image"], "bank.png", { type: "image/png" }));
    formData.set("applicationId", "app_123");
    formData.set("checklistItemId", "bank_statement_item");
    const response = await uploadImagePOST(
      new Request("http://localhost:3002/api/documents/upload/image", {
        method: "POST",
        body: formData,
      }),
    );
    expect(response.status).toBe(200);
    expect(db.withTransaction).toHaveBeenCalledTimes(1);
    expect(insertValuesCalls[0].checklistItemId).toBe("bank_statement_item");
    expect(checklistStatusUpdates).toContainEqual(
      expect.objectContaining({
        status: "in_progress",
        agencyStatus: "in_review",
        readinessScore: null,
        riskLevel: null,
        reviewCompletedAt: null,
      }),
    );
    expect(mockEnqueueDocumentExtraction).toHaveBeenCalled();
  });
});
