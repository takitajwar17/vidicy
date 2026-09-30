import type { Metadata } from "next";
import Link from "next/link";

import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell";
import { buttonVariants } from "@/components/ui/button";
import { CANONICAL_SITE_URL } from "@/constants";
import { constructMetadata } from "@/lib/utils";

export const metadata: Metadata = constructMetadata({
  title: "About Vidicy",
  description:
    "Vidicy builds visa application review software for visa and travel agencies that process client files at scale.",
  alternates: {
    canonical: "/about",
  },
});

const aboutPageSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Vidicy",
  description:
    "Vidicy builds visa application review software for visa and travel agencies that process client files at scale.",
  url: `${CANONICAL_SITE_URL}/about`,
  isPartOf: {
    "@type": "WebSite",
    name: "Vidicy",
    url: CANONICAL_SITE_URL,
  },
  publisher: {
    "@type": "Organization",
    name: "Vidicy",
    url: CANONICAL_SITE_URL,
  },
};

export default function AboutPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageSchema) }}
      />
      <PublicPageHero
        eyebrow="About"
        title="Visa review should not depend on manual checking forever."
        description="Vidicy helps visa and travel agencies turn scattered client files into a repeatable review workflow."
      />

      <PublicPageContent className="space-y-12">
        <section className="max-w-3xl space-y-6 text-base leading-8 text-muted-foreground sm:text-lg">
          <p>
            Agencies already know how to sell, support, and submit visa applications. The slow part
            is the review desk: opening files one by one, checking forms against passports and bank
            statements, finding gaps, writing notes, and explaining fixes back to clients.
          </p>
          <p>
            Vidicy is built for that operational layer. The product gives agencies bulk intake,
            review queues, document checks, issue tracking, and client-ready reports so
            teams can review more applications without adding review headcount at the same pace.
          </p>
          <p>
            We are starting with high-volume visa and travel agencies in markets where a single
            missing document or inconsistent detail can slow down a client file for days.
          </p>
        </section>

        <section className="max-w-3xl space-y-5">
          <h2 className="font-display text-3xl font-normal leading-none tracking-[-0.06em] text-foreground sm:text-4xl">
            What we believe
          </h2>
          <div className="space-y-5 text-base leading-8 text-muted-foreground sm:text-lg">
            <p>
              Agencies should keep control of the client relationship and final submission
              decision. Software should make the review process faster, clearer, and easier to
              repeat.
            </p>
            <p>
              The best version of Vidicy is not a generic chatbot. It is a review system that fits
              how agency teams already work: queues, files, flags, notes, and follow-ups.
            </p>
          </div>
        </section>

        <div className="pt-2">
          <Link href="/enterprise" className={buttonVariants({ size: "lg" })}>
            Talk to us
          </Link>
        </div>
      </PublicPageContent>
    </PublicPage>
  );
}
