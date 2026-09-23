import { getCloudflareContext } from "@opennextjs/cloudflare"
import OpenAI from "openai"
import { PERPLEXITY_API_BASE_URL } from "@/constants"

function resolveApiKey(cfEnvKey: string, processEnvKey: string): string | undefined {
  let apiKey: string | undefined
  try {
    const { env } = getCloudflareContext()
    apiKey = (env as unknown as Record<string, string | undefined>)[cfEnvKey]
  } catch {
    // Not running inside a Cloudflare Workers context (e.g. local Next.js dev)
  }
  return apiKey || process.env[processEnvKey]
}

export function getOpenAIClient(): OpenAI {
  const apiKey = resolveApiKey("OPENAI_API_KEY", "OPENAI_API_KEY")
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured")
  return new OpenAI({ apiKey })
}

export function getPerplexityClient(): OpenAI {
  const apiKey = resolveApiKey("PERPLEXITY_API_KEY", "PERPLEXITY_API_KEY")
  if (!apiKey) throw new Error("Perplexity API key not configured")
  return new OpenAI({ apiKey, baseURL: PERPLEXITY_API_BASE_URL })
}

function getErrorText(error: unknown): string {
  const err = (error ?? {}) as {
    name?: unknown
    message?: unknown
    code?: unknown
    type?: unknown
    error?: unknown
  }
  const apiError =
    err.error && typeof err.error === "object" ? (err.error as Record<string, unknown>) : undefined

  const parts = [
    typeof err.name === "string" ? err.name : "",
    typeof err.message === "string" ? err.message : "",
    typeof err.code === "string" ? err.code : "",
    typeof err.type === "string" ? err.type : "",
    typeof apiError?.message === "string" ? apiError.message : "",
    typeof apiError?.code === "string" ? apiError.code : "",
    typeof apiError?.type === "string" ? apiError.type : "",
  ]
  return parts.join(" ").toLowerCase()
}

function getErrorStatus(error: unknown): number | undefined {
  const err = (error ?? {}) as { status?: unknown }
  return typeof err.status === "number" ? err.status : undefined
}

export function isModelAvailabilityError({
  error,
  model,
}: {
  error: unknown
  model: string
}): boolean {
  const status = getErrorStatus(error)
  const statusLooksLikeModelProblem =
    status === undefined || status === 400 || status === 403 || status === 404
  if (!statusLooksLikeModelProblem) return false

  const combined = getErrorText(error)
  const modelLower = model.toLowerCase()
  const mentionsModel = combined.includes(modelLower) || combined.includes("model")
  if (!mentionsModel) return false

  const hints = [
    "model_not_found",
    "not found",
    "does not exist",
    "not available",
    "do not have access",
    "doesn't have access",
    "unsupported model",
  ]
  return hints.some((hint) => combined.includes(hint))
}

export function isTimeoutLikeAIError({
  error,
}: {
  error: unknown
}): boolean {
  const combined = getErrorText(error)
  const hints = [
    "request was aborted",
    "timed out",
    "timeout",
    "deadline exceeded",
  ]

  return hints.some((hint) => combined.includes(hint))
}

export function isModelParameterCompatibilityError({
  error,
}: {
  error: unknown
}): boolean {
  const status = getErrorStatus(error)
  if (status !== 400) return false

  const combined = getErrorText(error)
  const parameterHints = [
    "parameter",
    "temperature",
    "max_tokens",
    "max_completion_tokens",
    "response_format",
    "reasoning_effort",
    "value",
  ]
  const compatibilityHints = [
    "unsupported value",
    "unsupported parameter",
    "does not support",
    "not supported",
    "only the default",
    "default (1)",
  ]

  return (
    parameterHints.some((hint) => combined.includes(hint)) &&
    compatibilityHints.some((hint) => combined.includes(hint))
  )
}
