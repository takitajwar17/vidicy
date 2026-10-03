import type { Metadata } from "next"

import { SiteSidebar } from "@/components/site-sidebar"
import { requireAdminPageSession } from "@/utils/auth-page"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { getCsrfToken } from "@/infra/csrf";
import { CsrfProvider } from "@/components/csrf-provider";
import { AuthenticatedAppProviders } from "@/components/providers/authenticated-app-providers";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [session, csrfToken] = await Promise.all([
    requireAdminPageSession(),
    getCsrfToken(),
  ]);

  return (
    <CsrfProvider token={csrfToken}>
      <AuthenticatedAppProviders session={session}>
        <SidebarProvider>
          <SiteSidebar />
          <SidebarInset className="w-full flex flex-col">
            {children}
          </SidebarInset>
        </SidebarProvider>
      </AuthenticatedAppProviders>
    </CsrfProvider>
  )
}
