import type { Route } from "next";
import Link from "next/link";
import { PublicPage, PublicPageContent, PublicPageHero } from "@/components/public-page-shell";
import { CANONICAL_SITE_URL } from "@/constants";
import { CheckCircle2Icon, ArrowRightIcon } from "lucide-react";
import ReactCountryFlag from "react-country-flag";

interface DocumentSection {
  title: string;
  documents: string[];
}

interface FaqItem {
  question: string;
  answer: string;
}

interface OfficialSource {
  label: string;
  href: string;
}

interface VisaPageProps {
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  /** ISO 3166-1 alpha-2 country code for the flag (e.g. "US", "GB") */
  countryCode: string;
  coreDocuments: string[];
  sections: DocumentSection[];
  faqItems?: FaqItem[];
  schemaName: string;
  schemaDescription: string;
  schemaItems: string[];
  lastReviewedAt: string;
  officialSources: OfficialSource[];
  /** Slug of the current visa page (e.g. "us") — used to exclude it from related links */
  currentVisa?: string;
}

const RELATED_VISA_TYPES = [
  {
    slug: "us",
    href: "/visas/us",
    label: "US Visas",
    description: "B1/B2, F-1, H-1B, O-1",
    countryCode: "US",
  },
  {
    slug: "schengen",
    href: "/visas/schengen",
    label: "Schengen Visas",
    description: "All 29 member states",
    countryCode: "EU",
  },
  {
    slug: "uk",
    href: "/visas/uk",
    label: "UK Visas",
    description: "Visitor, Skilled Worker, Student",
    countryCode: "GB",
  },
  {
    slug: "canada",
    href: "/visas/canada",
    label: "Canada Visas",
    description: "Visitor, Study, Work Permit",
    countryCode: "CA",
  },
  {
    slug: "australia",
    href: "/visas/australia",
    label: "Australia Visas",
    description: "Visitor, Student, Skilled",
    countryCode: "AU",
  },
];

export function VisaPage({
  heroTitle,
  heroSubtitle,
  heroDescription,
  countryCode: _countryCode,
  coreDocuments,
  sections,
  faqItems,
  schemaName,
  schemaDescription,
  schemaItems,
  lastReviewedAt,
  officialSources,
  currentVisa,
}: VisaPageProps) {
  const relatedLinks = currentVisa
    ? RELATED_VISA_TYPES.filter((v) => v.slug !== currentVisa)
    : RELATED_VISA_TYPES;
  const documentListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: schemaName,
    description: schemaDescription,
    dateModified: lastReviewedAt,
    citation: officialSources.map((source) => source.href),
    itemListElement: schemaItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item,
    })),
  };

  const faqSchema =
    faqItems && faqItems.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqItems.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }
      : null;

  const pageUrl = currentVisa
    ? `${CANONICAL_SITE_URL}/visas/${currentVisa}`
    : `${CANONICAL_SITE_URL}/visas`;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: CANONICAL_SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Visas",
        item: `${CANONICAL_SITE_URL}/visas`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: heroTitle,
        item: pageUrl,
      },
    ],
  };

  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(documentListSchema) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      <PublicPageHero eyebrow={heroSubtitle} title={heroTitle} description={heroDescription} />

      <PublicPageContent className="space-y-14">
        <section className="rounded-xl border border-border/70 bg-muted/20 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Freshness check</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Last reviewed against official immigration sources on{" "}
                <time dateTime={lastReviewedAt}>
                  {new Date(`${lastReviewedAt}T00:00:00.000Z`).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </time>
                . Fees, document rules, and processing guidance can change, so verify the linked
                source pages before you submit.
              </p>
            </div>
            <div className="md:max-w-sm">
              <p className="text-sm font-medium text-foreground">Official sources</p>
              <ul className="mt-2 space-y-1.5">
                {officialSources.map((source) => (
                  <li key={source.href}>
                    <a
                      href={source.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Core documents */}
        <section>
          <h2 className="mb-6 text-2xl font-semibold text-foreground">Core documents</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {coreDocuments.map((doc) => (
              <li key={doc} className="flex items-start gap-2.5">
                <CheckCircle2Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{doc}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Visa-type-specific sections */}
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-2xl font-semibold text-foreground mb-6">{section.title}</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {section.documents.map((doc) => (
                <li key={doc} className="flex items-start gap-2.5">
                  <CheckCircle2Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground">{doc}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* FAQ */}
        {faqItems && faqItems.length > 0 && (
          <section>
            <h2 className="mb-6 text-2xl font-semibold text-foreground">Common questions</h2>
            <div className="space-y-6">
              {faqItems.map((item) => (
                <div key={item.question} className="border-b pb-6 last:border-0">
                  <h3 className="font-medium text-foreground mb-2">{item.question}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related visa types */}
        {relatedLinks.length > 0 && (
          <section>
            <h2 className="mb-6 text-2xl font-semibold text-foreground">Other visa types</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {relatedLinks.map((visa) => (
                <Link
                  key={visa.slug}
                  href={visa.href as Route}
                  className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3 hover:bg-muted/60 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <ReactCountryFlag
                      countryCode={visa.countryCode}
                      svg
                      style={{ width: "1.25em", height: "1.25em" }}
                      alt={`${visa.label} flag`}
                      aria-label={visa.label}
                      loading="lazy"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">{visa.label}</p>
                      <p className="text-xs text-muted-foreground">{visa.description}</p>
                    </div>
                  </div>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </PublicPageContent>
    </PublicPage>
  );
}
