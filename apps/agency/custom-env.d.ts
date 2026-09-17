interface CloudflareEnv {
  APP_D1: D1Database;
  SENTRY_DSN?: string;
  // TODO Remove them from here because we are not longer loading them from the Cloudflare Context
  RESEND_API_KEY?: string;
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Secrets not declared as wrangler bindings — must live here to survive `pnpm cf-typegen`
  PERPLEXITY_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
  WEB_BOT_AUTH_PUBLIC_JWK?: string;
  WEB_BOT_AUTH_PRIVATE_JWK?: string;
}
