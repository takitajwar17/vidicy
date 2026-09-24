export async function register() {
  // Sentry initialization happens per-request via the capture APIs.
  // No global init needed — @sentry/cloudflare is designed for per-request lifecycle.
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
