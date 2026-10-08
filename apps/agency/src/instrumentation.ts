export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.05,
    });
  }
}

export function onRequestError(
  error: Error,
  request: { method: string; url: string; headers: Record<string, string> },
  context: { routerKind: string; routePath: string; routeType: string; renderSource: string },
) {
  // Import lazily to avoid bundling on client
  import("@/infra/sentry").then(({ captureException }) => {
    captureException(error, {
      tags: {
        routerKind: context.routerKind,
        routePath: context.routePath,
        routeType: context.routeType,
        renderSource: context.renderSource,
      },
      extra: {
        method: request.method,
        url: request.url,
      },
    });
  }).catch(() => {
    // Sentry not available — error already logged by Next.js
  });
}
