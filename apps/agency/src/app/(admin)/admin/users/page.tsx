import { PageHeader } from "@/components/page-header"
import { UsersTableWrapper } from "@/components/admin/users-table-wrapper"
import type { Metadata } from "next"
import { NuqsAdapter } from "nuqs/adapters/next/app"

export const metadata: Metadata = {
  title: "Users",
  description: "Manage and monitor all user accounts",
}

export default function AdminUsersPage() {
  return (
    <NuqsAdapter>
      <PageHeader
        items={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/users", label: "Users" },
        ]}
      />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="px-4 lg:px-6">
              <UsersTableWrapper />
            </div>
          </div>
        </div>
      </div>
    </NuqsAdapter>
  )
}
