import type { SessionValidationResult } from "@/types";
import { PENDING_VERIFICATION_ROUTE, REDIRECT_AFTER_SIGN_IN } from "@/constants";

export function normalizeRedirectPath(redirectPath?: string | null) {
  const candidate = redirectPath?.trim();

  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return REDIRECT_AFTER_SIGN_IN;
  }

  return candidate;
}

export function getAuthRouteHref(basePath: string, redirectPath?: string | null) {
  const normalizedRedirectPath = normalizeRedirectPath(redirectPath);

  if (normalizedRedirectPath === REDIRECT_AFTER_SIGN_IN) {
    return basePath;
  }

  return `${basePath}?redirect=${encodeURIComponent(normalizedRedirectPath)}`;
}

export function getPendingVerificationPath(verifiedRedirectPath?: string | null) {
  const normalizedRedirectPath = normalizeRedirectPath(verifiedRedirectPath);

  if (normalizedRedirectPath === REDIRECT_AFTER_SIGN_IN) {
    return PENDING_VERIFICATION_ROUTE;
  }

  return `${PENDING_VERIFICATION_ROUTE}?redirect=${encodeURIComponent(normalizedRedirectPath)}`;
}

export function getPostAuthRedirectPath({
  isEmailVerified,
  verifiedRedirectPath = REDIRECT_AFTER_SIGN_IN,
}: {
  isEmailVerified: boolean;
  verifiedRedirectPath?: string;
}) {
  const normalizedRedirectPath = normalizeRedirectPath(verifiedRedirectPath);

  return isEmailVerified
    ? normalizedRedirectPath
    : getPendingVerificationPath(normalizedRedirectPath);
}

export function getSessionRedirectPath({
  session,
  verifiedRedirectPath = REDIRECT_AFTER_SIGN_IN,
}: {
  session: SessionValidationResult | null | undefined;
  verifiedRedirectPath?: string;
}) {
  return getPostAuthRedirectPath({
    isEmailVerified: Boolean(session?.user?.emailVerified),
    verifiedRedirectPath,
  });
}
