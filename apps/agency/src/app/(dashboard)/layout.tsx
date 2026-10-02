import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SiteSidebar } from "@/components/site-sidebar";
import { requireVerifiedPageSession } from "@/utils/auth-page";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCsrfToken } from "@/infra/csrf";
import { CsrfProvider } from "@/components/csrf-provider";
import { ensureAgencyTeamMembership } from "@/server/agency-team";
import { AuthenticatedAppProviders } from "@/components/providers/authenticated-app-providers";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [session, csrfToken] = await Promise.all([requireVerifiedPageSession(), getCsrfToken()]);
  const staff = await ensureAgencyTeamMembership(session);

  if (!staff) {
    redirect("/pilot-access");
  }

  return (
    <CsrfProvider token={csrfToken}>
      <AuthenticatedAppProviders session={session}>
        <SidebarProvider>
          <SiteSidebar />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
      </AuthenticatedAppProviders>
    </CsrfProvider>
  );
}
