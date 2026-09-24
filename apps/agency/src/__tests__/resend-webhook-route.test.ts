import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockVerify,
  mockApplyResendWebhookEvent,
  mockGetDB,
} = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockApplyResendWebhookEvent: vi.fn(),
  mockGetDB: vi.fn(),
}));

vi.mock("svix", () => ({
  Webhook: class {
    verify = mockVerify;
  },
}));

vi.mock("@/db", () => ({
  getDB: mockGetDB,
}));

vi.mock("@/server/marketing/webhook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/marketing/webhook")>();
  return {
    ...actual,
    applyResendWebhookEvent: mockApplyResendWebhookEvent,
  };
});

import { POST } from "@/app/api/resend/webhook/route";

describe("POST /api/resend/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDB.mockReturnValue({});
    mockApplyResendWebhookEvent.mockResolvedValue(undefined);
    mockVerify.mockReturnValue({
      type: "contact.updated",
      data: {
        email: "owner@example.com",
        unsubscribed: true,
      },
    });
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
  });

  it("returns 400 when signature verification fails", async () => {
    mockVerify.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    const response = await POST(new Request("http://localhost:3000/api/resend/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": "msg_123",
        "svix-timestamp": "123",
        "svix-signature": "sig_123",
      },
      body: JSON.stringify({ type: "contact.updated" }),
    }));

    expect(response.status).toBe(400);
  });

  it("applies a verified Resend event", async () => {
    const response = await POST(new Request("http://localhost:3000/api/resend/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "svix-id": "msg_123",
        "svix-timestamp": "123",
        "svix-signature": "sig_123",
      },
      body: JSON.stringify({ type: "contact.updated" }),
    }));

    expect(response.status).toBe(200);
    expect(mockApplyResendWebhookEvent).toHaveBeenCalledTimes(1);
  });
});
