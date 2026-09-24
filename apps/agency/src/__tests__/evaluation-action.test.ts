import { beforeEach, describe, expect, it, vi } from "vitest";
import type OpenAI from "openai";

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
        handler: (fn: (args: { input: unknown }) => unknown) => (input: unknown) =>
          fn({ input }),
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
import { createEvaluationCompletionWithFallback } from "@/actions/evaluation.action";

function createMockOpenAI() {
  const create = vi.fn();
  const openai = {
    chat: {
      completions: {
        create,
      },
    },
  } as unknown as OpenAI;

  return {
    create,
    openai,
  };
}

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

describe("createEvaluationCompletionWithFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("omits temperature from the GPT-5.4 primary request", async () => {
    const { create, openai } = createMockOpenAI();
    create.mockResolvedValueOnce({
      choices: [{ message: { content: "{\"ok\":true}" } }],
    });

    await createEvaluationCompletionWithFallback({
      openai,
      systemPrompt: "system",
      userContent: "user",
      schemaName: "evaluation_test",
      schema: testSchema,
      maxTokens: 300,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      model: "gpt-5.4",
      reasoning_effort: "medium",
      max_completion_tokens: 300,
      response_format: {
        type: "json_schema",
      },
    });
    expect(create.mock.calls[0][0]).not.toHaveProperty("temperature");
  });

  it("falls back to GPT-4o when GPT-5.4 returns a parameter compatibility 400", async () => {
    const { create, openai } = createMockOpenAI();
    create
      .mockRejectedValueOnce({
        status: 400,
        message:
          "Unsupported value: 'temperature' does not support 0 with this model. Only the default (1) value is supported.",
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "{\"ok\":true}" } }],
      });

    await createEvaluationCompletionWithFallback({
      openai,
      systemPrompt: "system",
      userContent: "user",
      schemaName: "evaluation_test",
      schema: testSchema,
      maxTokens: 300,
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1][0]).toMatchObject({
      model: "gpt-4o",
      temperature: 0,
      max_tokens: 300,
      response_format: {
        type: "json_schema",
      },
    });
  });

  it("does not fall back for unrelated 400 errors", async () => {
    const { create, openai } = createMockOpenAI();
    const schemaError = {
      status: 400,
      message: "Invalid JSON schema: required property missing.",
    };
    create.mockRejectedValueOnce(schemaError);

    await expect(
      createEvaluationCompletionWithFallback({
        openai,
        systemPrompt: "system",
        userContent: "user",
        schemaName: "evaluation_test",
        schema: testSchema,
        maxTokens: 300,
      }),
    ).rejects.toBe(schemaError);

    expect(create).toHaveBeenCalledTimes(1);
  });
});
