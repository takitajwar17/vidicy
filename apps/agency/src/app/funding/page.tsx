import type { Metadata } from "next"

import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
  PublicSiteShell,
} from "@/components/public-page-shell"
import { constructMetadata } from "@/lib/utils"

export const metadata: Metadata = constructMetadata({
  title: "Funding",
  description: "Vidicy is currently in the process of fundraising.",
  alternates: {
    canonical: "/funding",
  },
})

export default function FundingPage() {
  return (
    <PublicSiteShell>
      <PublicPage>
        <PublicPageHero
          eyebrow="Funding"
          title="Vidicy is currently fundraising"
          description="We are speaking with investors who understand agency workflows, document-heavy operations, and high-volume visa markets."
        />
        <PublicPageContent maxWidthClassName="max-w-2xl">
          <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
            We are currently in the process of fundraising.
          </p>
        </PublicPageContent>
      </PublicPage>
    </PublicSiteShell>
  )
}
