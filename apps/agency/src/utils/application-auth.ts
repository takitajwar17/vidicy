import "server-only";
import { cache } from "react";
import type { SessionValidationResult } from "@/types";
import { getSessionFromCookie, requireVerifiedEmail } from "./auth";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  visaApplicationTable,
  APPLICATION_PERMISSIONS,
  AGENCY_STAFF_ROLE,
} from "@/db/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { ensureAgencyTeamMembership } from "@/server/agency-team";

const AGENCY_STAFF_PERMISSIONS: Record<string, readonly string[]> = {
  [AGENCY_STAFF_ROLE.ADMIN]: [
    APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    APPLICATION_PERMISSIONS.INVITE_MEMBERS,
    APPLICATION_PERMISSIONS.REMOVE_MEMBERS,
    APPLICATION_PERMISSIONS.CHANGE_MEMBER_ROLES,
    APPLICATION_PERMISSIONS.EDIT_APPLICATION_SETTINGS,
    APPLICATION_PERMISSIONS.DELETE_APPLICATION,
    APPLICATION_PERMISSIONS.CREATE_COMPONENTS,
    APPLICATION_PERMISSIONS.EDIT_COMPONENTS,
    APPLICATION_PERMISSIONS.DELETE_COMPONENTS,
  ],
  [AGENCY_STAFF_ROLE.MEMBER]: [
    APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    APPLICATION_PERMISSIONS.CREATE_COMPONENTS,
    APPLICATION_PERMISSIONS.EDIT_COMPONENTS,
    APPLICATION_PERMISSIONS.DELETE_COMPONENTS,
  ],
};

/**
 * Core access resolver — shared by the three exported helpers.
 * Active agency staff can access the shared case queue according to their
 * agency role. There is no per-application membership model here.
 * Returns { hasAccess, session } without throwing.
 */
const resolveAccessForSession = async (
  session: SessionValidationResult,
  applicationId: string,
  permission?: string,
) => {
  if (!session) return { hasAccess: false, session: null } as const;

  const db = getDB();
  const app = await db.query.visaApplicationTable.findFirst({
    where: and(
      eq(visaApplicationTable.id, applicationId),
      isNull(visaApplicationTable.trashedAt),
      isNotNull(visaApplicationTable.clientId),
    ),
    columns: { id: true },
  });

  if (!app) return { hasAccess: false, session } as const;

  const agencyStaff = await ensureAgencyTeamMembership(session);

  if (agencyStaff) {
    if (!permission) {
      return { hasAccess: true, session } as const;
    }

    const staffPermissions = AGENCY_STAFF_PERMISSIONS[agencyStaff.role] ?? [];

    if (staffPermissions.includes(permission)) {
      return { hasAccess: true, session } as const;
    }
  }

  return { hasAccess: false, session } as const;
};

const resolveAccess = cache(async (applicationId: string, permission?: string) => {
  const session = await requireVerifiedEmail({ doNotThrowError: true });
  return resolveAccessForSession(session, applicationId, permission);
});

export const getApplicationAccessForCurrentSession = cache(
  async (applicationId: string, permission?: string) => {
    const session = await getSessionFromCookie();
    return resolveAccessForSession(session, applicationId, permission);
  },
);

/**
 * Check if the current user can access the given agency case.
 * Returns { hasAccess: boolean, session? }.
 */
export const hasApplicationMembership = cache(async (applicationId: string) => {
  const { hasAccess, session } = await resolveAccess(applicationId);
  return {
    hasAccess,
    session: hasAccess && session ? session : undefined,
  };
});

/**
 * Returns true if the current user has the given permission on the application.
 * Agency staff permissions are defined by their role on agency case records.
 */
export const hasApplicationPermission = cache(
  async (applicationId: string, permission?: string) => {
    const { hasAccess } = await resolveAccess(applicationId, permission);
    return hasAccess;
  },
);

/**
 * Throws if the current user does not have the given permission on the application.
 * Throws NOT_AUTHORIZED if unauthenticated, FORBIDDEN if no access or insufficient role.
 */
export const requireApplicationPermission = cache(
  async (applicationId: string, permission?: string) => {
    const { hasAccess, session } = await resolveAccess(applicationId, permission);

    if (!session) {
      // Delegate to requireVerifiedEmail so unauthenticated vs unverified email
      // users each get the right error message and error code.
      await requireVerifiedEmail();
      throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");
    }

    if (!hasAccess) {
      throw new ZSAError("FORBIDDEN", "You don't have access to this application");
    }

	    return session;
	  },
	);
