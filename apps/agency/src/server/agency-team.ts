import "server-only";

import { cache } from "react";
import { count, eq } from "drizzle-orm";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  AGENCY_STAFF_ROLE,
  AGENCY_STAFF_STATUS,
  agencyTeamMemberTable,
  ROLES_ENUM,
} from "@/db/schema";
import { requireVerifiedEmail } from "@/utils/auth";
import type { SessionValidationResult } from "@/types";

export interface AgencyStaffContext {
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

	  const existing = await db.query.agencyTeamMemberTable.findFirst({
	    where: eq(agencyTeamMemberTable.userId, user.id),
	    columns: { id: true, role: true, status: true },
	  });

  if (existing?.status === AGENCY_STAFF_STATUS.ACTIVE) {
    const role = existing.role as AgencyStaffContext["role"];
    return {
      role,
      isAdmin: role === AGENCY_STAFF_ROLE.ADMIN || user.role === ROLES_ENUM.ADMIN,
    };
  }

	  if (existing) {
	    return null;
	  }

	  const email = user.email?.trim().toLowerCase();
	  const accessGrant = email
	    ? await db.query.agencyTeamMemberTable.findFirst({
	        where: eq(agencyTeamMemberTable.email, email),
	        columns: { id: true, role: true, status: true, userId: true },
	      })
	    : null;

	  if (accessGrant?.status === AGENCY_STAFF_STATUS.ACTIVE) {
	    const role = accessGrant.role as AgencyStaffContext["role"];
	    await db
	      .update(agencyTeamMemberTable)
	      .set({
	        userId: user.id,
	        ...(accessGrant.userId ? {} : { joinedAt: new Date() }),
	        updatedAt: new Date(),
	      })
	      .where(eq(agencyTeamMemberTable.id, accessGrant.id));

	    return {
	      role,
	      isAdmin: role === AGENCY_STAFF_ROLE.ADMIN || user.role === ROLES_ENUM.ADMIN,
	    };
	  }

	  if (accessGrant) {
	    return null;
	  }

	  const [teamCount] = await db.select({ total: count() }).from(agencyTeamMemberTable);

	  if ((teamCount?.total ?? 0) === 0) {
	    await db.insert(agencyTeamMemberTable).values({
	      userId: user.id,
	      email: email ?? user.id,
	      role: AGENCY_STAFF_ROLE.ADMIN,
	      status: AGENCY_STAFF_STATUS.ACTIVE,
	      joinedAt: new Date(),
	    });

	    return { role: AGENCY_STAFF_ROLE.ADMIN, isAdmin: true };
	  }

	  if (user.role === ROLES_ENUM.ADMIN) {
	    await db.insert(agencyTeamMemberTable).values({
	      userId: user.id,
	      email: email ?? user.id,
	      role: AGENCY_STAFF_ROLE.ADMIN,
	      status: AGENCY_STAFF_STATUS.ACTIVE,
	      joinedAt: new Date(),
    });

    return { role: AGENCY_STAFF_ROLE.ADMIN, isAdmin: true };
  }

  return null;
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
