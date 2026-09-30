"use server"

import { createServerAction } from "zsa"
import { getDB } from "@/db"
import { requireAdmin } from "@/utils/auth"
import { z } from "zod"
import { inArray, and, ne, eq } from "drizzle-orm"
import {
  AGENCY_STAFF_STATUS,
  ROLES_ENUM,
  agencyTeamMemberTable,
  userTable,
  visaApplicationTable,
} from "@/db/schema"
import { revalidatePath } from "next/cache"
import { validateCsrfToken } from "@/infra/csrf"
import { ZSAError } from "zsa"
import { adminDeleteUser } from "@/server/application-server"
import { logger } from "@/infra/logger"

const bulkActionSchema = z.object({
  userIds: z.array(z.string()).min(1),
  csrfToken: z.string().optional(),
})

const bulkUpdateRoleSchema = bulkActionSchema.extend({
  role: z.enum([ROLES_ENUM.ADMIN, ROLES_ENUM.USER]),
})

/**
 * Bulk delete users with proper cascading:
 *  - Agency cases → transfer to another active staff member when possible
 *  - Agency cases with no remaining staff → delete (R2/Vectorize cleanup)
 *  - All related data cleaned up
 * Prevents the current admin from deleting themselves.
 */
export const bulkDeleteUsersAction = createServerAction()
  .input(bulkActionSchema)
  .handler(async ({ input }) => {
    // Validate CSRF token
    if (!(await validateCsrfToken(input.csrfToken))) {
      throw new ZSAError("FORBIDDEN", "Invalid request")
    }

    const session = await requireAdmin()
    if (!session) throw new Error("Unauthorized")

    const { userIds } = input
    const filteredUserIds = userIds.filter(id => id !== session.userId)

    if (filteredUserIds.length === 0) {
      return { success: false, message: "No users to delete (you cannot delete yourself)", deleted: 0, appsTransferred: 0, appsDeleted: 0, errors: [] }
    }

    let totalDeleted = 0
    let totalAppsTransferred = 0
    let totalAppsDeleted = 0
    const errors: string[] = []

    for (const userId of filteredUserIds) {
      try {
        const result = await adminDeleteUser({ userId })
        totalDeleted++
        totalAppsTransferred += result.appsTransferred
        totalAppsDeleted += result.appsDeleted
      } catch (error) {
        const msg = `Failed to delete user ${userId}: ${error instanceof Error ? error.message : "Unknown error"}`
        errors.push(msg)
        logger.error("Admin user deletion failed", { userId, error })
      }
    }

    revalidatePath("/admin/users")
    return {
      success: totalDeleted > 0,
      deleted: totalDeleted,
      appsTransferred: totalAppsTransferred,
      appsDeleted: totalAppsDeleted,
      errors,
    }
  })

/**
 * Bulk update user roles
 * Prevents the current admin from changing their own role
 */
export const bulkUpdateUserRoleAction = createServerAction()
  .input(bulkUpdateRoleSchema)
  .handler(async ({ input }) => {
    // Validate CSRF token
    if (!(await validateCsrfToken(input.csrfToken))) {
      throw new ZSAError("FORBIDDEN", "Invalid request")
    }

    const session = await requireAdmin()
    if (!session) throw new Error("Unauthorized")
    const db = getDB()
    const { userIds, role } = input

    // Filter out the current user to prevent demoting self
    const filteredUserIds = userIds.filter(id => id !== session.userId)

    if (filteredUserIds.length === 0) {
      return { success: false, message: "No roles to update (you cannot change your own role)" }
    }

    await db.update(userTable)
      .set({ role })
      .where(
        and(
          inArray(userTable.id, filteredUserIds),
          ne(userTable.id, session.userId) // Double safety
        )
      )

    revalidatePath("/admin/users")
    return { success: true, count: filteredUserIds.length }
  })

/**
 * Bulk verify user emails
 */
export const bulkVerifyUserEmailAction = createServerAction()
  .input(bulkActionSchema)
  .handler(async ({ input }) => {
    // Validate CSRF token
    if (!(await validateCsrfToken(input.csrfToken))) {
      throw new ZSAError("FORBIDDEN", "Invalid request")
    }

    const session = await requireAdmin()
    if (!session) throw new Error("Unauthorized")
    const db = getDB()
    const { userIds } = input

    await db.update(userTable)
      .set({ emailVerified: new Date() })
      .where(inArray(userTable.id, userIds))

    revalidatePath("/admin/users")
    return { success: true, count: userIds.length }
  })

/**
 * Preview the impact of deleting users before confirming.
 * Returns counts of agency cases that would be transferred vs deleted.
 */
export const previewDeleteUsersAction = createServerAction()
  .input(bulkActionSchema)
  .handler(async ({ input }) => {
    const session = await requireAdmin()
    if (!session) throw new Error("Unauthorized")
    const db = getDB()

    const filteredUserIds = input.userIds.filter(id => id !== session.userId)
    if (filteredUserIds.length === 0) {
      return { usersToDelete: 0, appsToTransfer: 0, appsToDelete: 0 }
    }

    let appsToTransfer = 0
    let appsToDelete = 0

    for (const userId of filteredUserIds) {
      const [ownedApps, replacementStaff] = await Promise.all([
        db
          .select({ id: visaApplicationTable.id })
          .from(visaApplicationTable)
          .where(eq(visaApplicationTable.userId, userId)),
        db
          .select({ userId: agencyTeamMemberTable.userId })
          .from(agencyTeamMemberTable)
          .where(
            and(
              ne(agencyTeamMemberTable.userId, userId),
              eq(agencyTeamMemberTable.status, AGENCY_STAFF_STATUS.ACTIVE),
            ),
          ),
      ])

      if (replacementStaff.length > 0) {
        appsToTransfer += ownedApps.length
      } else {
        appsToDelete += ownedApps.length
      }
    }

    return { usersToDelete: filteredUserIds.length, appsToTransfer, appsToDelete }
  })
