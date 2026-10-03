import { PageHeader } from "@/components/page-header"
import { UsersTableWrapper } from "@/components/admin/users-table-wrapper"
import type { Metadata } from "next"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { PAGE_SIZE_OPTIONS } from "../admin-constants"
import { getAdminUsersPage } from "@/server/admin-users"

export const metadata: Metadata = {
  title: "Users",
  description: "Manage and monitor all user accounts",
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? String(fallback), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; page?: string; pageSize?: string }>
}) {
  const params = await searchParams
  const initialPage = parsePositiveInteger(params.page, 1)
  const initialPageSize = parsePositiveInteger(params.pageSize, PAGE_SIZE_OPTIONS[0])
  const initialEmailFilter = params.email ?? ""
  const initialData = await getAdminUsersPage({
    emailFilter: initialEmailFilter,
    page: initialPage,
    pageSize: initialPageSize,
  })

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
              <UsersTableWrapper
                initialData={initialData}
                initialEmailFilter={initialEmailFilter}
                initialPage={String(initialData.page)}
                initialPageSize={String(initialData.pageSize)}
              />
            </div>
          </div>
        </div>
      </div>
    </NuqsAdapter>
  )
}
