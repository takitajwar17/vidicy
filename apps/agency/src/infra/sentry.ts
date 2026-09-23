// Sentry is initialized per-request via withSentry() in the checked-in worker entry
// (`worker.ts`). These re-exports provide
// a clean import path for the rest of the app to capture errors and set context.
export {
  captureException,
  captureMessage,
  isInitialized,
  setUser,
  setTag,
  withScope,
  logger as sentryLogger,
  metrics as sentryMetrics,
} from "@sentry/cloudflare";
