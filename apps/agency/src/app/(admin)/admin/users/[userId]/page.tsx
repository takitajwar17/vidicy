import { cache } from "react"
import { getUserData } from "../../_actions/get-user.action"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { format } from "date-fns"
import { getInitials } from "@/utils/name-initials"
import type { Metadata } from "next"
import type { Route } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  Calendar,
  Mail,
  Shield,
  MapPin,
  Globe,
  Lock,
  Unlock,
  FileText
} from "lucide-react"

const getCachedUserData = cache(async (userId: string) => {
  return getUserData(userId)
})

interface UserDetailPageProps {
  params: Promise<{ userId: string }>
}

export async function generateMetadata({ params }: UserDetailPageProps): Promise<Metadata> {
  const { userId } = await params

  try {
    const data = await getCachedUserData(userId)
    if (!data) {
      throw new Error("User not found")
    }
    const { user } = data

    return {
      title: `User details: ${user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email}`,
      description: `User details for ${user.email}`,
    }
  } catch {
    return {
      title: "User not found",
      description: "The requested user could not be found",
    }
  }
}

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const { userId } = await params

  let data
  try {
    data = await getCachedUserData(userId)
  } catch {
    notFound()
  }

  if (!data) {
    notFound()
  }

  const { user, ownedApplications } = data

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user.email

  return (
    <>
      <PageHeader
        items={[
          { href: "/admin", label: "Admin" },
          { href: "/admin/users", label: "Users" },
          { href: `/admin/users/${user.id}`, label: displayName || "User Details" }
        ]}
      />

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="px-4 lg:px-6">
              <div className="grid gap-6">
                {/* User Profile Card */}
                <Card>
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-16 w-16">
                        <AvatarImage src={user.avatar || ""} alt={displayName || ""} />
                        <AvatarFallback className="text-lg">
                          {getInitials(`${user.firstName || ''} ${user.lastName || ''}`.trim())}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <CardTitle className="text-2xl">{displayName}</CardTitle>
                        <CardDescription className="text-base mt-1">
                          User ID: {user.id}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                          {user.role}
                        </Badge>
                        <Badge variant={user.emailVerified ? "default" : "destructive"}>
                          {user.emailVerified ? "Verified" : "Unverified"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                <div className="grid gap-6 md:grid-cols-2">
                  {/* Basic Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Email</label>
                        <p className="text-sm">{user.email || "No email"}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">First Name</label>
                        <p className="text-sm">{user.firstName || "Not provided"}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Last Name</label>
                        <p className="text-sm">{user.lastName || "Not provided"}</p>
                      </div>
                      {user.signUpIpAddress && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            Sign-up IP Address
                          </label>
                          <p className="text-sm font-mono">{user.signUpIpAddress}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Account Details */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Account Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Created
                        </label>
                        <p className="text-sm">{format(user.createdAt, "PPpp")}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                        <p className="text-sm">{format(user.updatedAt, "PPpp")}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Password</label>
                        <div className="flex items-center gap-2 mt-1">
                          {user.passwordHash ? (
                            <Badge variant="outline" className="bg-status-success/10 text-status-success border-status-success/20 gap-1.5 font-normal py-0.5 rounded-full">
                              <Lock className="h-3 w-3" />
                              Enabled
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-muted/20 gap-1.5 font-normal py-0.5 rounded-full">
                              <Unlock className="h-3 w-3" />
                              Not Set
                            </Badge>
                          )}
                        </div>
                      </div>
                      {user.googleAccountId && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            Google Account
                          </label>
                          <p className="text-sm font-mono">{user.googleAccountId}</p>
                        </div>
                      )}
                      {user.emailVerified && (
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Email Verified</label>
                          <p className="text-sm">{format(user.emailVerified, "PPpp")}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                </div>

                {/* Created applications */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Created Applications ({ownedApplications.length})
                    </CardTitle>
                    <CardDescription>
                      Applications this user created as owner.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {ownedApplications.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No applications created yet</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-muted-foreground">
	                              <th className="pb-2 font-medium">Application</th>
	                              <th className="pb-2 font-medium">Route</th>
	                              <th className="pb-2 font-medium">Status</th>
	                              <th className="pb-2 font-medium text-right">Created</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ownedApplications.map((application) => {
                              const isTrashed = Boolean(application.trashedAt)
                              const displayName = application.name?.trim().length
                                ? application.name
                                : `${application.destinationCountry || "Untitled"} ${application.visaType || "application"}`

                              return (
                                <tr key={application.id} className="border-b last:border-0">
                                  <td className="py-2 align-top">
                                    <div className="font-medium">
                                      <Link
                                        href={`/admin/users/${user.id}/applications/${application.id}` as Route}
                                        className="text-primary hover:underline"
                                      >
                                        {displayName}
                                      </Link>
                                    </div>
                                    <div className="font-mono text-xs text-muted-foreground">{application.id}</div>
                                  </td>
                                  <td className="py-2 align-top text-muted-foreground">
                                    {application.homeCountry || "—"} → {application.destinationCountry || "—"}{" "}
                                    {application.visaType ? `(${application.visaType})` : ""}
                                  </td>
                                  <td className="py-2 align-top">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline" className="text-xs capitalize">
                                        {application.status.replace("_", " ")}
                                      </Badge>
                                      {isTrashed ? (
                                        <Badge variant="secondary" className="text-xs">
                                          Trashed
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </td>
	                                  <td className="py-2 align-top text-right tabular-nums text-muted-foreground">
                                    {format(application.createdAt, "PP")}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
