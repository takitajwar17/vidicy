// Sentry is initialized by the Node.js instrumentation entry. These exports provide
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
} from "@sentry/node";
