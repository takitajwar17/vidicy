import "server-only";

import { cache } from "react";
import { count, eq } from "drizzle-orm";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  AGENCY_STAFF_ROLE,
  AGENCY_STAFF_STATUS,
  agencyTeamMemberTable,
  agencyTable,
} from "@/db/schema";
import { requireVerifiedEmail } from "@/utils/auth";
import type { SessionValidationResult } from "@/types";
import { provisionAgencyMembership } from "./agency-provisioning";

export interface AgencyStaffContext {
  agencyId: string;
  role: (typeof AGENCY_STAFF_ROLE)[keyof typeof AGENCY_STAFF_ROLE];
  isAdmin: boolean;
}

function getSessionUser(session: NonNullable<SessionValidationResult>) {
  return session.user;
}

export async function ensureAgencyTeamMembership(
  session: NonNullable<SessionValidationResult>,
): Promise<AgencyStaffContext | null> {
  const db = getDB();
  const user = getSessionUser(session);

  if (!user.emailVerified) return null;

  const existing = await db.query.agencyTeamMemberTable.findFirst({
    where: eq(agencyTeamMemberTable.userId, user.id),
    columns: { id: true, role: true, status: true, agencyId: true },
  });

  if (existing?.status === AGENCY_STAFF_STATUS.ACTIVE && existing.agencyId) {
    const role = existing.role as AgencyStaffContext["role"];
    return {
      agencyId: existing.agencyId,
      role,
      isAdmin: role === AGENCY_STAFF_ROLE.ADMIN,
    };
  }

  if (existing && existing.status !== AGENCY_STAFF_STATUS.ACTIVE) {
    return null;
  }

  // New accounts must choose Create or Join. Only repair pre-existing records.
  if (!existing) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return provisionAgencyMembership({
    userId: user.id,
    email: user.email?.trim().toLowerCase() ?? null,
    name: name ? `${name}'s agency` : "My agency",
  });
}

export const getAgencyStaffContextForSession = cache(
  async (session: NonNullable<SessionValidationResult>) => ensureAgencyTeamMembership(session),
);

export const requireAgencyStaff = cache(async () => {
  const session = await requireVerifiedEmail();
  if (!session) {
    throw new ZSAError("NOT_AUTHORIZED", "Not authenticated.");
  }
  const staff = await ensureAgencyTeamMembership(session);

  if (!staff) {
    throw new ZSAError("FORBIDDEN", "You are not a member of this agency workspace.");
  }

  return { session, staff };
});

export const requireAgencyAdmin = cache(async () => {
  const { session, staff } = await requireAgencyStaff();

  if (!staff.isAdmin) {
    throw new ZSAError("FORBIDDEN", "Only agency admins can perform this action.");
  }

  return { session, staff };
});

export async function hasActiveAgencyTeamMembers() {
  const db = getDB();
  const [result] = await db
    .select({ total: count() })
    .from(agencyTeamMemberTable)
    .where(eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE));

  return (result?.total ?? 0) > 0;
}

// This reveals only the signed-in user's own disabled membership.
export async function getDisabledAgencyMembershipForSession(
  session: NonNullable<SessionValidationResult>,
) {
  if (!session.user.emailVerified) return null;
  const db = getDB();
  const membership = await db.query.agencyTeamMemberTable.findFirst({
    where: eq(agencyTeamMemberTable.userId, session.user.id),
  });
  if (!membership || membership.status === AGENCY_STAFF_STATUS.ACTIVE) return null;
  const agency = membership.agencyId
    ? await db.query.agencyTable.findFirst({
        where: eq(agencyTable.id, membership.agencyId),
        columns: { name: true },
      })
    : null;
  return { agencyName: agency?.name ?? "your previous agency" };
}
