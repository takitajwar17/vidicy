import type { Metadata } from "next"

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { WorkspaceSidebar } from "@/components/workspace-sidebar"
import { requireVerifiedPageSession } from "@/utils/auth-page"
import { ROLES_ENUM } from "@/db/schema"
import { getCsrfToken } from "@/infra/csrf"
import { CsrfProvider } from "@/components/csrf-provider"
import { SetLastActiveAppCookie } from "@/components/set-last-active-app-cookie"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ appId: string }>
}) {
  const { appId } = await params

  const [session, csrfToken] = await Promise.all([
    requireVerifiedPageSession(`/dashboard/${appId}`),
    getCsrfToken(),
  ])

  const userProps = {
    name: `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() || session.user.email || "User",
    email: session.user.email || "",
    avatar: session.user.avatar ?? "",
  }

  const isAdmin = session.user.role === ROLES_ENUM.ADMIN

  return (
    <CsrfProvider token={csrfToken}>
      <SetLastActiveAppCookie appId={appId} />
      <SidebarProvider>
        <WorkspaceSidebar appId={appId} user={userProps} isAdmin={isAdmin} />
        <SidebarInset>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </CsrfProvider>
  )
}
