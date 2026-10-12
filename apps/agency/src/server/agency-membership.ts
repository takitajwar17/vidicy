import "server-only";

import { and, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  agencyTable,
  agencyTeamMemberTable,
  agencyInvitationTable,
  agencyClientTable,
  visaApplicationTable,
  reviewIssueTable,
  userTable,
  AGENCY_STAFF_ROLE,
  AGENCY_STAFF_STATUS,
} from "@/db/schema";
import { requireVerifiedEmail } from "@/utils/auth";
import { requireAgencyAdmin, requireAgencyStaff } from "./agency-team";
import { provisionAgencyMembership } from "./agency-provisioning";
import { hashAgencyInviteCode, isAgencyInviteCodeValid } from "@/lib/agency-invite-code";
import { checkActionRateLimit } from "@/infra/action-rate-limit";

async function verifiedSession() {
  const session = await requireVerifiedEmail();
  if (!session?.user.emailVerified)
    throw new ZSAError("NOT_AUTHORIZED", "Verify your email before you continue.");
  return session;
}

// Call only within a transaction. Agency mutations share this lock with leave,
// ownership transfer, and staff changes, then check current access again.
async function lockAgencyAccess({
  agencyId,
  userId,
  admin = false,
  allowDisabled = false,
}: {
  agencyId: string;
  userId: string;
  admin?: boolean;
  allowDisabled?: boolean;
}) {
  const db = getDB();
  await db.execute(sql`select id from ${agencyTable} where id = ${agencyId} for update`);
  const agency = await db.query.agencyTable.findFirst({ where: eq(agencyTable.id, agencyId) });
  const member = await db.query.agencyTeamMemberTable.findFirst({
    where: and(
      eq(agencyTeamMemberTable.agencyId, agencyId),
      eq(agencyTeamMemberTable.userId, userId),
      allowDisabled ? undefined : eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
    ),
  });
  if (!agency || !member || (admin && member.role !== AGENCY_STAFF_ROLE.ADMIN))
    throw new ZSAError("FORBIDDEN", "Your agency access has changed. Refresh the page.");
  return { agency, member };
}

export async function createAgency({ name }: { name: string }) {
  const session = await verifiedSession();
  const agencyName = name.trim();
  if (!agencyName || agencyName.length > 120)
    throw new ZSAError("INPUT_PARSE_ERROR", "Enter an agency name with 1 to 120 characters.");
  await checkActionRateLimit("agency-create", session.user.id, 10);
  const staff = await provisionAgencyMembership({
    userId: session.user.id,
    email: session.user.email?.trim().toLowerCase() ?? null,
    name: agencyName,
    requireNew: true,
  });
  if (!staff)
    throw new ZSAError(
      "CONFLICT",
      "You already belong to an agency or your access is disabled. Leave your current agency before creating another.",
    );
  return { success: true as const, agencyId: staff.agencyId };
}

async function findJoinableInvitation({
  code,
  userId,
  email,
}: {
  code: string;
  userId: string;
  email: string | null;
}) {
  const db = getDB();
  if (!isAgencyInviteCodeValid(code))
    throw new ZSAError(
      "INPUT_PARSE_ERROR",
      "This invite code is invalid, expired, cancelled, or already used.",
    );
  const membership = await db.query.agencyTeamMemberTable.findFirst({
    where: eq(agencyTeamMemberTable.userId, userId),
  });
  if (membership)
    throw new ZSAError(
      "CONFLICT",
      "Leave your current agency before joining another. Contact your admin if your access is disabled.",
    );
  const invitation = await db.query.agencyInvitationTable.findFirst({
    where: and(
      eq(agencyInvitationTable.codeHash, hashAgencyInviteCode(code)),
      isNull(agencyInvitationTable.redeemedAt),
      isNull(agencyInvitationTable.revokedAt),
      gt(agencyInvitationTable.expiresAt, new Date()),
    ),
  });
  if (
    !invitation ||
    (invitation.recipientEmail && invitation.recipientEmail !== email?.trim().toLowerCase())
  )
    throw new ZSAError(
      "FORBIDDEN",
      "This invite code is invalid, expired, cancelled, already used, or intended for another email address.",
    );
  return invitation;
}

export async function previewAgencyInvite({ code }: { code: string }) {
  const session = await verifiedSession();
  await checkActionRateLimit("agency-invite-check", session.user.id, 20);
  const invitation = await findJoinableInvitation({
    code,
    userId: session.user.id,
    email: session.user.email,
  });
  const agency = await getDB().query.agencyTable.findFirst({
    where: eq(agencyTable.id, invitation.agencyId),
  });
  if (!agency) throw new ZSAError("NOT_FOUND", "Agency not found.");
  return { agencyName: agency.name, expiresAt: invitation.expiresAt.toISOString() };
}

export async function joinAgency({ code }: { code: string }) {
  const session = await verifiedSession();
  await checkActionRateLimit("agency-join", session.user.id, 20);
  const db = getDB();
  return db.withTransaction(async () => {
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${session.user.id}, 0))`);
    const invitation = await findJoinableInvitation({
      code,
      userId: session.user.id,
      email: session.user.email,
    });
    await db.execute(
      sql`select id from ${agencyTable} where id = ${invitation.agencyId} for update`,
    );
    const now = new Date();
    const [redeemed] = await db
      .update(agencyInvitationTable)
      .set({ redeemedAt: now, redeemedById: session.user.id })
      .where(
        and(
          eq(agencyInvitationTable.id, invitation.id),
          isNull(agencyInvitationTable.redeemedAt),
          isNull(agencyInvitationTable.revokedAt),
          gt(agencyInvitationTable.expiresAt, now),
        ),
      )
      .returning();
    if (!redeemed)
      throw new ZSAError(
        "CONFLICT",
        "This invite code has expired, was cancelled, or has already been used.",
      );
    const email = session.user.email?.trim().toLowerCase() ?? null;
    if (email)
      await db
        .delete(agencyTeamMemberTable)
        .where(and(eq(agencyTeamMemberTable.email, email), isNull(agencyTeamMemberTable.userId)));
    await db.insert(agencyTeamMemberTable).values({
      agencyId: invitation.agencyId,
      userId: session.user.id,
      email,
      role: AGENCY_STAFF_ROLE.MEMBER,
      status: AGENCY_STAFF_STATUS.ACTIVE,
      invitedBy: invitation.createdById,
      invitedAt: invitation.createdAt,
      joinedAt: now,
    });
    return { success: true as const, agencyId: invitation.agencyId };
  });
}

export async function getAgencySettingsData() {
  const { session, staff } = await requireAgencyStaff();
  const db = getDB();
  const agency = await db.query.agencyTable.findFirst({
    where: eq(agencyTable.id, staff.agencyId),
  });
  if (!agency) throw new ZSAError("NOT_FOUND", "Agency not found.");
  const members = await db
    .select({
      id: agencyTeamMemberTable.id,
      userId: agencyTeamMemberTable.userId,
      email: agencyTeamMemberTable.email,
      role: agencyTeamMemberTable.role,
      firstName: userTable.firstName,
      lastName: userTable.lastName,
    })
    .from(agencyTeamMemberTable)
    .leftJoin(userTable, eq(userTable.id, agencyTeamMemberTable.userId))
    .where(
      and(
        eq(agencyTeamMemberTable.agencyId, staff.agencyId),
        eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
      ),
    );
  const [[cases], [clients]] = await Promise.all([
    db
      .select({ total: count() })
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.agencyId, staff.agencyId)),
    db
      .select({ total: count() })
      .from(agencyClientTable)
      .where(eq(agencyClientTable.agencyId, staff.agencyId)),
  ]);
  return {
    agency: { id: agency.id, name: agency.name, ownerUserId: agency.ownerUserId },
    staff,
    session,
    members: members.map(({ firstName, lastName, ...member }) => ({
      ...member,
      name: [firstName, lastName].filter(Boolean).join(" ").trim() || member.email || "Member",
    })),
    isOwner: agency.ownerUserId === session.user.id,
    canDeleteAgency: cases.total === 0 && clients.total === 0,
  };
}

export async function updateAgencySettings({ name }: { name: string }) {
  const { session, staff } = await requireAgencyAdmin();
  const agencyName = name.trim();
  if (!agencyName || agencyName.length > 120)
    throw new ZSAError("INPUT_PARSE_ERROR", "Enter an agency name with 1 to 120 characters.");
  const db = getDB();
  await db.withTransaction(async () => {
    await lockAgencyAccess({ agencyId: staff.agencyId, userId: session.user.id, admin: true });
    await db
      .update(agencyTable)
      .set({ name: agencyName })
      .where(eq(agencyTable.id, staff.agencyId));
  });
  return { success: true as const };
}

export async function transferAgencyOwnership({ memberId }: { memberId: string }) {
  const { session, staff } = await requireAgencyAdmin();
  const db = getDB();
  return db.withTransaction(async () => {
    const { agency } = await lockAgencyAccess({
      agencyId: staff.agencyId,
      userId: session.user.id,
      admin: true,
    });
    if (agency?.ownerUserId !== session.user.id)
      throw new ZSAError("FORBIDDEN", "Only the agency owner can transfer ownership.");
    const member = await db.query.agencyTeamMemberTable.findFirst({
      where: and(
        eq(agencyTeamMemberTable.id, memberId),
        eq(agencyTeamMemberTable.agencyId, staff.agencyId),
        eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
      ),
    });
    if (!member?.userId || member.userId === session.user.id)
      throw new ZSAError("INPUT_PARSE_ERROR", "Choose another active member of this agency.");
    await db
      .update(agencyTeamMemberTable)
      .set({ role: AGENCY_STAFF_ROLE.ADMIN })
      .where(eq(agencyTeamMemberTable.id, member.id));
    await db
      .update(agencyTable)
      .set({ ownerUserId: member.userId })
      .where(eq(agencyTable.id, staff.agencyId));
    return { success: true as const };
  });
}

export async function leaveAgency() {
  const session = await verifiedSession();
  const db = getDB();
  return db.withTransaction(async () => {
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${session.user.id}, 0))`);
    const membership = await db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.userId, session.user.id),
    });
    if (!membership) throw new ZSAError("FORBIDDEN", "You are not a member of an agency.");
    if (!membership.agencyId) {
      if (membership.status === AGENCY_STAFF_STATUS.ACTIVE)
        throw new ZSAError("FORBIDDEN", "Refresh the page before leaving this agency.");
      await db.delete(agencyTeamMemberTable).where(eq(agencyTeamMemberTable.id, membership.id));
      return { success: true as const };
    }
    const staff = { agencyId: membership.agencyId };
    const { agency, member } = await lockAgencyAccess({
      agencyId: staff.agencyId,
      userId: session.user.id,
      allowDisabled: true,
    });
    if (agency.ownerUserId === session.user.id)
      throw new ZSAError("FORBIDDEN", "Transfer agency ownership before you leave.");
    if (member.status === AGENCY_STAFF_STATUS.ACTIVE && member.role === AGENCY_STAFF_ROLE.ADMIN) {
      const [admins] = await db
        .select({ total: count() })
        .from(agencyTeamMemberTable)
        .where(
          and(
            eq(agencyTeamMemberTable.agencyId, staff.agencyId),
            eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
            eq(agencyTeamMemberTable.role, AGENCY_STAFF_ROLE.ADMIN),
          ),
        );
      if (admins.total <= 1)
        throw new ZSAError("FORBIDDEN", "Assign another admin before you leave.");
    }
    await db
      .update(visaApplicationTable)
      .set({ assignedReviewerId: agency?.ownerUserId ?? null })
      .where(
        and(
          eq(visaApplicationTable.agencyId, staff.agencyId),
          eq(visaApplicationTable.assignedReviewerId, session.user.id),
          isNull(visaApplicationTable.finalSubmissionAt),
        ),
      );
    const agencyCaseIds = db
      .select({ id: visaApplicationTable.id })
      .from(visaApplicationTable)
      .where(eq(visaApplicationTable.agencyId, staff.agencyId));
    await db
      .update(reviewIssueTable)
      .set({ assignedToId: agency?.ownerUserId ?? null })
      .where(
        and(
          eq(reviewIssueTable.assignedToId, session.user.id),
          inArray(reviewIssueTable.status, ["open", "client_requested"]),
          sql`${reviewIssueTable.applicationId} in (${agencyCaseIds})`,
        ),
      );
    await db.delete(agencyTeamMemberTable).where(eq(agencyTeamMemberTable.id, member.id));
    return { success: true as const };
  });
}

export async function deleteEmptyAgency() {
  const { session, staff } = await requireAgencyAdmin();
  const db = getDB();
  return db.withTransaction(async () => {
    const { agency } = await lockAgencyAccess({
      agencyId: staff.agencyId,
      userId: session.user.id,
      admin: true,
    });
    if (agency?.ownerUserId !== session.user.id)
      throw new ZSAError("FORBIDDEN", "Only the agency owner can delete the agency.");
    const [[cases], [clients]] = await Promise.all([
      db
        .select({ total: count() })
        .from(visaApplicationTable)
        .where(eq(visaApplicationTable.agencyId, staff.agencyId)),
      db
        .select({ total: count() })
        .from(agencyClientTable)
        .where(eq(agencyClientTable.agencyId, staff.agencyId)),
    ]);
    if (cases.total || clients.total)
      throw new ZSAError(
        "PRECONDITION_FAILED",
        "Only an empty agency can be deleted. Keep existing agency records.",
      );
    await db.delete(agencyTable).where(eq(agencyTable.id, staff.agencyId));
    return { success: true as const };
  });
}
