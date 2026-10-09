import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingLevel } from "@google/genai";
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@/lib/gemini", () => ({
  GEMINI_DOCUMENT_EVALUATION_MODEL: "gemini-evaluation-test",
  getGeminiClient: () => ({ models: { generateContent } }),
}));

vi.mock("zsa", () => {
  class ZSAError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    ZSAError,
    createServerAction: () => {
      const chain = {
        input: () => chain,
        handler: (fn: (args: { input: unknown }) => unknown) => (input: unknown) => fn({ input }),
      };

      return chain;
    },
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/infra/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  logAlert: vi.fn(),
}));

import { isModelParameterCompatibilityError } from "@/lib/openai";
import { createGeminiEvaluation } from "@/lib/gemini-evaluation";
import { logger } from "@/infra/logger";

const testSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
  },
  required: ["ok"],
  additionalProperties: false,
};

describe("isModelParameterCompatibilityError", () => {
  it("detects OpenAI model parameter compatibility errors", () => {
    expect(
      isModelParameterCompatibilityError({
        error: {
          status: 400,
          message:
            "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.",
        },
      }),
    ).toBe(true);
  });

  it("does not classify unrelated 400 errors as compatibility errors", () => {
    expect(
      isModelParameterCompatibilityError({
        error: {
          status: 400,
          message: "Invalid JSON schema: required property missing.",
        },
      }),
    ).toBe(false);
  });
});

describe("Vertex AI evaluation", () => {
  const input = {
    systemPrompt: "system",
    userContent: "user",
    schemaName: "evaluation_test",
    schema: testSchema,
    maxTokens: 300,
  };
  beforeEach(() => {
    vi.resetAllMocks();
    generateContent.mockResolvedValue({
      text: '{"ok":true}',
      candidates: [{ finishReason: "STOP" }],
    });
  });

  it("uses the configured Vertex model and preserves the JSON schema", async () => {
    await expect(createGeminiEvaluation(input)).resolves.toBe('{"ok":true}');
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent).toHaveBeenCalledWith({
      model: "gemini-evaluation-test",
      contents: [{ role: "user", parts: [{ text: "user" }] }],
      config: expect.objectContaining({
        systemInstruction: "system",
        responseMimeType: "application/json",
        responseJsonSchema: testSchema,
        maxOutputTokens: 8492,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        httpOptions: { timeout: 120_000 },
      }),
    });
    expect(generateContent.mock.calls[0][0].config).not.toHaveProperty("temperature");
  });

  it("sends inline document images along with text", async () => {
    await createGeminiEvaluation({
      ...input,
      userContent: [
        { type: "text", text: "Read this" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,YWJj" } },
      ],
    });
    expect(generateContent.mock.calls[0][0].contents[0].parts).toEqual([
      { text: "Read this" },
      { inlineData: { mimeType: "image/jpeg", data: "YWJj" } },
    ]);
  });

  it("does not reroute a provider error", async () => {
    const error = new Error("Provider unavailable");
    generateContent.mockRejectedValue(error);
    await expect(createGeminiEvaluation(input)).rejects.toBe(error);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("records model usage and duration without prompt or document content", async () => {
    generateContent.mockResolvedValue({
      text: '{"ok":true}',
      candidates: [{ finishReason: "STOP" }],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 20,
        thoughtsTokenCount: 5,
        cachedContentTokenCount: 10,
        totalTokenCount: 125,
      },
    });
    await createGeminiEvaluation(input);
    expect(logger.info).toHaveBeenCalledWith("AI evaluation call", {
      model: "gemini-evaluation-test",
      stage: "evaluation_test",
      status: "succeeded",
      durationMs: expect.any(Number),
      inputTokens: 100,
      outputTokens: 20,
      thinkingTokens: 5,
      cachedInputTokens: 10,
      totalTokens: 125,
    });
  });

  it("records failed calls without inventing usage or exposing the provider error", async () => {
    generateContent.mockRejectedValue(new Error("private provider detail"));
    await expect(createGeminiEvaluation(input)).rejects.toThrow("private provider detail");
    expect(logger.info).toHaveBeenCalledWith("AI evaluation call", {
      model: "gemini-evaluation-test",
      stage: "evaluation_test",
      status: "failed",
      durationMs: expect.any(Number),
      inputTokens: null,
      outputTokens: null,
      thinkingTokens: null,
      cachedInputTokens: null,
      totalTokens: null,
    });
  });

  it("records a numeric provider failure status without its private message", async () => {
    generateContent.mockRejectedValue(
      Object.assign(new Error("private request detail"), { status: 429 }),
    );
    await expect(createGeminiEvaluation(input)).rejects.toThrow();
    expect(logger.info).toHaveBeenCalledWith(
      "AI evaluation call",
      expect.objectContaining({ status: "failed", providerStatus: 429 }),
    );
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(
      "private request detail",
    );
  });

  it.each([
    { text: "", candidates: [{ finishReason: "STOP" }] },
    { text: '{"ok":true}', candidates: [{ finishReason: "MAX_TOKENS" }] },
    { text: "invalid json", candidates: [{ finishReason: "STOP" }] },
  ])("rejects an incomplete or invalid evaluation: %j", async (response) => {
    generateContent.mockResolvedValue(response);
    await expect(createGeminiEvaluation(input)).rejects.toThrow();
  });
});
