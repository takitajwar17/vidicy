import "server-only";
import { cookies } from "next/headers";

import { generateCsrfTokenValue } from "./csrf-token";

const CSRF_COOKIE_NAME = "csrf-token";

/**
 * Validates that the provided CSRF token matches the stored token
 * Returns true if valid, false otherwise
 */
export async function validateCsrfToken(
  providedToken: string | null | undefined,
): Promise<boolean> {
  if (!providedToken) {
    return false;
  }

  const cookieStore = await cookies();
  const storedToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;

  if (!storedToken) {
    return false;
  }

  // Use constant-time comparison to prevent timing attacks
  if (storedToken.length !== providedToken.length) {
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < storedToken.length; i++) {
    mismatch |= storedToken.charCodeAt(i) ^ providedToken.charCodeAt(i);
  }

  return mismatch === 0;
}

/**
 * Gets the current CSRF token from cookies (for including in requests)
 */
export async function getCsrfToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE_NAME)?.value;
}

/**
 * Deletes the CSRF token cookie
 */
export async function deleteCsrfToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(CSRF_COOKIE_NAME);
}

export { generateCsrfTokenValue };
