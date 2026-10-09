import "server-only";
import { GoogleGenAI } from "@google/genai";
import { getRuntimeContext } from "@/infra/runtime-context";

const DEFAULT_VERTEX_LOCATION = "global";
export const GEMINI_DOCUMENT_EXTRACTION_MODEL = "gemini-3.8-flash";
export const GEMINI_DOCUMENT_EVALUATION_MODEL = "gemini-4-argon";

function getConfigValue(name: string): string | undefined {
  try {
    const { env } = getRuntimeContext();
    const value = (env as unknown as Record<string, unknown>)[name];
    if (typeof value === "string" && value.trim()) return value;
  } catch {
    // Local Next.js development and Cloud Run use process.env and ADC.
  }

  const value = process.env[name];
  return value?.trim() || undefined;
}

export function getGeminiClient(): GoogleGenAI {
  const project = getConfigValue("GOOGLE_CLOUD_PROJECT");
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT not configured");

  const credentialsJson = getConfigValue("GOOGLE_APPLICATION_CREDENTIALS_JSON");
  const googleAuthOptions = credentialsJson
    ? { credentials: JSON.parse(credentialsJson) }
    : undefined;

  return new GoogleGenAI({
    vertexai: true,
    project,
    location: getConfigValue("GOOGLE_CLOUD_LOCATION") ?? DEFAULT_VERTEX_LOCATION,
    googleAuthOptions,
  });
}
