import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAgencyInvitationEmailRequest,
  sendAgencyInvitationEmail,
} from "@/lib/agency-invitation-email";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("EMAIL_FROM", "invite@example.com");
  vi.stubEnv("EMAIL_FROM_NAME", "Vidicy");
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function request() {
  return createAgencyInvitationEmailRequest({
    email: "member@example.com",
    agencyName: "Agency A",
    inviterName: "Owner",
    code: "ABCD1234EFAB567890CD",
    expiresAt: new Date("2026-11-01T00:00:00.000Z"),
  });
}

describe("agency invitation delivery adapter", () => {
  it("builds a recipient-bound message with the join code and absolute expiry", () => {
    const payload = request();
    expect(payload.to).toEqual(["member@example.com"]);
    expect(payload.text).toContain("/agency-setup?code=ABCD1234EFAB567890CD");
    expect(payload.text).toContain("2026-11-01T00:00:00.000Z");
    expect(payload.text).toContain("member@example.com");
    expect(payload.text).toContain("expires after 7 days");
    expect(payload.text).toContain("It can be used once.");
    expect(payload.text).not.toContain("There is no invitation to accept");
  });
  it("sends the exact request and idempotency key", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "message_1" }), { status: 200 }));
    const payload = request();
    await expect(
      sendAgencyInvitationEmail({ request: payload, idempotencyKey: "invite/1" }),
    ).resolves.toEqual({ id: "message_1" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": "invite/1" }),
        body: JSON.stringify(payload),
      }),
    );
  });
  it("does not report success or send mail in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(
      sendAgencyInvitationEmail({ request: request(), idempotencyKey: "invite/1" }),
    ).rejects.toMatchObject({ retryable: false, attempted: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("marks 429 and temporary server errors as retryable", async () => {
    for (const status of [429, 500, 503]) {
      fetchMock.mockResolvedValueOnce(new Response("{}", { status }));
      await expect(
        sendAgencyInvitationEmail({ request: request(), idempotencyKey: "invite/1" }),
      ).rejects.toMatchObject({ retryable: true, attempted: true });
    }
  });
  it("retries a concurrent idempotent request but not a changed payload", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: "concurrent_idempotent_requests" }), { status: 409 }),
    );
    await expect(
      sendAgencyInvitationEmail({ request: request(), idempotencyKey: "invite/1" }),
    ).rejects.toMatchObject({ retryable: true });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 }),
    );
    await expect(
      sendAgencyInvitationEmail({ request: request(), idempotencyKey: "invite/1" }),
    ).rejects.toMatchObject({ retryable: false });
  });
  it("treats network failures as retryable without persisting provider details", async () => {
    fetchMock.mockRejectedValueOnce(new Error("private upstream information"));
    await expect(
      sendAgencyInvitationEmail({ request: request(), idempotencyKey: "invite/1" }),
    ).rejects.toMatchObject({
      retryable: true,
      attempted: true,
      message: "The email provider could not be reached.",
    });
  });
  it("requires a provider message ID before accepting success", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await expect(
      sendAgencyInvitationEmail({ request: request(), idempotencyKey: "invite/1" }),
    ).rejects.toMatchObject({ retryable: true, attempted: true });
  });
});
