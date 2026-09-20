import "server-only"

import { requireVerifiedPageSession } from "@/utils/auth-page"
import { getInitials } from "@/utils/name-initials"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import Image from "next/image"
import { ROLES_ENUM } from "@/db/schema"

export async function ProfileHeader() {
  const session = await requireVerifiedPageSession()

  const { user } = session
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "User"
  const initials = getInitials(fullName)
  const isAdmin = user.role === ROLES_ENUM.ADMIN

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null

  return (
    <Card>
      <CardContent className="pt-6 pb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Avatar */}
          <Avatar className="h-16 w-16 rounded-full shrink-0">
            {user.avatar ? (
              <Image src={user.avatar} alt={fullName} width={64} height={64} className="aspect-square h-full w-full object-cover rounded-full" />
            ) : (
              <AvatarFallback className="rounded-full text-xl font-semibold">
                {initials || "?"}
              </AvatarFallback>
            )}
          </Avatar>

          {/* Name / email / meta */}
          <div className="flex flex-1 flex-col gap-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold leading-tight truncate">{fullName}</h2>
              <Badge variant={isAdmin ? "default" : "secondary"} className="shrink-0">
                {isAdmin ? "Admin" : "User"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            {memberSince && (
              <p className="text-xs text-muted-foreground">Member since {memberSince}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
