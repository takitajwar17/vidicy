import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { SiteSidebar } from "@/components/site-sidebar";
import { requireVerifiedPageSession } from "@/utils/auth-page";
import { getCsrfToken } from "@/infra/csrf";
import { CsrfProvider } from "@/components/csrf-provider";
import { ensureAgencyTeamMembership } from "@/server/agency-team";
import { AuthenticatedAppProviders } from "@/components/providers/authenticated-app-providers";
import { getAuthRouteHref } from "@/utils/auth-redirect";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;

  const [session, csrfToken] = await Promise.all([
    requireVerifiedPageSession(`/dashboard/${appId}`),
    getCsrfToken(),
  ]);
  const staff = await ensureAgencyTeamMembership(session);

  if (!staff) {
    redirect(getAuthRouteHref("/agency-setup", `/dashboard/${appId}`) as Route);
  }

  return (
    <CsrfProvider token={csrfToken}>
      <AuthenticatedAppProviders session={session}>
        <SidebarProvider>
          <SiteSidebar />
          <SidebarInset className="min-w-0">{children}</SidebarInset>
        </SidebarProvider>
      </AuthenticatedAppProviders>
    </CsrfProvider>
  );
}
