import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import { z } from "zod";
import { getDB } from "@/db";
import { agencyInvitationTable, agencyTable, agencyTeamMemberTable } from "@/db/schema";
import { requireAgencyAdmin } from "@/server/agency-team";
import {
  AGENCY_INVITATION_LIFETIME_MS,
  generateAgencyInviteCode,
  hashAgencyInviteCode,
} from "@/lib/agency-invite-code";
import {
  completeAgencyInvitationEmailSender,
  createAgencyInvitationEmailRequest,
  getAgencyInvitationEmailPreflightError,
  sendAgencyInvitationEmail,
  type AgencyInvitationDeliveryError,
} from "@/lib/agency-invitation-email";

const RETRY_COOLDOWN_MS = 2 * 60_000;
// Resend retains keys for 24h. An unknown outcome must not become a second send.
const SAFE_RETRY_WINDOW_MS = 23 * 60 * 60_000;
const MAX_AUTOMATIC_ATTEMPTS = 3;

// Call within a transaction. Membership mutations use this same agency lock.
async function lockInvitationAdmin({ agencyId, userId }: { agencyId: string; userId: string }) {
  const db = getDB();
  await db.execute(sql`select id from ${agencyTable} where id = ${agencyId} for update`);
  const member = await db.query.agencyTeamMemberTable.findFirst({
    where: and(
      eq(agencyTeamMemberTable.agencyId, agencyId),
      eq(agencyTeamMemberTable.userId, userId),
      eq(agencyTeamMemberTable.role, "admin"),
      eq(agencyTeamMemberTable.status, "active"),
    ),
    columns: { id: true },
  });
  if (!member)
    throw new ZSAError("FORBIDDEN", "Your agency admin access has changed. Refresh the page.");
}

function availableInvitation({
  agencyId,
  invitationId,
  now,
}: {
  agencyId: string;
  invitationId: string;
  now: Date;
}) {
  return and(
    eq(agencyInvitationTable.id, invitationId),
    eq(agencyInvitationTable.agencyId, agencyId),
    isNull(agencyInvitationTable.revokedAt),
    isNull(agencyInvitationTable.redeemedAt),
    gt(agencyInvitationTable.expiresAt, now),
  );
}

async function deliverInvitation({
  agencyId,
  invitationId,
  userId,
}: {
  agencyId: string;
  invitationId: string;
  userId: string;
}): Promise<{ emailSent: boolean }> {
  const db = getDB();
  const claimed = await db.withTransaction(async () => {
    await lockInvitationAdmin({ agencyId, userId });
    await db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`agency-invitation:${invitationId}`}, 0))`,
    );
    const now = new Date();
    const invitation = await db.query.agencyInvitationTable.findFirst({
      where: and(
        eq(agencyInvitationTable.id, invitationId),
        eq(agencyInvitationTable.agencyId, agencyId),
      ),
    });
    if (!invitation) throw new ZSAError("NOT_FOUND", "Invitation not found.");
    if (invitation.revokedAt || invitation.redeemedAt || invitation.expiresAt <= now)
      throw new ZSAError("PRECONDITION_FAILED", "This invitation is no longer available.");
    if (!invitation.recipientEmail || !invitation.deliveryRequest)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "This invitation has no email recipient. Share the code instead.",
      );
    if (
      invitation.deliveryAttempts > 0 &&
      now.getTime() - invitation.updatedAt.getTime() < RETRY_COOLDOWN_MS
    )
      throw new ZSAError(
        "TOO_MANY_REQUESTS",
        "Wait two minutes before sending this invitation again.",
      );
    if (
      invitation.deliveryStatus !== "sent" &&
      invitation.deliveryStartedAt &&
      now.getTime() - invitation.deliveryStartedAt.getTime() >= SAFE_RETRY_WINDOW_MS
    )
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "The previous delivery outcome is uncertain. Check the email provider before creating another invitation.",
      );

    const request = invitation.deliveryStartedAt
      ? invitation.deliveryRequest
      : completeAgencyInvitationEmailSender(invitation.deliveryRequest);
    const preflightError = getAgencyInvitationEmailPreflightError(request);
    const key =
      invitation.deliveryStatus === "sent"
        ? `agency-invitation/${randomUUID()}`
        : (invitation.deliveryKey ?? `agency-invitation/${randomUUID()}`);
    const [claim] = await db
      .update(agencyInvitationTable)
      .set({
        deliveryStatus: preflightError ? "failed" : "sending",
        deliveryAttempts: invitation.deliveryAttempts + 1,
        deliveryKey: key,
        deliveryRequest: request,
        deliveryStartedAt: preflightError
          ? invitation.deliveryStatus === "sent"
            ? null
            : invitation.deliveryStartedAt
          : invitation.deliveryStatus === "sent"
            ? now
            : (invitation.deliveryStartedAt ?? now),
        lastDeliveryError: preflightError,
        updatedAt: now,
      })
      .where(availableInvitation({ agencyId, invitationId, now }))
      .returning();
    if (!claim)
      throw new ZSAError("PRECONDITION_FAILED", "The invitation changed. Refresh the page.");
    return { invitation: claim, preflightError };
  });
  if (claimed.preflightError) return { emailSent: false };
  const invitation = claimed.invitation;
  for (let attempt = 0; attempt < MAX_AUTOMATIC_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const [reserved] = await db
        .update(agencyInvitationTable)
        .set({
          deliveryAttempts: sql`${agencyInvitationTable.deliveryAttempts} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            availableInvitation({ agencyId, invitationId, now: new Date() }),
            eq(agencyInvitationTable.deliveryStatus, "sending"),
            eq(agencyInvitationTable.deliveryKey, invitation.deliveryKey!),
          ),
        )
        .returning({ id: agencyInvitationTable.id });
      if (!reserved) return { emailSent: false };
    }
    try {
      // Network work runs after the short claim transaction has committed.
      const accepted = await sendAgencyInvitationEmail({
        request: invitation.deliveryRequest!,
        idempotencyKey: invitation.deliveryKey!,
      });
      await db
        .update(agencyInvitationTable)
        .set({
          deliveryStatus: "sent",
          sentAt: new Date(),
          providerMessageId: accepted.id,
          lastDeliveryError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agencyInvitationTable.id, invitationId),
            eq(agencyInvitationTable.agencyId, agencyId),
            eq(agencyInvitationTable.deliveryKey, invitation.deliveryKey!),
          ),
        );
      return { emailSent: true };
    } catch (error) {
      const failure = error as Partial<AgencyInvitationDeliveryError>;
      const delay = failure.retryAfterMs ?? 500 * 2 ** attempt;
      if (failure.retryable && attempt < MAX_AUTOMATIC_ATTEMPTS - 1 && delay <= 5_000) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      await db
        .update(agencyInvitationTable)
        .set({
          deliveryStatus: "failed",
          lastDeliveryError:
            failure.attempted === false
              ? "Invitation email could not be sent. Check the email configuration."
              : "Invitation email delivery was not confirmed. You can retry after two minutes.",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(agencyInvitationTable.id, invitationId),
            eq(agencyInvitationTable.agencyId, agencyId),
            eq(agencyInvitationTable.deliveryKey, invitation.deliveryKey!),
          ),
        );
      return { emailSent: false };
    }
  }
  return { emailSent: false };
}

export async function createAgencyInvitation({ email }: { email?: string } = {}) {
  const { session, staff } = await requireAgencyAdmin();
  const recipientEmail = email?.trim().toLowerCase() || null;
  if (recipientEmail && !z.string().email().safeParse(recipientEmail).success)
    throw new ZSAError("INPUT_PARSE_ERROR", "Enter a valid email address.");
  const db = getDB();
  const code = generateAgencyInviteCode();
  const expiresAt = new Date(Date.now() + AGENCY_INVITATION_LIFETIME_MS);
  const inviterName =
    [session.user.firstName, session.user.lastName].filter(Boolean).join(" ").trim() ||
    "Your agency admin";
  const invitation = await db.withTransaction(async () => {
    await lockInvitationAdmin({ agencyId: staff.agencyId, userId: session.userId });
    const agency = await db.query.agencyTable.findFirst({
      where: eq(agencyTable.id, staff.agencyId),
      columns: { name: true },
    });
    if (!agency) throw new ZSAError("NOT_FOUND", "Agency not found.");
    const request = recipientEmail
      ? createAgencyInvitationEmailRequest({
          email: recipientEmail,
          agencyName: agency.name,
          inviterName,
          code,
          expiresAt,
        })
      : null;
    const [created] = await db
      .insert(agencyInvitationTable)
      .values({
        agencyId: staff.agencyId,
        codeHash: hashAgencyInviteCode(code),
        recipientEmail,
        createdById: session.userId,
        expiresAt,
        deliveryRequest: request,
      })
      .returning({ id: agencyInvitationTable.id });
    return created;
  });
  const result = recipientEmail
    ? await deliverInvitation({
        agencyId: staff.agencyId,
        invitationId: invitation.id,
        userId: session.userId,
      })
    : { emailSent: false };
  return {
    invitationId: invitation.id,
    code,
    expiresAt: expiresAt.toISOString(),
    emailSent: result.emailSent,
  };
}

export async function resendAgencyInvitation({ invitationId }: { invitationId: string }) {
  const { session, staff } = await requireAgencyAdmin();
  return deliverInvitation({ agencyId: staff.agencyId, invitationId, userId: session.userId });
}

export async function revokeAgencyInvitation({ invitationId }: { invitationId: string }) {
  const { session, staff } = await requireAgencyAdmin();
  const db = getDB();
  await db.withTransaction(async () => {
    await lockInvitationAdmin({ agencyId: staff.agencyId, userId: session.userId });
    const now = new Date();
    const [invitation] = await db
      .update(agencyInvitationTable)
      .set({ revokedAt: now, updatedAt: now })
      .where(availableInvitation({ agencyId: staff.agencyId, invitationId, now }))
      .returning({ id: agencyInvitationTable.id });
    if (!invitation) throw new ZSAError("NOT_FOUND", "Active invitation not found.");
  });
  return { success: true };
}

export async function getAgencyInvitations() {
  const { staff } = await requireAgencyAdmin();
  const invitations = await getDB().query.agencyInvitationTable.findMany({
    where: eq(agencyInvitationTable.agencyId, staff.agencyId),
    columns: {
      id: true,
      recipientEmail: true,
      expiresAt: true,
      redeemedAt: true,
      revokedAt: true,
      deliveryStatus: true,
      lastDeliveryError: true,
      sentAt: true,
      updatedAt: true,
      deliveryAttempts: true,
    },
    orderBy: [desc(agencyInvitationTable.createdAt)],
    limit: 100,
  });
  return invitations.map(({ updatedAt, deliveryAttempts, ...invitation }) => ({
    ...invitation,
    expiresAt: invitation.expiresAt.toISOString(),
    redeemedAt: invitation.redeemedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    sentAt: invitation.sentAt?.toISOString() ?? null,
    retryAvailableAt: deliveryAttempts
      ? new Date(updatedAt.getTime() + RETRY_COOLDOWN_MS).toISOString()
      : null,
  }));
}
