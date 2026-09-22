import type { Metadata } from "next"
import { EnterpriseForm } from "./_enterprise-form"
import { CANONICAL_SITE_URL } from "@/constants"
import { constructMetadata } from "@/lib/utils"
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell"

export const metadata: Metadata = constructMetadata({
  title: "Enterprise visa document review",
  description: "Custom pricing, unlimited applicants, and a dedicated account manager for agencies and teams that process 10+ visa applications a month.",
  alternates: {
    canonical: "/enterprise",
  },
})

const enterpriseServiceSchema = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Vidicy Enterprise",
  serviceType: "Enterprise visa document review platform",
  description:
    "Custom pricing, unlimited applicants, API access, and dedicated support for immigration agencies and high-volume visa-processing teams.",
  url: `${CANONICAL_SITE_URL}/enterprise`,
  areaServed: "Worldwide",
  audience: {
    "@type": "BusinessAudience",
    audienceType: "Immigration agencies, relocation teams, and visa-processing consultancies",
  },
  provider: {
    "@type": "Organization",
    name: "Vidicy",
    url: CANONICAL_SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${CANONICAL_SITE_URL}/static_logo.svg`,
    },
  },
};

export default function EnterprisePage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(enterpriseServiceSchema) }}
      />
      <PublicPageHero
        eyebrow="Enterprise"
        title="Built for agencies and high-volume teams"
        description="Custom pricing, unlimited applicants, and hands-on support, tailored to the way your team works."
      />
      <PublicPageContent maxWidthClassName="max-w-5xl">
        <EnterpriseForm />
      </PublicPageContent>
    </PublicPage>
  )
}
