import type { Metadata } from "next";

import { SiteSidebar } from "@/components/site-sidebar";
import { requirePageSession } from "@/utils/auth-page";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCsrfToken } from "@/infra/csrf";
import { CsrfProvider } from "@/components/csrf-provider";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SupportLayout({ children }: { children: React.ReactNode }) {
  const [, csrfToken] = await Promise.all([requirePageSession(), getCsrfToken()]);

  return (
    <CsrfProvider token={csrfToken}>
      <SidebarProvider>
        <SiteSidebar />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </CsrfProvider>
  );
}
