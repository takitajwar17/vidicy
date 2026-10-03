"use server"

import { createServerAction } from "zsa"
import { z } from "zod"
import { PAGE_SIZE_OPTIONS } from "../admin-constants"
import { getAdminUsersPage } from "@/server/admin-users"

const getUsersSchema = z.object({
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(Math.max(...PAGE_SIZE_OPTIONS)).default(PAGE_SIZE_OPTIONS[0]),
  emailFilter: z.string().optional(),
})

export const getUsersAction = createServerAction()
  .input(getUsersSchema)
  .handler(async ({ input }) => {
    return getAdminUsersPage(input)
  })
