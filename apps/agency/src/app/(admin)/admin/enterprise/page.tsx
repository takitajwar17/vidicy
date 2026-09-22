import "server-only"
import { requireAdminPageSession } from "@/utils/auth-page"
import { getDB } from "@/db"
import { enterpriseInquiryTable, ENTERPRISE_INQUIRY_STATUS } from "@/db/schema"
import { desc } from "drizzle-orm"
import { PageHeader } from "@/components/page-header"
import { EnterpriseInquiriesClient } from "@/components/admin/enterprise-inquiries-client"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Enterprise inquiries",
  description: "Manage enterprise plan inquiries",
}

export default async function AdminEnterpriseInquiriesPage() {
  await requireAdminPageSession()

  const db = getDB()
  const inquiries = await db
    .select()
    .from(enterpriseInquiryTable)
    .orderBy(desc(enterpriseInquiryTable.createdAt))

  const newCount = inquiries.filter((i) => i.status === ENTERPRISE_INQUIRY_STATUS.NEW).length

  return (
    <>
      <PageHeader items={[{ href: "/admin", label: "Admin" }, { href: "/admin/enterprise", label: "Enterprise Inquiries" }]} />
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Enterprise Inquiries</h1>
              <p className="text-sm text-muted-foreground">
                {inquiries.length} total · {newCount} new
              </p>
            </div>
          </div>
          <EnterpriseInquiriesClient inquiries={inquiries} />
        </div>
      </div>
    </>
  )
}
