import type { Metadata } from "next"
import type { Route } from "next"
import Link from "next/link"
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell"
import { buttonVariants } from "@/components/ui/button"
import { cn, constructMetadata } from "@/lib/utils"
import { CANONICAL_SITE_URL, PUBLIC_SIGN_UP_CTA_LABEL } from "@/constants"
import { ArrowRightIcon } from "lucide-react"
import ReactCountryFlag from "react-country-flag"

export const metadata: Metadata = constructMetadata({
  title: "Visa document checklists by country",
  description:
    "Browse country-specific visa document checklists for the US, Schengen, UK, Canada, and Australia before you upload.",
  alternates: {
    canonical: "/visas",
  },
})

const listSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Visa document checklists by country",
  description:
    "Country-specific visa document checklists organized by destination.",
  url: `${CANONICAL_SITE_URL}/visas`,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "US Visas", url: `${CANONICAL_SITE_URL}/visas/us` },
    { "@type": "ListItem", position: 2, name: "Schengen Visas", url: `${CANONICAL_SITE_URL}/visas/schengen` },
    { "@type": "ListItem", position: 3, name: "UK Visas", url: `${CANONICAL_SITE_URL}/visas/uk` },
    { "@type": "ListItem", position: 4, name: "Canada Visas", url: `${CANONICAL_SITE_URL}/visas/canada` },
    { "@type": "ListItem", position: 5, name: "Australia Visas", url: `${CANONICAL_SITE_URL}/visas/australia` },
  ],
}

const DESTINATIONS = [
  {
    slug: "us",
    countryCode: "US",
    label: "United States",
    visaTypes: "B1/B2, F-1, H-1B, O-1",
    description:
      "Tourist, student, work, and extraordinary ability routes. The checklist changes with the visa type, so the details stay route-specific.",
  },
  {
    slug: "schengen",
    countryCode: "EU",
    label: "Schengen Area",
    visaTypes: "Short-stay, National, Student",
    description:
      "Covers all 29 Schengen member states. You get one checklist for the shared rules, plus the consulate notes that people usually miss.",
  },
  {
    slug: "uk",
    countryCode: "GB",
    label: "United Kingdom",
    visaTypes: "Standard Visitor, Skilled Worker, Student",
    description:
      "Visitor, work, and study routes under UKVI, with the points-based pieces called out where they matter.",
  },
  {
    slug: "canada",
    countryCode: "CA",
    label: "Canada",
    visaTypes: "TRV, Study Permit, Work Permit",
    description:
      "Visitor visas, study permits, and work permits, with the IRCC document standards spelled out plainly.",
  },
  {
    slug: "australia",
    countryCode: "AU",
    label: "Australia",
    visaTypes: "Subclass 600, 500, Skilled Migration",
    description:
      "Visitor, student, and skilled migration visas, including points-tested streams and the health checks that often trip people up.",
  },
]

export default function VisasPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listSchema) }}
      />

      <PublicPageHero
        eyebrow="Visas"
        title="Visa document checklists by country"
        description="Choose your destination to see the core documents, route-specific requirements, and FAQs for that application."
        actions={
          <Link
            href="/sign-up"
            className={cn(buttonVariants({ variant: "default", size: "lg" }), "gap-2")}
          >
            {PUBLIC_SIGN_UP_CTA_LABEL}
          </Link>
        }
        />

      <PublicPageContent className="space-y-14">
        {/* Destination cards */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold text-foreground">
            Choose your destination
          </h2>
          <ul className="grid grid-cols-1 gap-4">
            {DESTINATIONS.map((dest) => (
              <li key={dest.slug}>
              <Link
                href={`/visas/${dest.slug}` as Route}
                className="flex items-center justify-between rounded-xl border bg-muted/30 px-5 py-5 hover:bg-muted/60 transition-colors group"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                    <ReactCountryFlag
                      countryCode={dest.countryCode}
                      svg
                      style={{ width: "1.5em", height: "1.5em" }}
                      alt={`${dest.label} flag`}
                      aria-label={dest.label}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">{dest.label}</p>
                    <p className="text-xs font-mono text-primary mb-1.5">{dest.visaTypes}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {dest.description}
                    </p>
                  </div>
                </div>
                <ArrowRightIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 ml-4" />
              </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* More destinations note */}
        <section className="rounded-xl border border-dashed border-muted-foreground/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">More destinations coming soon</span>{" "}
            We are adding more routes as we go, including Japan, South Korea, UAE, and others.
          </p>
        </section>

      </PublicPageContent>
    </PublicPage>
  )
}
