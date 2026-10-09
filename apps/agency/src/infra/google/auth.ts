import "server-only";

import { GoogleAuth } from "google-auth-library";

let auth: GoogleAuth | undefined;

/** ADC works with Cloud Run service identity and local developer credentials. */
export function getGoogleAuth(): GoogleAuth {
  auth ??= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  return auth;
}

/** Never put API request bodies or authorization headers into application logs. */
export async function googleJsonRequest<T>({
  url,
  method = "POST",
  data,
}: {
  url: string;
  method?: "GET" | "POST";
  data?: unknown;
}): Promise<T> {
  try {
    const client = await getGoogleAuth().getClient();
    const response = await client.request<T>({
      url,
      method,
      data,
      timeout: 60_000,
      retry: true,
      retryConfig: {
        retry: 3,
        httpMethodsToRetry: ["GET", "POST"],
        statusCodesToRetry: [
          [429, 429],
          [500, 599],
        ],
      },
    });
    return response.data;
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "response" in error
        ? (error.response as { status?: number } | undefined)?.status
        : undefined;
    throw new Error(`Google Cloud API request failed${status ? ` (HTTP ${status})` : ""}`);
  }
}
