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
  const [, csrfToken] = await Promise.all([
    requireVerifiedPageSession(),
    getCsrfToken(),
  ]);

  return (
    <CsrfProvider token={csrfToken}>
      <SidebarProvider>
        <SiteSidebar />
        <SidebarInset className="w-full flex flex-col">
          <header className="sticky top-0 z-10 bg-background flex h-16 shrink-0 items-center justify-between border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <SettingsBreadcrumbs />
            </div>
          </header>
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                <div className="px-4 lg:px-6 flex flex-col gap-4 md:gap-6">
                  <SettingsNav />
                  {children}
                </div>
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </CsrfProvider>
  );
}
