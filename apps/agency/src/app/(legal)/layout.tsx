import { PublicSiteShell } from "@/components/public-page-shell";
import { type ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return <PublicSiteShell>{children}</PublicSiteShell>;
}
