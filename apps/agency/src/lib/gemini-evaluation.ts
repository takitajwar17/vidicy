import "server-only";
import { withGeminiCapacity } from "@/infra/google/gemini-capacity";
import { ThinkingLevel, type Part } from "@google/genai";
import type OpenAI from "openai";
import { GEMINI_DOCUMENT_EVALUATION_MODEL, getGeminiClient } from "@/lib/gemini";
import { recordEvaluationCall } from "@/infra/evaluation-metrics";

// Structured document review can outlast a short chat request. Keep a bounded
// deadline for the model stage without changing interactive chat timeouts.
const EVALUATION_TIMEOUT_MS = 120_000;

interface GeminiEvaluationParams {
  systemPrompt: string;
  userContent: OpenAI.ChatCompletionUserMessageParam["content"];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  /** Controlled comparisons can override these. Application callers use the defaults. */
  model?: string;
  thinkingLevel?: ThinkingLevel;
}

function buildEvaluationParts(content: GeminiEvaluationParams["userContent"]): Part[] {
  if (typeof content === "string") return [{ text: content }];

  return content.map((part): Part => {
    if (part.type === "text") return { text: part.text };
    if (part.type !== "image_url") {
      throw new Error(`Unsupported evaluation content type: ${part.type}`);
    }

    // The document pipeline supplies inline image data, not public file URLs.
    // Reject unsupported input rather than silently evaluating without the image.
    const image = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(part.image_url.url);
    if (!image) throw new Error("Gemini evaluation requires an inline base64 image");
    return { inlineData: { mimeType: image[1], data: image[2].replace(/\s/g, "") } };
  });
}

/** Two bounded retries for transient rejections, within the original stage deadline. */
export async function createGeminiEvaluation(params: GeminiEvaluationParams): Promise<string> {
  const deadline = performance.now() + EVALUATION_TIMEOUT_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return await runEvaluationAttempt({
        ...params,
        timeoutMs: Math.max(1, Math.ceil(deadline - performance.now())),
      });
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? error.status : null;
      const delayMs = 2_000 * 2 ** attempt + Math.floor(Math.random() * 1_000);
      if (
        attempt >= 2 ||
        ![429, 500, 502, 503, 504].includes(status as number) ||
        deadline - performance.now() < delayMs + 15_000
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/** Record each attempt separately, without provider payloads or document content. */
async function runEvaluationAttempt({
  systemPrompt,
  userContent,
  schemaName,
  schema,
  maxTokens,
  timeoutMs,
  model = GEMINI_DOCUMENT_EVALUATION_MODEL,
  thinkingLevel = ThinkingLevel.MEDIUM,
}: GeminiEvaluationParams & { timeoutMs: number }): Promise<string> {
  const startedAt = performance.now();
  let status: "succeeded" | "failed" = "failed";
  let providerStatus: number | undefined;
  let usage:
    | {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        cachedContentTokenCount?: number;
        totalTokenCount?: number;
      }
    | undefined;
  try {
    const response = await withGeminiCapacity({
      timeoutMs,
      run: (remainingMs) =>
        getGeminiClient().models.generateContent({
          model,
          contents: [{ role: "user", parts: buildEvaluationParts(userContent) }],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            // Send JSON Schema directly: responseSchema's OpenAPI subset cannot
            // preserve the existing required, nullable and additionalProperties rules.
            responseJsonSchema: schema,
            // Gemini counts thinking in its output budget. Reserve room for thinking
            // in addition to the existing response budget used by the evaluation UI.
            maxOutputTokens: Math.min(maxTokens + 8_192, 32_768),
            thinkingConfig: { thinkingLevel },
            abortSignal: AbortSignal.timeout(remainingMs),
            // Keep retry ownership here so each failed attempt is measured and all
            // attempts share the same deadline.
            httpOptions: { timeout: remainingMs, retryOptions: { attempts: 1 } },
          },
        }),
    });

    usage = response.usageMetadata;
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      throw new Error(
        `Vertex AI ${model} did not complete ${schemaName}: ${candidate.finishReason}`,
      );
    }
    const text = response.text?.trim();
    if (!text) {
      throw new Error(`Vertex AI ${model} returned no ${schemaName}`);
    }
    // Callers apply stage-specific schemas before publishing a complete review.
    JSON.parse(text);
    status = "succeeded";
    return text;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number" &&
      Number.isInteger(error.status)
    )
      providerStatus = error.status;
    throw error;
  } finally {
    recordEvaluationCall({
      model,
      stage: schemaName,
      status,
      ...(providerStatus === undefined ? {} : { providerStatus }),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      inputTokens: usage?.promptTokenCount ?? null,
      outputTokens: usage?.candidatesTokenCount ?? null,
      thinkingTokens: usage?.thoughtsTokenCount ?? null,
      cachedInputTokens: usage?.cachedContentTokenCount ?? null,
      totalTokens: usage?.totalTokenCount ?? null,
    });
  }
}
