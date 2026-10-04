import type { Metadata } from "next";

import { requireVerifiedPageSession } from "@/utils/auth-page";
import { SiteSidebar } from "@/components/site-sidebar";
import { Separator } from "@/components/ui/separator";
import { SettingsNav } from "./settings-nav";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { SettingsBreadcrumbs } from "./settings-breadcrumbs";
import { getCsrfToken } from "@/infra/csrf";
import { CsrfProvider } from "@/components/csrf-provider";
import { AuthenticatedAppProviders } from "@/components/providers/authenticated-app-providers";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, csrfToken] = await Promise.all([
    requireVerifiedPageSession(),
    getCsrfToken(),
  ]);

  return (
    <CsrfProvider token={csrfToken}>
      <AuthenticatedAppProviders session={session}>
        <SidebarProvider>
          <SiteSidebar />
          <SidebarInset className="w-full flex flex-col">
            <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/92 backdrop-blur transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
              <div className="flex min-w-0 items-center gap-2 px-3 md:px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <SettingsBreadcrumbs />
              </div>
            </header>
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col">
                <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 px-4 py-5 md:px-6 md:py-6">
                  <SettingsNav />
                  {children}
                </div>
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </AuthenticatedAppProviders>
    </CsrfProvider>
  );
}
