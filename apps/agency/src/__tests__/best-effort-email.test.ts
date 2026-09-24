import { describe, expect, it, vi } from "vitest";

import { sendEmailBestEffort } from "@/lib/best-effort-email";

describe("sendEmailBestEffort", () => {
  it("returns true and does not log when delivery succeeds", async () => {
    const send = vi.fn(async () => undefined);
    const logger = {
      error: vi.fn(),
    };

    const delivered = await sendEmailBestEffort({
      send,
      logger,
      message: "email failed",
      context: { userId: "usr_123" },
    });

    expect(delivered).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("returns false and logs structured context when delivery fails", async () => {
    const send = vi.fn(async () => {
      throw new Error("boom");
    });
    const logger = {
      error: vi.fn(),
    };

    const delivered = await sendEmailBestEffort({
      send,
      logger,
      message: "email failed",
      context: { ticketId: "st_123" },
    });

    expect(delivered).toBe(false);
    expect(logger.error).toHaveBeenCalledWith("email failed", {
      ticketId: "st_123",
      error: "boom",
    });
  });
});
