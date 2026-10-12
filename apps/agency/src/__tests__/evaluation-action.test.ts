import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingLevel } from "@google/genai";
vi.mock("@/infra/google/gemini-capacity", () => ({
  withGeminiCapacity: ({
    timeoutMs,
    run,
  }: {
    timeoutMs: number;
    run: (remainingMs: number) => unknown;
  }) => run(timeoutMs),
}));
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
        httpOptions: { timeout: expect.any(Number), retryOptions: { attempts: 1 } },
      }),
    });
    expect(generateContent.mock.calls[0][0].config).not.toHaveProperty("temperature");
    expect(generateContent.mock.calls[0][0].config.httpOptions.timeout).toBeGreaterThan(119_000);
    expect(generateContent.mock.calls[0][0].config.httpOptions.timeout).toBeLessThanOrEqual(
      120_000,
    );
  });

  it("uses explicit benchmark model and reasoning settings without changing production defaults", async () => {
    await createGeminiEvaluation({
      ...input,
      model: "gemini-3.8-flash",
      thinkingLevel: ThinkingLevel.LOW,
    });
    expect(generateContent.mock.calls[0][0]).toMatchObject({
      model: "gemini-3.8-flash",
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
    });
    expect(logger.info).toHaveBeenCalledWith(
      "AI evaluation call",
      expect.objectContaining({ model: "gemini-3.8-flash" }),
    );
    await createGeminiEvaluation(input);
    expect(generateContent.mock.calls[1][0]).toMatchObject({
      model: "gemini-evaluation-test",
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } },
    });
  });

  it.each([429, 500, 502, 503, 504])(
    "retries a transient provider status once and records both attempts: %s",
    async (status) => {
      vi.useFakeTimers();
      try {
        generateContent.mockRejectedValueOnce(
          Object.assign(new Error("private detail"), { status }),
        );
        const pending = createGeminiEvaluation(input);
        await vi.runAllTimersAsync();
        await expect(pending).resolves.toBe('{"ok":true}');
        expect(generateContent).toHaveBeenCalledTimes(2);
        const calls = vi
          .mocked(logger.info)
          .mock.calls.filter(([message]) => message === "AI evaluation call");
        expect(calls).toHaveLength(2);
        expect(calls[0][1]).toMatchObject({ status: "failed", providerStatus: status });
        expect(calls[1][1]).toMatchObject({ status: "succeeded" });
        expect(generateContent.mock.calls[1][0].config.httpOptions.timeout).toBeLessThan(120_000);
        expect(JSON.stringify(calls)).not.toContain("private detail");
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("stops after two retries when the provider remains unavailable", async () => {
    vi.useFakeTimers();
    try {
      generateContent.mockRejectedValue(Object.assign(new Error("Unavailable"), { status: 503 }));
      const outcome = createGeminiEvaluation(input).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.runAllTimersAsync();
      expect(await outcome).toMatchObject({ status: 503 });
      expect(generateContent).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("spaces transient retries with exponential backoff and shares the original deadline", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      generateContent
        .mockRejectedValueOnce(Object.assign(new Error("Busy"), { status: 429 }))
        .mockRejectedValueOnce(Object.assign(new Error("Busy"), { status: 503 }));
      const pending = createGeminiEvaluation(input);
      await vi.advanceTimersByTimeAsync(1_999);
      expect(generateContent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(generateContent).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(3_999);
      expect(generateContent).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toBe('{"ok":true}');
      expect(generateContent).toHaveBeenCalledTimes(3);
      const timeouts = generateContent.mock.calls.map(
        ([request]) => request.config.httpOptions.timeout,
      );
      expect(timeouts).toEqual([120_000, 118_000, 114_000]);
      expect(
        vi.mocked(logger.info).mock.calls.filter(([message]) => message === "AI evaluation call"),
      ).toHaveLength(3);
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does not start a short retry after a late provider timeout", async () => {
    vi.useFakeTimers();
    try {
      generateContent.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 116_000));
        throw Object.assign(new Error("Deadline exceeded"), { status: 504 });
      });
      const outcome = createGeminiEvaluation(input).catch((error: unknown) => error);
      await vi.runAllTimersAsync();
      expect(await outcome).toMatchObject({ status: 504 });
      expect(generateContent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([400, 401, 403])(
    "does not retry a permanent error or a timed-out attempt: %s",
    async (status) => {
      generateContent.mockRejectedValue(Object.assign(new Error("Failed"), { status }));
      await expect(createGeminiEvaluation(input)).rejects.toMatchObject({ status });
      expect(generateContent).toHaveBeenCalledTimes(1);
    },
  );

  it("does not start a retry after the shared stage deadline is nearly exhausted", async () => {
    vi.useFakeTimers();
    try {
      generateContent.mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 119_500));
        throw Object.assign(new Error("Unavailable"), { status: 503 });
      });
      const outcome = createGeminiEvaluation(input).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.runAllTimersAsync();
      expect(await outcome).toMatchObject({ status: 503 });
      expect(generateContent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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
    vi.useFakeTimers();
    try {
      generateContent.mockRejectedValue(
        Object.assign(new Error("private request detail"), { status: 429 }),
      );
      const outcome = createGeminiEvaluation(input).then(
        () => null,
        (error: unknown) => error,
      );
      await vi.runAllTimersAsync();
      expect(await outcome).toMatchObject({ status: 429 });
      expect(logger.info).toHaveBeenCalledWith(
        "AI evaluation call",
        expect.objectContaining({ status: "failed", providerStatus: 429 }),
      );
      expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(
        "private request detail",
      );
    } finally {
      vi.useRealTimers();
    }
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
