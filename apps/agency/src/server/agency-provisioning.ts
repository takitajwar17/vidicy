import "server-only";

import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { getDB } from "@/db";
import {
  agencyTable,
  agencyTeamMemberTable,
  agencyClientTable,
  visaApplicationTable,
  AGENCY_STAFF_ROLE,
  AGENCY_STAFF_STATUS,
} from "@/db/schema";
import type { AgencyStaffContext } from "./agency-team";

interface ProvisionAgencyParams {
  userId: string;
  email: string | null;
  name: string;
  requireNew?: boolean;
}

function membershipContext({
  agencyId,
  role,
}: {
  agencyId: string;
  role: string;
}): AgencyStaffContext {
  const agencyRole =
    role === AGENCY_STAFF_ROLE.ADMIN ? AGENCY_STAFF_ROLE.ADMIN : AGENCY_STAFF_ROLE.MEMBER;
  return { agencyId, role: agencyRole, isAdmin: agencyRole === AGENCY_STAFF_ROLE.ADMIN };
}

// The lock makes simultaneous layout/page requests create one workspace only.
export async function provisionAgencyMembership({
  userId,
  email,
  name,
  requireNew = false,
}: ProvisionAgencyParams): Promise<AgencyStaffContext | null> {
  const db = getDB();
  return db.withTransaction(async () => {
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
    const membership = await db.query.agencyTeamMemberTable.findFirst({
      where: eq(agencyTeamMemberTable.userId, userId),
    });
    if (membership && membership.status !== AGENCY_STAFF_STATUS.ACTIVE) return null;
    if (membership?.agencyId)
      return requireNew
        ? null
        : membershipContext({ agencyId: membership.agencyId, role: membership.role });

    const invitation =
      !membership && email
        ? await db.query.agencyTeamMemberTable.findFirst({
            where: eq(agencyTeamMemberTable.email, email),
          })
        : null;
    if (
      invitation &&
      (invitation.status !== AGENCY_STAFF_STATUS.ACTIVE ||
        (invitation.userId && invitation.userId !== userId))
    )
      return null;
    // An email match is not acceptance. Scoped invitations need a code.
    if (invitation?.agencyId) {
      await db
        .delete(agencyTeamMemberTable)
        .where(
          and(eq(agencyTeamMemberTable.id, invitation.id), isNull(agencyTeamMemberTable.userId)),
        );
    }

    await db
      .insert(agencyTable)
      .values({ ownerUserId: userId, name })
      .onConflictDoNothing({ target: agencyTable.ownerUserId });
    const agency = await db.query.agencyTable.findFirst({
      where: eq(agencyTable.ownerUserId, userId),
    });
    if (!agency) throw new Error("Failed to create agency");
    const existing = membership ?? (invitation?.agencyId ? null : invitation);
    const owner = {
      userId,
      email,
      agencyId: agency.id,
      role: AGENCY_STAFF_ROLE.ADMIN,
      status: AGENCY_STAFF_STATUS.ACTIVE,
      joinedAt: new Date(),
    };
    if (existing) {
      await db
        .update(agencyTeamMemberTable)
        .set({ ...owner, updatedAt: new Date() })
        .where(eq(agencyTeamMemberTable.id, existing.id));
    } else {
      await db.insert(agencyTeamMemberTable).values(owner);
    }

    // Legacy cases belong to their recorded creator. Global client rows are
    // copied so two creators never share a mutable client record after migration.
    const legacyCases = await db.query.visaApplicationTable.findMany({
      where: and(
        eq(visaApplicationTable.userId, userId),
        isNull(visaApplicationTable.agencyId),
        isNotNull(visaApplicationTable.clientId),
      ),
    });
    const clients = new Map<string, string>();
    for (const application of legacyCases) {
      const oldClientId = application.clientId!;
      let clientId = clients.get(oldClientId);
      if (!clientId) {
        const oldClient = await db.query.agencyClientTable.findFirst({
          where: eq(agencyClientTable.id, oldClientId),
        });
        const [client] = await db
          .insert(agencyClientTable)
          .values({
            agencyId: agency.id,
            name: oldClient?.name ?? application.clientName ?? "Client",
            email: oldClient?.email ?? application.clientEmail,
            phone: oldClient?.phone ?? application.clientPhone,
            companyName: oldClient?.companyName,
            country: oldClient?.country,
            notes: oldClient?.notes,
          })
          .returning();
        clientId = client.id;
        clients.set(oldClientId, clientId);
      }
      await db
        .update(visaApplicationTable)
        .set({
          agencyId: agency.id,
          clientId,
          assignedReviewerId: application.assignedReviewerId === userId ? userId : null,
        })
        .where(
          and(eq(visaApplicationTable.id, application.id), isNull(visaApplicationTable.agencyId)),
        );
    }

    return { agencyId: agency.id, role: AGENCY_STAFF_ROLE.ADMIN, isAdmin: true };
  });
}
