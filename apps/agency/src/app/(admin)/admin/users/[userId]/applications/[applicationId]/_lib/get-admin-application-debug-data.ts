import "server-only"

import { cache } from "react"
import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { getDB } from "@/db"
import {
  applicantTable,
  applicationInvitationTable,
  applicationMembershipTable,
  applicationRoleTable,
  checklistItemTable,
  chatConversationTable,
  chatMessageTable,
  documentEvaluationTable,
  uploadedDocumentTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema"
import { requireAdmin } from "@/utils/auth"

export const getAdminApplicationDebugData = cache(
  async ({ userId, applicationId }: { userId: string; applicationId: string }) => {
    await requireAdmin()

    const db = getDB()

    const [owner, application] = await Promise.all([
      db.query.userTable.findFirst({
        where: eq(userTable.id, userId),
        columns: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          emailVerified: true,
        },
      }),
      db.query.visaApplicationTable.findFirst({
        where: and(
          eq(visaApplicationTable.id, applicationId),
          eq(visaApplicationTable.userId, userId),
        ),
      }),
    ])

    if (!owner || !application) {
      return null
    }

    const [
      applicants,
      checklistItems,
      uploadedDocuments,
      evaluations,
      conversations,
      recentMessages,
      memberships,
      roles,
      invitations,
    ] = await Promise.all([
      db.query.applicantTable.findMany({
        where: eq(applicantTable.applicationId, applicationId),
        orderBy: [asc(applicantTable.createdAt)],
      }),
      db.query.checklistItemTable.findMany({
        where: eq(checklistItemTable.applicationId, applicationId),
        orderBy: [asc(checklistItemTable.sortOrder), asc(checklistItemTable.createdAt)],
      }),
      db.query.uploadedDocumentTable.findMany({
        where: eq(uploadedDocumentTable.applicationId, applicationId),
        orderBy: [desc(uploadedDocumentTable.uploadedAt)],
      }),
      db.query.documentEvaluationTable.findMany({
        where: eq(documentEvaluationTable.applicationId, applicationId),
        orderBy: [desc(documentEvaluationTable.createdAt)],
      }),
      db.query.chatConversationTable.findMany({
        where: eq(chatConversationTable.applicationId, applicationId),
        orderBy: [desc(chatConversationTable.updatedAt)],
      }),
      db.query.chatMessageTable.findMany({
        where: eq(chatMessageTable.applicationId, applicationId),
        orderBy: [desc(chatMessageTable.createdAt)],
        limit: 100,
      }),
      db.query.applicationMembershipTable.findMany({
        where: eq(applicationMembershipTable.applicationId, applicationId),
        orderBy: [desc(applicationMembershipTable.createdAt)],
      }),
      db.query.applicationRoleTable.findMany({
        where: eq(applicationRoleTable.applicationId, applicationId),
        orderBy: [asc(applicationRoleTable.createdAt)],
      }),
      db.query.applicationInvitationTable.findMany({
        where: eq(applicationInvitationTable.applicationId, applicationId),
        orderBy: [desc(applicationInvitationTable.createdAt)],
      }),
    ])

    const relatedUserIds = Array.from(
      new Set(
        [
          ...applicants.map((record) => record.userId),
          ...memberships.map((record) => record.userId),
          ...memberships.map((record) => record.invitedBy),
          ...invitations.map((record) => record.invitedBy),
          ...invitations.map((record) => record.acceptedBy),
        ].filter((value): value is string => Boolean(value)),
      ),
    )

    const relatedUsers =
      relatedUserIds.length > 0
        ? await db.query.userTable.findMany({
            where: inArray(userTable.id, relatedUserIds),
            columns: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              emailVerified: true,
            },
          })
        : []

    return {
      owner,
      application,
      applicants,
      checklistItems,
      uploadedDocuments,
      evaluations,
      conversations,
      recentMessages,
      memberships,
      roles,
      invitations,
      relatedUsers,
    }
  },
)

export function getUserDisplayName(user: {
  firstName: string | null
  lastName: string | null
  email: string | null
}) {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`
  }
  return user.email ?? "Unknown user"
}
