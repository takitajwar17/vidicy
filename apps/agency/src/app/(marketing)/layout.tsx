import { PublicSiteShell } from "@/components/public-page-shell";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <PublicSiteShell>{children}</PublicSiteShell>;
}
