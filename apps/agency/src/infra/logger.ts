import isProd from "@/utils/is-prod";

// Request ID tracking for better debugging
export interface LogContext {
  requestId?: string;
  userId?: string;
  teamId?: string;
  ip?: string;
  userAgent?: string;
  [key: string]: any;
}

// Lightweight Production Logger
class ProductionLogger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  private format(level: string, message: string, meta: any = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...meta,
    });
  }

  error(message: string, meta?: any) {
    console.error(this.format("error", message, meta));
    // Send errors to Sentry in production
    import("@/infra/sentry").then(({ captureException, captureMessage: sentryMessage, isInitialized }) => {
      if (!isInitialized()) return;
      const err = meta?.error ?? meta?.welcomeError;
      if (err instanceof Error) {
        captureException(err, { extra: { message, ...this.context, ...meta } });
      } else {
        sentryMessage(message, { level: "error", extra: { ...this.context, ...meta } });
      }
    }).catch(() => {/* Sentry not available */});
  }
  warn(message: string, meta?: any) { console.warn(this.format("warn", message, meta)); }
  info(message: string, meta?: any) { console.info(this.format("info", message, meta)); }
  http(message: string, meta?: any) { console.info(this.format("http", message, meta)); }
  debug(message: string, meta?: any) {
    // In Workers, process.env may not exist — guard safely
    const debugEnabled = typeof process !== "undefined" && process.env?.LOG_LEVEL === "debug";
    if (debugEnabled) {
      console.debug(this.format("debug", message, meta));
    }
  }

  withContext(additionalContext: LogContext) {
    return new ProductionLogger({ ...this.context, ...additionalContext });
  }
}

// Keep the shared logger implementation Edge-safe. The heavier development
// logger uses Node-only modules and must not be reachable from Edge routes.
const loggerInstance: any = new ProductionLogger();

export const logger = loggerInstance;

export class Logger {
  private context: LogContext;
  private impl: any;

  constructor(context: LogContext = {}) {
    this.context = context;
    this.impl = isProd ? new ProductionLogger(context) : (loggerInstance.child ? loggerInstance.child(context) : loggerInstance);
  }

  error(message: string, meta?: any) { this.impl.error(message, meta); }
  warn(message: string, meta?: any) { this.impl.warn(message, meta); }
  info(message: string, meta?: any) { this.impl.info(message, meta); }
  http(message: string, meta?: any) { this.impl.http(message, meta); }
  debug(message: string, meta?: any) { this.impl.debug(message, meta); }

  withContext(additionalContext: LogContext) {
    return new Logger({ ...this.context, ...additionalContext });
  }
}

export const log = new Logger();

export const logError = (error: Error, context?: LogContext) => {
  log.withContext(context || {}).error(error.message, { stack: error.stack, name: error.name });
};

export const logRequest = (method: string, url: string, statusCode: number, responseTime: number, context?: LogContext) => {
  log.withContext(context || {}).http(`${method} ${url} ${statusCode}`, { method, url, statusCode, responseTime });
};

export const logAuth = (event: string, success: boolean, context?: LogContext) => {
  const level = success ? "info" : "warn";
  log.withContext(context || {})[level](`Auth ${event}: ${success ? "SUCCESS" : "FAILED"}`, { authEvent: event, success });
};

export const logDatabase = (operation: string, table: string, duration?: number, context?: LogContext) => {
  log.withContext(context || {}).debug(`Database ${operation} on ${table}`, { dbOperation: operation, table, duration });
};

// Export null winston in production to break any potential dependency chains
export const winston = isProd ? null : loggerInstance;

// ---------------------------------------------------------------------------
// Structured alert logging — critical failures with categorized alert types
// for Cloudflare observability filters and external alert rules.
// ---------------------------------------------------------------------------

export type AlertCategory =
  | "ai_api_failure"      // OpenAI/Perplexity 5xx or timeout
  | "auth_brute_force"    // Repeated auth failures from same IP
  | "r2_failure"          // R2 upload/delete/read failure
  | "d1_failure"          // Database write failure
  | "vectorize_failure"   // Embedding upsert/query failure
  | "pipeline_timeout"    // PDF pipeline exceeded timeout
  | "rate_limit_exceeded" // User hitting rate limits repeatedly
  | "critical_error";     // Unrecoverable application error

/**
 * Emit a structured alert log entry. Cloudflare Workers Logpush or
 * tail consumers can filter on `alertCategory` to route to Slack/PagerDuty.
 */
export function logAlert(
  category: AlertCategory,
  message: string,
  meta?: Record<string, unknown>,
) {
  log.error(`[ALERT:${category}] ${message}`, {
    alertCategory: category,
    severity: "critical",
    ...meta,
  });
  // Also send as a tagged Sentry event for alerting
  import("@/infra/sentry").then(({ captureMessage, isInitialized }) => {
    if (!isInitialized()) return;
    captureMessage(`[ALERT] ${message}`, {
      level: "fatal",
      tags: { alertCategory: category, severity: "critical" },
      extra: meta,
    });
  }).catch(() => {/* Sentry not available */});
}
