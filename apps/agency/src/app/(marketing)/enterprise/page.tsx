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
  description: "Pilot Vidicy on real agency files: passports, forms, bank statements, issue queues, and client fix lists.",
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
    "Private pilots for visa agencies that review passports, forms, bank statements, client evidence, and follow-up reports at volume.",
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
        title="For agencies with a stack of client files every morning"
        description="Pilot Vidicy on the routes your team reviews now. Bring the passports, forms, bank statements, letters, bookings, and client follow-ups that slow the desk down."
      />
      <PublicPageContent>
        <EnterpriseForm />
      </PublicPageContent>
    </PublicPage>
  )
}
