import "server-only"
import { GoogleGenAI } from "@google/genai"
import { getCloudflareContext } from "@opennextjs/cloudflare"

const DEFAULT_VERTEX_LOCATION = "global"

function getConfigValue(name: string): string | undefined {
  try {
    const { env } = getCloudflareContext()
    const value = (env as unknown as Record<string, unknown>)[name]
    if (typeof value === "string" && value.trim()) return value
  } catch {
    // Local Next.js development uses process.env and ADC.
  }

  const value = process.env[name]
  return value?.trim() || undefined
}

export function getGeminiClient(): GoogleGenAI {
  const project = getConfigValue("GOOGLE_CLOUD_PROJECT")
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT not configured")

  return new GoogleGenAI({
    vertexai: true,
    project,
    location: getConfigValue("GOOGLE_CLOUD_LOCATION") ?? DEFAULT_VERTEX_LOCATION,
  })
}
