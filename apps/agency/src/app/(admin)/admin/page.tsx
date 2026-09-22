import { PageHeader } from "@/components/page-header"
import type { Metadata } from "next"
import { getDB } from "@/db"
import { enterpriseInquiryTable, ENTERPRISE_INQUIRY_STATUS, userTable } from "@/db/schema"
import { desc, eq } from "drizzle-orm"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { ArrowRightIcon, ActivityIcon } from "lucide-react"
import Link from "next/link"
import type { Route } from "next"
import { Badge } from "@/components/ui/badge"
import { formatDistanceToNow } from "date-fns"

export const metadata: Metadata = {
  title: "Admin dashboard",
  description: "Overview of admin tools and latest activity",
}

export default async function AdminPage() {
  const db = getDB()
  const [newInquiryCount, latestUsers, latestInquiries] = await Promise.all([
    db
      .select({ id: enterpriseInquiryTable.id })
      .from(enterpriseInquiryTable)
      .where(eq(enterpriseInquiryTable.status, ENTERPRISE_INQUIRY_STATUS.NEW))
      .then((rows) => rows.length),
    db.query.userTable.findMany({
      columns: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
      orderBy: [desc(userTable.createdAt)],
      limit: 3,
    }),
    db.query.enterpriseInquiryTable.findMany({
      columns: {
        id: true,
        name: true,
        email: true,
        company: true,
        status: true,
        createdAt: true,
      },
      orderBy: [desc(enterpriseInquiryTable.createdAt)],
      limit: 3,
    }),
  ])

  return (
    <>
      <PageHeader items={[{ href: "/admin", label: "Admin" }]} />
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="px-4 lg:px-6 flex flex-col gap-6">

              {/* Quick links */}
              <div className="flex flex-wrap gap-3">
                <Link href={"/admin/status" as Route}>
                  <Card className="hover:bg-muted/40 transition-colors cursor-pointer w-full sm:w-64">
                    <CardHeader className="flex flex-row items-center gap-3 py-4">
                      <ActivityIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-medium">System Status</CardTitle>
                        <CardDescription className="text-xs">
                          Health, stats &amp; usage
                        </CardDescription>
                      </div>
                      <ArrowRightIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardHeader>
                  </Card>
                </Link>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle>Latest users</CardTitle>
                    <CardDescription>Showing only recent signups.</CardDescription>
                  </div>
                  <Link
                    href={"/admin/users" as Route}
                    className="text-sm font-medium text-primary hover:underline underline-offset-4"
                  >
                    View all users
                  </Link>
                </CardHeader>
                <CardContent className="space-y-3">
                  {latestUsers.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No users found yet.
                    </div>
                  ) : (
                    latestUsers.map((user) => {
                      const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim()
                      return (
                        <Link
                          key={user.id}
                          href={`/admin/users/${user.id}` as Route}
                          className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/40"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {displayName || user.email || "Unnamed user"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{user.email || "No email"}</p>
                          </div>
                          <div className="flex items-center gap-2 pl-3">
                            <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                              {user.role}
                            </Badge>
                            <Badge variant={user.emailVerified ? "default" : "destructive"}>
                              {user.emailVerified ? "verified" : "unverified"}
                            </Badge>
                            <span className="hidden text-xs text-muted-foreground sm:inline">
                              {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </Link>
                      )
                    })
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <div>
                    <CardTitle>Latest enterprise inquiries</CardTitle>
                    <CardDescription>
                      Showing only recent inquiries.
                      {newInquiryCount > 0 ? ` ${newInquiryCount} new.` : ""}
                    </CardDescription>
                  </div>
                  <Link
                    href={"/admin/enterprise" as Route}
                    className="text-sm font-medium text-primary hover:underline underline-offset-4"
                  >
                    View all inquiries
                  </Link>
                </CardHeader>
                <CardContent className="space-y-3">
                  {latestInquiries.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No enterprise inquiries yet.
                    </div>
                  ) : (
                    latestInquiries.map((inquiry) => {
                      const statusVariant =
                        inquiry.status === ENTERPRISE_INQUIRY_STATUS.NEW
                          ? "default"
                          : inquiry.status === ENTERPRISE_INQUIRY_STATUS.CONTACTED
                            ? "secondary"
                            : "outline"
                      const statusLabel = inquiry.status.charAt(0).toUpperCase() + inquiry.status.slice(1)

                      return (
                        <Link
                          key={inquiry.id}
                          href={"/admin/enterprise" as Route}
                          className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/40"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {inquiry.name} · {inquiry.company}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{inquiry.email}</p>
                          </div>
                          <div className="flex items-center gap-2 pl-3">
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                            <span className="hidden text-xs text-muted-foreground sm:inline">
                              {formatDistanceToNow(new Date(inquiry.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </Link>
                      )
                    })
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
