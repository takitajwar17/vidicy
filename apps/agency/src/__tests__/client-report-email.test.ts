import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/utils/is-prod", () => ({ default: true }));
import { createClientReportEmailRequest, sendClientReportEmail } from "@/utils/email";

const transport = vi.fn();
beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "original@example.test");
  vi.stubEnv("EMAIL_FROM_NAME", "Original agency");
  vi.stubEnv("EMAIL_REPLY_TO", "original-reply@example.test");
  transport.mockReset().mockResolvedValue(Response.json({ id: "message_1" }));
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("client report email transport", () => {
  it("retries the same provider body after sender settings change", async () => {
    const payload = { to: "client@example.test", subject: "Review", text: "Replace the passport" };
    const request = createClientReportEmailRequest(payload);
    const idempotencyKey = "report/test";
    await sendClientReportEmail({ request, idempotencyKey });
    vi.stubEnv("EMAIL_FROM", "new@example.test");
    vi.stubEnv("EMAIL_FROM_NAME", "New agency");
    vi.stubEnv("EMAIL_REPLY_TO", "new-reply@example.test");
    transport.mockResolvedValueOnce(Response.json({ id: "message_1" }));
    await sendClientReportEmail({ request, idempotencyKey });
    expect(transport.mock.calls[1][1].body).toBe(transport.mock.calls[0][1].body);
    expect(transport.mock.calls[1][1].headers["Idempotency-Key"]).toBe(idempotencyKey);
  });
  it("uses the saved sender when the current sender setting is removed", async () => {
    const request = createClientReportEmailRequest({
      to: "client@example.test",
      subject: "Review",
      text: "Corrections",
    });
    vi.stubEnv("EMAIL_FROM", "");
    await expect(
      sendClientReportEmail({ request, idempotencyKey: "saved/request" }),
    ).resolves.toEqual({ id: "message_1" });
    expect(JSON.parse(transport.mock.calls[0][1].body).from).toBe(
      "Original agency <original@example.test>",
    );
  });

  it("requires provider acceptance before it reports success", async () => {
    const request = createClientReportEmailRequest({
      to: "client@example.test",
      subject: "Review",
      text: "Corrections",
    });
    transport.mockResolvedValueOnce(Response.json({}));
    await expect(sendClientReportEmail({ request, idempotencyKey: "missing/id" })).rejects.toThrow(
      "did not confirm acceptance",
    );
  });
});
