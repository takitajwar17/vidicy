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
    "Vidicy helps visa agencies check passports, forms, bank statements, and client evidence in one review queue.",
  alternates: {
    canonical: "/about",
  },
});

const aboutPageSchema = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  name: "About Vidicy",
  description:
    "Vidicy helps visa agencies check passports, forms, bank statements, and client evidence in one review queue.",
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
        title="The bottleneck is the pile of PDFs on the review desk."
        description="Vidicy turns passports, forms, bank statements, bookings, and letters into one queue your agency team can work through."
      />

      <PublicPageContent className="space-y-12">
        <section className="max-w-3xl space-y-6 text-base leading-8 text-muted-foreground sm:text-lg">
          <p>
            Agencies already know how to sell, support, and submit visa applications. The slow part
            is the review desk: opening files one by one, checking forms against passports and bank
            statements, finding gaps, writing notes, and explaining fixes back to clients.
          </p>
          <p>
            Vidicy is built for that desk. Each case has the client, applicant, route, reviewer,
            required files, missing documents, open issues, and client fixes in one place.
          </p>
          <p>
            We are starting with agencies in high-friction visa markets, where one stale bank
            statement, unreadable passport scan, or mismatched name can send a file back to the
            client for another day.
          </p>
        </section>

        <section className="max-w-3xl space-y-5">
          <h2 className="font-display text-3xl font-normal leading-none tracking-[-0.06em] text-foreground sm:text-4xl">
            What we believe
          </h2>
          <div className="space-y-5 text-base leading-8 text-muted-foreground sm:text-lg">
            <p>
              Agencies should keep control of the client relationship and submission judgment. The
              software should do the pointing: this passport page is missing, this statement is too
              old, this travel date conflicts with the form.
            </p>
            <p>
              The best version of Vidicy is not a generic chat box. It is the desk your team already
              runs, but with queues, files, flags, notes, and follow-ups visible before a reviewer
              loses twenty minutes in tabs.
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
