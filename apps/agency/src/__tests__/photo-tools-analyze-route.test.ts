import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeFile = "src/app/api/tools/photo-requirements/analyze/route.ts";

const {
  mockGetCloudflareContext,
  mockGetOpenAIClient,
  mockGetPerplexityClient,
  mockRequireRouteSession,
  mockWithRateLimit,
  mockCheckActionRateLimit,
  mockLoggerError,
  mockLoggerWarn,
  mockLoggerInfo,
  mockResponsesCreate,
  mockChatCompletionsCreate,
} = vi.hoisted(() => ({
  mockGetCloudflareContext: vi.fn(),
  mockGetOpenAIClient: vi.fn(),
  mockGetPerplexityClient: vi.fn(),
  mockRequireRouteSession: vi.fn(),
  mockWithRateLimit: vi.fn(),
  mockCheckActionRateLimit: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockResponsesCreate: vi.fn(),
  mockChatCompletionsCreate: vi.fn(),
}));

let shouldRateLimit = false;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: mockGetCloudflareContext,
}));

vi.mock("@/lib/openai", () => ({
  getOpenAIClient: mockGetOpenAIClient,
  getPerplexityClient: mockGetPerplexityClient,
}));

vi.mock("@/app/api/_utils/request-auth", () => ({
  requireRouteSession: mockRequireRouteSession,
}));

vi.mock("@/infra/with-rate-limit", () => ({
  withRateLimit: mockWithRateLimit,
  RATE_LIMITS: {
    PHOTO_TOOL_ANALYZE: {
      identifier: "photo-tool-analyze",
      limit: 12,
      windowInSeconds: 3600,
    },
  },
}));

vi.mock("@/infra/action-rate-limit", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: mockLoggerWarn,
    info: mockLoggerInfo,
  },
  logAlert: vi.fn(),
}));

vi.mock("@/server/marketing/photo-tools-refresh", () => ({
  PHOTO_TOOL_REFRESH_SLUGS: [
    "us-visa-photo-requirements",
    "schengen-visa-photo-requirements",
  ],
}));

function buildAiPayload() {
  return {
    overallStatus: "warn",
    summary: "The photo passes the basic technical checks but needs a couple of fixes.",
    technicalChecks: [
      { label: "File type", passed: true, details: "JPEG is acceptable." },
      { label: "Dimensions", passed: false, details: "The crop is slightly off." },
    ],
    visualChecks: [
      { label: "Background", passed: true, details: "The background looks even." },
    ],
    topFixes: [
      { title: "Re-shoot against a cleaner background", detail: "Remove any visible shadows." },
      "Keep the face centered in frame.",
    ],
    gatedFullReport: {
      locked: true,
      preview: "Unlock the exact fix order and deeper review.",
      unlockHref: "/sign-up?redirect=/dashboard",
      unlockLabel: "Unlock Full Report",
    },
  };
}

function buildAiResponse() {
  const payload = buildAiPayload();
  const content = JSON.stringify(payload);

  return {
    output_text: content,
    output: [
      {
        content: [{ type: "output_text", text: content }],
      },
    ],
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

function buildFormData({
  slug,
  includeFile = true,
  fileType = "image/jpeg",
}: {
  slug: string;
  includeFile?: boolean;
  fileType?: string;
}) {
  const formData = new FormData();
  formData.set("slug", slug);

  if (includeFile) {
    formData.set(
      "file",
      new File([new Uint8Array([1, 2, 3, 4])], "photo.jpg", { type: fileType }),
    );
  }

  return formData;
}

async function importRoute() {
  const absolutePath = resolve(process.cwd(), routeFile);
  expect(existsSync(absolutePath)).toBe(true);

  return import(/* @vite-ignore */ pathToFileURL(absolutePath).href);
}

describe("POST /api/tools/photo-requirements/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldRateLimit = false;

    mockGetCloudflareContext.mockResolvedValue({ env: { APP_KV: undefined }, ctx: {} });
    mockRequireRouteSession.mockResolvedValue({
      session: {
        user: {
          id: "user_123",
        },
      },
    });

    mockResponsesCreate.mockResolvedValue(buildAiResponse());
    mockChatCompletionsCreate.mockResolvedValue(buildAiResponse());

    mockGetOpenAIClient.mockReturnValue({
      responses: {
        create: mockResponsesCreate,
      },
      chat: {
        completions: {
          create: mockChatCompletionsCreate,
        },
      },
    });

    mockGetPerplexityClient.mockReturnValue({
      responses: {
        create: vi.fn(),
      },
    });

    mockWithRateLimit.mockImplementation(async (action: () => Promise<unknown>) => {
      if (shouldRateLimit) {
        return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
      }

      return action();
    });

    mockCheckActionRateLimit.mockImplementation(async () => {
      if (shouldRateLimit) {
        throw new Error("Rate limit exceeded.");
      }
    });
  });

  it("rejects an invalid slug before trying to analyze the file", async () => {
    const { POST } = (await importRoute()) as {
      POST: (request: Request) => Promise<Response>;
    };

    const response = await POST(
      new Request("http://localhost:3000/api/tools/photo-requirements/analyze", {
        method: "POST",
        body: buildFormData({ slug: "invalid-slug" }),
      }),
    );

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toEqual(expect.any(String));
    expect(body.error?.toLowerCase()).toContain("unsupported");
    expect(mockResponsesCreate).not.toHaveBeenCalled();
    expect(mockChatCompletionsCreate).not.toHaveBeenCalled();
  });

  it("rejects a missing file before trying to analyze the request", async () => {
    const { POST } = (await importRoute()) as {
      POST: (request: Request) => Promise<Response>;
    };

    const response = await POST(
      new Request("http://localhost:3000/api/tools/photo-requirements/analyze", {
        method: "POST",
        body: buildFormData({ slug: "us-visa-photo-requirements", includeFile: false }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toEqual(expect.any(String));
    expect(body.error?.toLowerCase()).toContain("file");
    expect(mockResponsesCreate).not.toHaveBeenCalled();
    expect(mockChatCompletionsCreate).not.toHaveBeenCalled();
  });

  it("returns a normalized success payload", async () => {
    const { POST } = (await importRoute()) as {
      POST: (request: Request) => Promise<Response>;
    };

    const response = await POST(
      new Request("http://localhost:3000/api/tools/photo-requirements/analyze", {
        method: "POST",
        body: buildFormData({ slug: "us-visa-photo-requirements" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toEqual(
      expect.objectContaining({
        slug: "us-visa-photo-requirements",
        toolTitle: "US Visa Photo Requirements Checker",
        overallStatus: expect.any(String),
        technicalChecks: expect.any(Array),
        visualChecks: expect.any(Array),
        topFixes: expect.any(Array),
        gatedFullReport: expect.any(Object),
        analysisSource: "openai",
      }),
    );
    expect(Array.isArray(body.technicalChecks)).toBe(true);
    expect(Array.isArray(body.visualChecks)).toBe(true);
    expect(Array.isArray(body.topFixes)).toBe(true);
    expect((body.gatedFullReport as { state?: string } | undefined)?.state).toBe("locked");
    expect(mockResponsesCreate.mock.calls.length + mockChatCompletionsCreate.mock.calls.length).toBeGreaterThan(0);
  });

  it("falls back to the deterministic result when the AI call fails", async () => {
    mockResponsesCreate.mockRejectedValueOnce(new Error("OpenAI unavailable"));
    mockChatCompletionsCreate.mockRejectedValueOnce(new Error("OpenAI unavailable"));

    const { POST } = (await importRoute()) as {
      POST: (request: Request) => Promise<Response>;
    };

    const response = await POST(
      new Request("http://localhost:3000/api/tools/photo-requirements/analyze", {
        method: "POST",
        body: buildFormData({ slug: "schengen-visa-photo-requirements" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body).toEqual(
      expect.objectContaining({
        slug: "schengen-visa-photo-requirements",
        toolTitle: "Schengen Visa Photo Requirements Checker",
        overallStatus: expect.any(String),
        technicalChecks: expect.any(Array),
        visualChecks: expect.any(Array),
        topFixes: expect.any(Array),
        analysisSource: "fallback",
      }),
    );
    expect(body).not.toHaveProperty("error");
    expect(body.overallStatus).toBe("fail");
    expect(mockResponsesCreate.mock.calls.length + mockChatCompletionsCreate.mock.calls.length).toBeGreaterThan(0);
  });

  it("returns 429 when the rate limit gate trips", async () => {
    shouldRateLimit = true;

    const { POST } = (await importRoute()) as {
      POST: (request: Request) => Promise<Response>;
    };

    const response = await POST(
      new Request("http://localhost:3000/api/tools/photo-requirements/analyze", {
        method: "POST",
        body: buildFormData({ slug: "us-visa-photo-requirements" }),
      }),
    );

    expect(response.status).toBe(429);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toEqual(expect.any(String));
    expect(body.error?.toLowerCase()).toContain("rate");
    expect(mockResponsesCreate).not.toHaveBeenCalled();
    expect(mockChatCompletionsCreate).not.toHaveBeenCalled();
  });
});
