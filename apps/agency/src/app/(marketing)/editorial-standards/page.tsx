import type { Route } from "next";
import Link from "next/link";

import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell";
import { buttonVariants } from "@/components/ui/button";
import { CANONICAL_SITE_URL } from "@/constants";
import { siteConfig } from "@/lib/config";
import { constructMetadata, cn } from "@/lib/utils";

const editorialStandardsDescription =
  "How Vidicy researches, reviews, corrects, and updates high-stakes visa-document content.";

export const metadata = constructMetadata({
  title: "Editorial Standards",
  description: editorialStandardsDescription,
  alternates: {
    canonical: "/editorial-standards",
  },
});

const editorialStandardsPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Editorial Standards",
  description: editorialStandardsDescription,
  url: `${CANONICAL_SITE_URL}/editorial-standards`,
  dateModified: "2026-10-12",
  isPartOf: {
    "@type": "WebSite",
    name: siteConfig.name,
    url: CANONICAL_SITE_URL,
  },
  publisher: {
    "@type": "Organization",
    name: siteConfig.name,
    url: CANONICAL_SITE_URL,
  },
  about: [
    "Editorial policy",
    "Visa document content review",
    "Official immigration source verification",
    "Content corrections",
  ],
};

const SOURCE_PRIORITIES = [
  "Primary government and official immigration pages come first for fees, eligibility rules, document requirements, and processing guidance.",
  "Official visa-centre or consulate booking portals are used for jurisdiction-specific document and upload instructions when national pages differ by city.",
  "Secondary sources are used only for context or workflow examples, not as the final authority for live rules.",
];

const REVIEW_RULES = [
  "Time-sensitive updates are checked against current official pages before the article update ships.",
  "Route pages and high-traffic posts run through a scheduled weekly official-source verification workflow.",
  "Material factual updates receive an article `updatedAt` date so the page and sitemap reflect the review.",
  "When an official source is ambiguous, the article should say so directly instead of inventing certainty.",
];

const CORRECTION_RULES = [
  "If we find a material factual error, we correct the article, refresh the update date, and align the related table or summary block.",
  "If a source becomes stale or a government fee changes, we update the affected article sections rather than leaving older figures in place.",
  "Readers can report a possible issue through support so the team can review the source trail and amend the page if needed.",
];

const REVIEW_EXAMPLES = [
  "A DS-160 lists a hotel stay in one city while the invitation letter or trip plan names a different host address.",
  "Bank statements show a late unexplained deposit even though the application says the trip is fully self-funded.",
  "Employment letters, leave dates, and itinerary dates do not line up cleanly across the form and supporting documents.",
];

export default function EditorialStandardsPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(editorialStandardsPageSchema) }}
      />

      <PublicPageHero
        eyebrow="Editorial Standards"
        title="How Vidicy reviews and updates visa-document content."
        description="This page explains the source hierarchy, review workflow, and correction process behind Vidicy's guide content."
      />

      <PublicPageContent className="space-y-16">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">What our content is built to do</h2>
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground">
            <p>
              Vidicy publishes content for applicants who need a practical, document-focused
              explanation of visa preparation workflows. The editorial goal is not to repeat generic
              SEO checklists. It is to explain how document requirements, supporting evidence, and
              route-specific rules fit together in a way that helps readers prepare a cleaner file.
            </p>
            <p>
              Because visa content is high-stakes and can change, our guides are refreshed with a
              strong bias toward current official source pages, especially when a post includes live
              fees, eligibility windows, upload rules, or other procedural details.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Source hierarchy</h2>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {SOURCE_PRIORITIES.map((item) => (
              <li key={item} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Review and freshness workflow</h2>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {REVIEW_RULES.map((item) => (
              <li key={item} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Corrections process</h2>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {CORRECTION_RULES.map((item) => (
              <li key={item} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">
            What the review workflow catches in practice
          </h2>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {REVIEW_EXAMPLES.map((item) => (
              <li key={item} className="rounded-xl border border-border/70 bg-muted/20 p-4">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-foreground">Who reviews the content</h2>
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-muted-foreground">
            <p>
              Vidicy's guide updates are reviewed by the product team member who maintains the
              checklist, document-evaluation, and Atlas guidance workflows. That reviewer focuses on
              practical document logic: what the official page says now, how it maps to the file the
              applicant uploads, and where applicants most often create inconsistencies across forms,
              finances, sponsor letters, and trip details.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={"/about" as Route} className={cn(buttonVariants({ variant: "outline" }))}>
              About Vidicy
            </Link>
            <Link href={"/enterprise" as Route} className={cn(buttonVariants({ variant: "ghost" }))}>
              Contact the team
            </Link>
          </div>
        </section>
      </PublicPageContent>
    </PublicPage>
  );
}
