import "server-only"

import { requireVerifiedPageSession } from "@/utils/auth-page"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2Icon, AlertCircleIcon, LinkIcon, UnlinkIcon, CalendarIcon, MailIcon } from "lucide-react"

export async function AccountDetailsCard() {
  const session = await requireVerifiedPageSession()

  const { user } = session
  const isVerified = !!user.emailVerified
  const isGoogleLinked = !!user.googleAccountId

  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null

  return (
    <Card className="rounded-xl border-border/80 shadow-[var(--shadow-dashboard)]">
      <CardHeader>
        <CardTitle>Account Details</CardTitle>
        <CardDescription>Sign-in details for your agency review desk.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Email */}
        <div className="flex items-start gap-3">
          <MailIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-medium">Email address</p>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          </div>
          {isVerified ? (
            <Badge variant="outline" className="shrink-0 gap-1 text-status-info border-status-info/25 bg-status-info/10 dark:bg-status-info/20 dark:border-status-info/35 dark:text-status-info">
              <CheckCircle2Icon className="h-3 w-3" />
              Verified
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 gap-1 text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400">
              <AlertCircleIcon className="h-3 w-3" />
              Unverified
            </Badge>
          )}
        </div>

        <div className="border-t" />

        {/* Google */}
        <div className="flex items-start gap-3">
          {/* Google "G" icon via SVG */}
          <svg className="h-4 w-4 mt-0.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-medium">Google account</p>
            <p className="text-sm text-muted-foreground">
              {isGoogleLinked ? "Linked for agency sign-in" : "Not connected"}
            </p>
          </div>
          {isGoogleLinked ? (
            <Badge variant="outline" className="shrink-0 gap-1 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900 dark:text-blue-400">
              <LinkIcon className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
              <UnlinkIcon className="h-3 w-3" />
              Not linked
            </Badge>
          )}
        </div>

        <div className="border-t" />

        {/* Member since */}
        {memberSince && (
          <div className="flex items-start gap-3">
            <CalendarIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-sm font-medium">Member since</p>
              <p className="text-sm text-muted-foreground">{memberSince}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
