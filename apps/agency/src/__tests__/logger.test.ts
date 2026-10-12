import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  isInitialized: vi.fn(() => true),
}));
vi.mock("@/infra/sentry", () => sentry);
import { logger, logAlert } from "@/infra/logger";

describe("alert reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sentry.isInitialized.mockReturnValue(true);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("reports one tagged exception for one alert", async () => {
    const error = new Error("Provider timeout");
    logAlert("ai_api_failure", "Document review failed", { error });
    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(1));
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        level: "fatal",
        tags: { alertCategory: "ai_api_failure", severity: "critical" },
      }),
    );
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("reports one message when an alert has no exception", async () => {
    logAlert("critical_error", "Review failed");
    await vi.waitFor(() => expect(sentry.captureMessage).toHaveBeenCalledTimes(1));
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("keeps normal error reporting and tolerates disabled Sentry", async () => {
    const error = new Error("Database error");
    logger.error("Save failed", { error });
    await vi.waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(1));
    sentry.isInitialized.mockReturnValue(false);
    logAlert("critical_error", "Unavailable", { error });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});
