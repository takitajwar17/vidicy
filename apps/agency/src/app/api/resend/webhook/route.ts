import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { getDB } from "@/db";
import { logger } from "@/infra/logger";
import { applyResendWebhookEvent } from "@/server/marketing/webhook";

function getSvixHeaders(request: Request) {
  return {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };
}

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.error("RESEND_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const payload = await request.text();
  const headers = getSvixHeaders(request);

  try {
    const webhook = new Webhook(webhookSecret);
    const event = webhook.verify(payload, headers) as {
      type: string;
      data?: Record<string, unknown>;
    };

    await applyResendWebhookEvent({
      db: getDB(),
      event,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("Failed to verify Resend webhook signature", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
}
