import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyResendWebhookEvent } from "@/server/marketing/webhook";

describe("applyResendWebhookEvent", () => {
  const mockWhere = vi.fn();
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();

  type WebhookDb = Parameters<typeof applyResendWebhookEvent>[0]["db"];

  const db = {
    update: mockUpdate,
  } as unknown as WebhookDb;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockReturnValue({
      set: mockSet,
    });
    mockSet.mockReturnValue({
      where: mockWhere,
    });
    mockWhere.mockResolvedValue(undefined);
  });

  it("globally suppresses a marketing contact when Resend marks it unsubscribed", async () => {
    await applyResendWebhookEvent({
      db,
      event: {
        type: "contact.updated",
        data: {
          email: "owner@example.com",
          unsubscribed: true,
        },
      },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      subscribedOnboarding: false,
      subscribedPostPurchase: false,
      subscribedWinback: false,
      updatedAt: expect.any(Date),
    }));
  });

  it("suppresses a bounced recipient", async () => {
    await applyResendWebhookEvent({
      db,
      event: {
        type: "email.bounced",
        data: {
          to: ["bounced@example.com"],
        },
      },
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("ignores non-suppression events", async () => {
    await applyResendWebhookEvent({
      db,
      event: {
        type: "email.failed",
        data: {
          to: ["owner@example.com"],
        },
      },
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
