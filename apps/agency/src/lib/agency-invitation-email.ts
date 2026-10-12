import "server-only";

import { SITE_NAME } from "@/constants";
import type { AgencyInvitationEmailRequest } from "@/db/schema";
import {
  agencyInvitationText,
  type AgencyInvitationEmailContent,
} from "@/react-email/agency-invitation";

export interface AgencyInvitationDeliveryError extends Error {
  retryable: boolean;
  attempted: boolean;
  retryAfterMs?: number;
}

function deliveryError({
  message,
  retryable,
  attempted,
  retryAfterMs,
}: {
  message: string;
  retryable: boolean;
  attempted: boolean;
  retryAfterMs?: number;
}): AgencyInvitationDeliveryError {
  return Object.assign(new Error(message), { retryable, attempted, retryAfterMs });
}

export function createAgencyInvitationEmailRequest(
  input: AgencyInvitationEmailContent,
): AgencyInvitationEmailRequest {
  return {
    from: process.env.EMAIL_FROM
      ? `${process.env.EMAIL_FROM_NAME ?? SITE_NAME} <${process.env.EMAIL_FROM}>`
      : "",
    to: [input.email],
    subject: `Invitation to join ${input.agencyName} on ${SITE_NAME}`,
    text: agencyInvitationText(input),
    ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
    tags: [{ name: "type", value: "agency-invitation" }],
  };
}

// Sender completion is allowed only before a provider request has started.
export function completeAgencyInvitationEmailSender(
  request: AgencyInvitationEmailRequest,
): AgencyInvitationEmailRequest {
  if (request.from || !process.env.EMAIL_FROM) return request;
  return {
    ...request,
    from: `${process.env.EMAIL_FROM_NAME ?? SITE_NAME} <${process.env.EMAIL_FROM}>`,
    ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
  };
}

export function getAgencyInvitationEmailPreflightError(
  request: AgencyInvitationEmailRequest,
): string | null {
  if (process.env.NODE_ENV !== "production")
    return "Invitation email delivery is disabled outside production.";
  if (!process.env.RESEND_API_KEY)
    return "Configure the email provider before sending invitations.";
  if (!request.from) return "Configure the email sender before sending invitations.";
  return null;
}

function retryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay >= 0 ? delay : undefined;
}

export async function sendAgencyInvitationEmail({
  request,
  idempotencyKey,
}: {
  request: AgencyInvitationEmailRequest;
  idempotencyKey: string;
}): Promise<{ id: string }> {
  const preflightError = getAgencyInvitationEmailPreflightError(request);
  if (preflightError)
    throw deliveryError({ message: preflightError, retryable: false, attempted: false });
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw deliveryError({
      message: "The email provider could not be reached.",
      retryable: true,
      attempted: true,
    });
  }
  if (!response.ok) {
    const details: unknown = await response.json().catch(() => null);
    const concurrent =
      response.status === 409 &&
      details &&
      typeof details === "object" &&
      "name" in details &&
      details.name === "concurrent_idempotent_requests";
    throw deliveryError({
      message: `The email provider rejected delivery (${response.status}).`,
      retryable: response.status === 429 || response.status >= 500 || Boolean(concurrent),
      attempted: true,
      retryAfterMs: retryAfterMs(response.headers.get("retry-after")),
    });
  }
  const accepted: unknown = await response.json().catch(() => null);
  if (
    !accepted ||
    typeof accepted !== "object" ||
    !("id" in accepted) ||
    typeof accepted.id !== "string" ||
    !accepted.id
  ) {
    throw deliveryError({
      message: "The email provider did not confirm acceptance.",
      retryable: true,
      attempted: true,
    });
  }
  return { id: accepted.id };
}
