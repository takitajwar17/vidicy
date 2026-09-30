"use server"

import { getDB } from "@/db"
import { requireAdmin } from "@/utils/auth"
import { userTable, visaApplicationTable } from "@/db/schema"
import { eq, desc } from "drizzle-orm"

export const getUserData = async (userId: string) => {
  const db = getDB()

  // Start user query early so it runs concurrently with the admin auth check
  const userPromise = db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
  })

  // Throws if the caller is not an admin; userPromise is already in-flight
  await requireAdmin()

  // Fetch user with all details
  const user = await userPromise

  if (!user) {
    throw new Error("User not found")
  }

  const ownedApplications = await db.query.visaApplicationTable.findMany({
    where: eq(visaApplicationTable.userId, userId),
    columns: {
      id: true,
      name: true,
      homeCountry: true,
      currentCountry: true,
      destinationCountry: true,
      visaType: true,
      embassy: true,
      status: true,
      trashedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [desc(visaApplicationTable.createdAt)],
  })

  return {
    user,
    ownedApplications,
  }
}
