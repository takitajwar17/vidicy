import "server-only";
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

/** Runs every evaluation phase on Vertex AI; provider errors are not rerouted. */
export async function createGeminiEvaluation({
  systemPrompt,
  userContent,
  schemaName,
  schema,
  maxTokens,
}: GeminiEvaluationParams): Promise<string> {
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
    const response = await getGeminiClient().models.generateContent({
      model: GEMINI_DOCUMENT_EVALUATION_MODEL,
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
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        abortSignal: AbortSignal.timeout(EVALUATION_TIMEOUT_MS),
        httpOptions: { timeout: EVALUATION_TIMEOUT_MS },
      },
    });

    usage = response.usageMetadata;
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      throw new Error(
        `Vertex AI ${GEMINI_DOCUMENT_EVALUATION_MODEL} did not complete ${schemaName}: ${candidate.finishReason}`,
      );
    }
    const text = response.text?.trim();
    if (!text) {
      throw new Error(`Vertex AI ${GEMINI_DOCUMENT_EVALUATION_MODEL} returned no ${schemaName}`);
    }
    // Existing callers retain their Zod validation and graceful phase aggregation.
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
      model: GEMINI_DOCUMENT_EVALUATION_MODEL,
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
