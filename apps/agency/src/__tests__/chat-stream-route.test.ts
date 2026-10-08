import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireRouteSession,
  mockAuthorizeApplicationRouteAccess,
  mockCheckActionRateLimit,
  mockTrackUsage,
  mockGetDB,
  mockGetRuntimeContext,
  mockGetOpenAIClient,
  mockBuildAtlasSystemPrompt,
  mockLoggerError,
  mockLoggerWarn,
  mockLogAlert,
} = vi.hoisted(() => ({
  mockRequireRouteSession: vi.fn(),
  mockAuthorizeApplicationRouteAccess: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockTrackUsage: vi.fn(),
  mockGetDB: vi.fn(),
  mockGetRuntimeContext: vi.fn(),
  mockGetOpenAIClient: vi.fn(),
  mockBuildAtlasSystemPrompt: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLogAlert: vi.fn(),
}));

vi.mock("@/app/api/_utils/request-auth", () => ({
  requireRouteSession: mockRequireRouteSession,
}));

vi.mock("@/app/api/_utils/application-route-auth", () => ({
  authorizeApplicationRouteAccess: mockAuthorizeApplicationRouteAccess,
}));

vi.mock("@/infra/action-rate-limit", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
}));

vi.mock("@/infra/usage-tracking", () => ({
  trackUsage: mockTrackUsage,
  USAGE_EVENTS: {
    CHAT_MESSAGE_SENT: "chat-msg",
  },
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
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
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: vi.fn(),
  },
  logAlert: mockLogAlert,
}));

import { POST as chatStreamPOST } from "@/app/api/chat-stream/route";

function createTransientD1Error() {
  const cause = new Error("D1 DB storage operation exceeded timeout which caused object to be reset.");
  const error = new Error(
    'Failed query: insert into "chat_message" ("id", "applicationId", "conversationId", "role", "content", "thumbnailDataUrl", "createdAt") values (?, ?, ?, ?, ?, null, ?) returning "id", "applicationId", "conversationId", "role", "content", "thumbnailDataUrl", "createdAt"',
  ) as Error & { cause?: unknown };
  error.cause = cause;
  return error;
}

function createMockDb({ failUserInsertTimes = 0 }: { failUserInsertTimes?: number } = {}) {
  let remainingUserInsertFailures = failUserInsertTimes;
  const insertPayloads: Array<Record<string, unknown>> = [];

  const db = {
    query: {
      visaApplicationTable: {
        findFirst: vi.fn().mockResolvedValue({
          id: "app_123",
          destinationCountry: "Canada",
          visaType: "Study Permit",
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
      uploadedDocumentTable: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      applicantTable: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn((payload: Record<string, unknown>) => {
        insertPayloads.push(payload);

        return {
          returning: vi.fn(async () => {
            if (payload.role === "user" && remainingUserInsertFailures > 0) {
              remainingUserInsertFailures -= 1;
              throw createTransientD1Error();
            }

            return [
              {
                id: `${String(payload.role)}-message`,
                thumbnailDataUrl: null,
                createdAt: new Date("2026-10-08T07:32:55.287Z"),
                ...payload,
              },
            ];
          }),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
  };

  return { db, insertPayloads };
}

describe("/api/chat-stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireRouteSession.mockResolvedValue({
      session: { userId: "user_123" },
    });
    mockAuthorizeApplicationRouteAccess.mockResolvedValue({
      session: { userId: "user_123" },
    });
    mockCheckActionRateLimit.mockResolvedValue(undefined);
    mockGetRuntimeContext.mockReturnValue({ env: {} });
    mockBuildAtlasSystemPrompt.mockReturnValue("system prompt");
    mockGetOpenAIClient.mockReturnValue({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            async *[Symbol.asyncIterator]() {
              yield {
                choices: [{ delta: { content: "Atlas answer" } }],
              };
            },
          })),
        },
      },
    });
  });

  it("bounds a JSON stream without a Content-Length header", async () => {
    const cancelled = vi.fn();
    const response = await chatStreamPOST(new Request("https://example.com/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        pull: (() => { let chunks = 0; return (controller: ReadableStreamDefaultController<Uint8Array>) => {
          if (++chunks <= 4) controller.enqueue(new Uint8Array(128 * 1024));
          else controller.close();
        }; })(), cancel: cancelled,
      }), duplex: "half",
    } as RequestInit & { duplex: string }));
    expect(response?.status).toBe(413);
    expect(cancelled).toHaveBeenCalled();
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
  });

  it.each([
    { applicationId: 123, conversationId: "conv_123", message: "Hello" },
    { applicationId: "app_123", conversationId: {}, message: "Hello" },
    { applicationId: "app_123", conversationId: "conv_123", message: {} },
    { applicationId: "app_123", conversationId: "conv_123", message: "x".repeat(16_001) },
  ])("rejects invalid chat fields before application access", async body => {
    const response = await chatStreamPOST(new Request("https://example.com/api/chat-stream", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    expect(response?.status).toBe(400);
    expect(mockAuthorizeApplicationRouteAccess).not.toHaveBeenCalled();
    expect(mockGetDB).not.toHaveBeenCalled();
  });

  it("retries a transient D1 reset when saving the user message", async () => {
    const { db, insertPayloads } = createMockDb({ failUserInsertTimes: 1 });
    mockGetDB.mockReturnValue(db);

    const response = await chatStreamPOST(
      new Request("http://localhost:3000/api/chat-stream", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          applicationId: "app_123",
          conversationId: "conv_123",
          message: "What are the problems in my application?",
        }),
      }),
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error("Expected /api/chat-stream to return a Response");
    }
    expect(response.status).toBe(200);

    const body = await response.text();

    expect(body).toContain('"type":"done"');
    expect(insertPayloads.filter((payload) => payload.role === "user")).toHaveLength(2);
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});
