import "server-only";
import { cache } from "react";
import type { SessionValidationResult } from "@/types";
import { getSessionFromCookie, requireVerifiedEmail } from "./auth";
import { ZSAError } from "zsa";
import { getDB } from "@/db";
import {
  visaApplicationTable,
  applicantTable,
  applicationMembershipTable,
  applicationRoleTable,
  APPLICATION_PERMISSIONS,
  APPLICANT_ROLE,
  PAYMENT_STATUS,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

// Predefined permission sets for built-in system roles.
// DELETE_APPLICATION is owner-only and is intentionally absent from all system roles.
const SYSTEM_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  viewer: [APPLICATION_PERMISSIONS.ACCESS_APPLICATION],
  editor: [
    APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    APPLICATION_PERMISSIONS.CREATE_COMPONENTS,
    APPLICATION_PERMISSIONS.EDIT_COMPONENTS,
    APPLICATION_PERMISSIONS.DELETE_COMPONENTS,
  ],
  admin: [
    APPLICATION_PERMISSIONS.ACCESS_APPLICATION,
    APPLICATION_PERMISSIONS.INVITE_MEMBERS,
    APPLICATION_PERMISSIONS.REMOVE_MEMBERS,
    APPLICATION_PERMISSIONS.CHANGE_MEMBER_ROLES,
    APPLICATION_PERMISSIONS.EDIT_APPLICATION_SETTINGS,
    APPLICATION_PERMISSIONS.CREATE_ROLES,
    APPLICATION_PERMISSIONS.EDIT_ROLES,
    APPLICATION_PERMISSIONS.DELETE_ROLES,
    APPLICATION_PERMISSIONS.ASSIGN_ROLES,
    APPLICATION_PERMISSIONS.CREATE_COMPONENTS,
    APPLICATION_PERMISSIONS.EDIT_COMPONENTS,
    APPLICATION_PERMISSIONS.DELETE_COMPONENTS,
  ],
};

const APPLICANT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  [APPLICANT_ROLE.GUEST]: SYSTEM_ROLE_PERMISSIONS.viewer,
  [APPLICANT_ROLE.MEMBER]: SYSTEM_ROLE_PERMISSIONS.editor,
  [APPLICANT_ROLE.ADMIN]: SYSTEM_ROLE_PERMISSIONS.admin,
};

/**
 * Core access resolver — shared by the three exported helpers.
 * Owners (app.userId === session.userId) have all permissions.
 * Active members' permissions come from their system or custom role.
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
    where: eq(visaApplicationTable.id, applicationId),
    columns: { userId: true },
  });

  if (!app) return { hasAccess: false, session } as const;

  // Owners have unrestricted access to all permissions
  if (app.userId === session.userId) {
    return { hasAccess: true, session } as const;
  }

  const linkedApplicant = await db.query.applicantTable.findFirst({
    where: and(
      eq(applicantTable.applicationId, applicationId),
      eq(applicantTable.userId, session.userId),
    ),
    columns: { role: true },
  });

  if (linkedApplicant) {
    if (!permission || linkedApplicant.role === APPLICANT_ROLE.OWNER) {
      return { hasAccess: true, session } as const;
    }

    const applicantPermissions = APPLICANT_ROLE_PERMISSIONS[linkedApplicant.role] ?? [];

    if (applicantPermissions.includes(permission)) {
      return { hasAccess: true, session } as const;
    }
  }

  // Check for an active membership record for this user on this application
  const membership = await db.query.applicationMembershipTable.findFirst({
    where: and(
      eq(applicationMembershipTable.applicationId, applicationId),
      eq(applicationMembershipTable.userId, session.userId),
      eq(applicationMembershipTable.isActive, 1),
    ),
  });

  if (!membership) return { hasAccess: false, session } as const;

  // No specific permission required — membership alone is sufficient
  if (!permission) return { hasAccess: true, session } as const;

  // Resolve the member's permission set from their role
  let memberPermissions: readonly string[];

  if (membership.isSystemRole) {
    memberPermissions = SYSTEM_ROLE_PERMISSIONS[membership.roleId] ?? [];
  } else {
    // Custom role — fetch permissions from DB
    const role = await db.query.applicationRoleTable.findFirst({
      where: and(
        eq(applicationRoleTable.id, membership.roleId),
        eq(applicationRoleTable.applicationId, applicationId),
      ),
      columns: { permissions: true },
    });
    memberPermissions = role?.permissions ?? [];
  }

  const hasAccess = memberPermissions.includes(permission);
  return { hasAccess, session } as const;
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
 * Check if the current user owns or has an active membership on the given application.
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
 * Owners have all permissions; members' permissions are defined by their role.
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

/**
 * Throws unless the current user owns the application.
 * Use for billing and other owner-only operations.
 */
export const requireApplicationOwner = cache(async (applicationId: string) => {
  const session = await requireVerifiedEmail();
  if (!session) {
    throw new ZSAError("NOT_AUTHORIZED", "Not authenticated");
  }

  const db = getDB();
  const app = await db.query.visaApplicationTable.findFirst({
    where: eq(visaApplicationTable.id, applicationId),
    columns: { userId: true },
  });

  if (!app) {
    throw new ZSAError("NOT_FOUND", "Application not found");
  }

  if (app.userId !== session.userId) {
    throw new ZSAError("FORBIDDEN", "Only the application owner can manage billing");
  }

  return { session, app };
});

// ---------------------------------------------------------------------------
// Free-trial state predicates
// ---------------------------------------------------------------------------

interface TrialAppFields {
  isFreeTrialApp: boolean;
  paymentStatus: string;
  freeEvaluationUsed?: boolean | null;
}

/**
 * True when the app is a free-trial app that has not yet paid.
 * Gate for: adding extra applicants, Atlas chat, applicant quota checks.
 */
export function isTrialLocked(app: TrialAppFields): boolean {
  return app.isFreeTrialApp && app.paymentStatus !== PAYMENT_STATUS.PAID;
}

/**
 * True when the app is a free-trial app whose one included evaluation has
 * already been used. Gate for: re-run button lock, "Unlock full analysis" card.
 */
export function isEvalLocked(app: TrialAppFields): boolean {
  return app.isFreeTrialApp && (app.freeEvaluationUsed ?? false);
}
