"use client"

import dynamic from "next/dynamic"

const UsersTable = dynamic(() => import("@/components/admin/users-table").then(mod => mod.UsersTable), { 
  ssr: false,
  loading: () => <div className="h-[600px] w-full animate-pulse rounded-xl bg-muted" />
})

export function UsersTableWrapper() {
  return <UsersTable />
}
