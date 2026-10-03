"use client"

import dynamic from "next/dynamic"
import type { getAdminUsersPage } from "@/server/admin-users"

type AdminUsersPageData = Awaited<ReturnType<typeof getAdminUsersPage>>

const UsersTable = dynamic(() => import("@/components/admin/users-table").then(mod => mod.UsersTable), { 
  ssr: false,
  loading: () => <div className="h-[600px] w-full animate-pulse rounded-xl bg-muted" />
})

interface UsersTableWrapperProps {
  initialData: AdminUsersPageData
  initialEmailFilter: string
  initialPage: string
  initialPageSize: string
}

export function UsersTableWrapper(props: UsersTableWrapperProps) {
  return <UsersTable {...props} />
}
