import type { Route } from "next";

export const SITE_NAME = "Vidicy";
export const SITE_DESCRIPTION =
  "AI visa review software for agencies: check client documents, spot missing requirements, manage cases, and send clear follow-ups before submission.";
export const CANONICAL_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://vidicy-agency-vw6akohvja-as.a.run.app";
export const CANONICAL_SITE_DOMAIN = new URL(CANONICAL_SITE_URL).hostname;
export const OPEN_GRAPH_IMAGE_PATH = "/og_image.png";
export const OPEN_GRAPH_IMAGE_WIDTH = 1200;
export const OPEN_GRAPH_IMAGE_HEIGHT = 630;
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : CANONICAL_SITE_URL);
export const API_CATALOG_PATH = "/.well-known/api-catalog";
export const AGENT_CARD_PATH = "/.well-known/agent-card.json";
export const AGENT_SKILLS_INDEX_PATH = "/.well-known/agent-skills/index.json";
export const AGENT_SKILLS_SCHEMA_URL = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";
export const MCP_ENDPOINT_PATH = "/mcp";
export const MCP_SERVER_CARD_PATH = "/.well-known/mcp/server-card.json";
export const MCP_PROTOCOL_VERSION = "2025-06-18";
export const A2A_PROTOCOL_VERSION = "1.0";
export const AGENT_DISCOVERY_LINK_HEADER = `<${API_CATALOG_PATH}>; rel="api-catalog"`;
export const MARKDOWN_AGENT_ROUTE = "/agent-markdown";
export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";
export const PUBLIC_ROBOTS_DISALLOW_PATHS = [
  "/admin",
  "/admin/",
  "/dashboard",
  "/dashboard/",
  "/forgot-password",
  "/pending-verification",
  "/reset-password",
  "/settings",
  "/settings/",
  "/sign-in",
  "/sign-up",
  "/verify-email",
  "/api/",
] as const;
export const PUBLIC_SIGN_UP_CTA_LABEL = "Start a pilot";

export const SITE_DOMAIN = new URL(SITE_URL).hostname;
export const LEGACY_SITE_DOMAINS = ["vidicy.com", "agency.vidicy.com", "www.vidicy.com"] as const;

// External API endpoints
export const PERPLEXITY_API_BASE_URL = "https://api.perplexity.ai";
export const DISPOSABLE_EMAIL_CHECK_URL = "https://disposable.debounce.io";
export const MAILCHECK_API_URL = "https://api.mailcheck.ai";
export const CLOUDFLARE_TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 hours
export const EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 hours
export const MAX_SESSIONS_PER_USER = 5;
export const SESSION_COOKIE_NAME = "session";
export const GOOGLE_OAUTH_STATE_COOKIE_NAME = "google-oauth-state";
export const GOOGLE_OAUTH_CODE_VERIFIER_COOKIE_NAME = "google-oauth-code-verifier";
export const GOOGLE_OAUTH_REDIRECT_COOKIE_NAME = "google-oauth-redirect";

export const SUPPORT_TICKETS_PER_PAGE = 20;
export const ADMIN_EMAIL = "support@vidicy.com";

export const REDIRECT_AFTER_SIGN_IN = "/dashboard" as Route;
export const PENDING_VERIFICATION_ROUTE = "/pending-verification" as Route;

// AI model limits
export const AI_MAX_TOKENS_LARGE = 4096;
export const AI_MAX_TOKENS_SMALL = 1536;
export const AI_MAX_COMBINED_TEXT_LENGTH = 6000;

// Timeout (ms) for external AI API calls to prevent Worker CPU limit kills
export const AI_TIMEOUT_CHAT_MS = 40_000;
export const AI_TIMEOUT_EMBEDDING_MS = 25_000;
export const AI_TIMEOUT_PERPLEXITY_MS = 45_000;

// Overall timeout for the PDF processing pipeline running inside waitUntil().
// Workers have a ~30s CPU time limit; wall-clock is more generous but we cap at
// 120s to ensure cleanup runs and the document is marked FAILED if it stalls.
export const PDF_PIPELINE_TIMEOUT_MS = 120_000;

// File size limits
export const MAX_DOCUMENT_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_SUPPORT_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Cache & time durations
export const CACHE_MAX_AGE_1_HOUR = 3600;
export const CACHE_TTL_7_DAYS = 7 * 24 * 60 * 60;
export const COOKIE_MAX_AGE_30_DAYS = 60 * 60 * 24 * 30;
export const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
export const EMAIL_RESEND_COOLDOWN_MS = 60_000;

// Data retention periods (days) — referenced by privacy policy §6
export const RETENTION_ACCOUNT_DATA_DAYS = Infinity; // Until user deletes account
export const RETENTION_VISA_APPLICATION_DAYS = Infinity; // Until user deletes application
export const RETENTION_SESSION_DAYS = 30;
export const RETENTION_SUPPORT_TICKET_DAYS = 90; // After resolution
export const RETENTION_ENTERPRISE_INQUIRY_DAYS = 90;
export const RETENTION_PASSWORD_RESET_TOKEN_HOURS = 24;
export const RETENTION_EMAIL_VERIFICATION_TOKEN_HOURS = 24;

// Business rules
export const MODIFICATION_GAP_DAYS_THRESHOLD = 365;

/** Text colour classes keyed by risk level */
export const RISK_TEXT_COLORS: Record<string, string> = {
  low: "text-status-success",
  medium: "text-status-warning",
  high: "text-destructive",
};

/** Background + border colour classes keyed by risk level */
export const RISK_BG_COLORS: Record<string, string> = {
  low: "bg-status-success/10 border-status-success/20",
  medium: "bg-status-warning/10 border-status-warning/20",
  high: "bg-destructive/10 border-destructive/20",
};

/** Full badge classes (text + border + bg) keyed by risk level */
export const RISK_BADGE_COLORS: Record<string, string> = {
  low: "text-status-success border-status-success/30 bg-status-success/10",
  medium: "text-status-warning border-status-warning/30 bg-status-warning/10",
  high: "text-destructive border-destructive/30 bg-destructive/10",
};

/** All passport-issuing countries (shared across new-application, add/edit applicant forms) */
export const COUNTRIES = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Argentina",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahrain",
  "Bangladesh",
  "Belgium",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Brazil",
  "Bulgaria",
  "Cambodia",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Croatia",
  "Czech Republic",
  "Denmark",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "Estonia",
  "Ethiopia",
  "Finland",
  "France",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Guatemala",
  "Honduras",
  "Hungary",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kuwait",
  "Latvia",
  "Lebanon",
  "Libya",
  "Lithuania",
  "Malaysia",
  "Mexico",
  "Moldova",
  "Morocco",
  "Myanmar",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Nigeria",
  "Norway",
  "Oman",
  "Pakistan",
  "Palestine",
  "Panama",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Somalia",
  "South Africa",
  "South Korea",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tanzania",
  "Thailand",
  "Tunisia",
  "Turkey",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zimbabwe",
];

/** Last 50 years for visa history dropdowns (shared across all application forms) */
export const YEAR_OPTIONS = Array.from({ length: 50 }, (_, i) =>
  String(new Date().getFullYear() - i),
);
