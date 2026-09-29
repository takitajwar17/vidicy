import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  AGENT_DISCOVERY_LINK_HEADER,
  CANONICAL_SITE_DOMAIN,
  LEGACY_SITE_DOMAINS,
  MARKDOWN_AGENT_ROUTE,
} from "@/constants";
import { generateCsrfTokenValue } from "@/infra/csrf-token";

const SEO_METADATA_PATHS = new Set(["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]);
const AUTH_GATE_ENTRY_PATHS = new Set(["/sign-in", "/sign-up"]);
const AUTH_GATE_ACCESS_PARAM = "access";
const AUTH_GATE_BYPASS_COOKIE = "vidicy-auth-gate";
const AUTH_GATE_REDIRECT_PATH = "/pilot-access";
const AUTH_GATE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getLegacySiteRedirectUrl(request: NextRequest): URL | null {
  if (!LEGACY_SITE_DOMAINS.includes(request.nextUrl.hostname as (typeof LEGACY_SITE_DOMAINS)[number])) {
    return null;
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.protocol = "https:";
  redirectUrl.hostname = CANONICAL_SITE_DOMAIN;
  redirectUrl.port = "";

  return redirectUrl;
}

function getMarkdownNegotiationPath(pathname: string): string | null {
  if (pathname === "/") {
    return pathname;
  }

  return null;
}

function isSeoMetadataPath({ pathname }: { pathname: string }) {
  return SEO_METADATA_PATHS.has(pathname);
}

function requestWantsMarkdown(request: NextRequest): boolean {
  if (!["GET", "HEAD"].includes(request.method)) {
    return false;
  }

  const acceptHeader = request.headers.get("accept");
  if (!acceptHeader) {
    return false;
  }

  return acceptHeader
    .split(",")
    .map((value) => value.trim().toLowerCase().split(";")[0])
    .includes("text/markdown");
}

function isAuthGateEnabled() {
  return process.env.AUTH_UNDER_CONSTRUCTION === "true";
}

function getAuthGateBypassToken() {
  return process.env.AUTH_GATE_BYPASS_TOKEN?.trim() ?? "";
}

function getAuthGateResponse(request: NextRequest): NextResponse | null {
  if (!isAuthGateEnabled() || !AUTH_GATE_ENTRY_PATHS.has(request.nextUrl.pathname)) {
    return null;
  }

  const bypassToken = getAuthGateBypassToken();
  const providedToken = request.nextUrl.searchParams.get(AUTH_GATE_ACCESS_PARAM);

  if (bypassToken && providedToken === bypassToken) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.searchParams.delete(AUTH_GATE_ACCESS_PARAM);

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(AUTH_GATE_BYPASS_COOKIE, bypassToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: AUTH_GATE_COOKIE_MAX_AGE_SECONDS,
    });

    return response;
  }

  if (bypassToken && request.cookies.get(AUTH_GATE_BYPASS_COOKIE)?.value === bypassToken) {
    return null;
  }

  return NextResponse.redirect(new URL(AUTH_GATE_REDIRECT_PATH, request.url));
}

export async function middleware(request: NextRequest) {
  // Redirect the retired production hostname before we issue fresh cookies.
  const redirectUrl = getLegacySiteRedirectUrl(request);

  if (redirectUrl) {
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (isSeoMetadataPath({ pathname: request.nextUrl.pathname })) {
    return NextResponse.next();
  }

  const authGateResponse = getAuthGateResponse(request);

  if (authGateResponse) {
    return authGateResponse;
  }

  const markdownPath = getMarkdownNegotiationPath(request.nextUrl.pathname);
  const shouldServeMarkdown = markdownPath && requestWantsMarkdown(request);
  const response = shouldServeMarkdown
    ? NextResponse.rewrite(new URL(`${MARKDOWN_AGENT_ROUTE}?path=${encodeURIComponent(markdownPath)}`, request.url))
    : NextResponse.next();

  // Check if CSRF token exists
  const csrfToken = request.cookies.get("csrf-token");

  if (!csrfToken) {
    const token = generateCsrfTokenValue();

    response.cookies.set("csrf-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

  if (markdownPath) {
    response.headers.set("Vary", "Accept");
  }

  if (request.nextUrl.pathname === "/") {
    response.headers.set("Link", AGENT_DISCOVERY_LINK_HEADER);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - agent-markdown (internal markdown negotiation route)
     * - static_logo.svg / favicon.svg / favicon.png / favicon-48.png / favicon-512.png (logo and favicon assets)
     * - favicon.ico (legacy favicon path)
     *
     * SEO metadata routes intentionally pass through middleware so retired hostnames
     * still redirect to the canonical domain before route handling.
     */
    "/((?!api|agent-markdown|_next/static|_next/image|static_logo.svg|favicon.svg|favicon.png|favicon-48.png|favicon-512.png|favicon.ico).*)",
  ],
};
