import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { problemGuideLinks } from "@/app/(marketing)/_content/problem-guides";
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell";
import { CANONICAL_SITE_URL } from "@/constants";
import { constructMetadata } from "@/lib/utils";

export const metadata: Metadata = constructMetadata({
  title: "Visa document guides",
  description:
    "Practical visa application guides on document mistakes, proof of funds, employment letters, and how to prepare a stronger file before submission.",
  alternates: {
    canonical: "/guides",
  },
});

const guidesSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Visa document guides",
  description:
    "Guides covering common visa document mistakes, proof of funds, and employment letters.",
  url: `${CANONICAL_SITE_URL}/guides`,
  itemListElement: problemGuideLinks.map((guide, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: guide.label,
    url: `${CANONICAL_SITE_URL}${guide.href}`,
  })),
};

export default function GuidesPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(guidesSchema) }}
      />

      <PublicPageHero
        eyebrow="Guides"
        title="Visa document guides"
        description="Short, practical explainers for the parts of a visa file that most often trigger preventable refusals."
      />

      <PublicPageContent className="space-y-8">
        <section>
          <ul className="grid gap-4">
            {problemGuideLinks.map((guide) => (
              <li key={guide.href}>
                <Link
                  href={guide.href}
                  className="group flex items-start justify-between gap-4 rounded-2xl border bg-muted/30 px-5 py-5 transition-colors hover:bg-muted/60"
                >
                  <div>
                    <p className="text-xs font-mono uppercase tracking-[0.2em] text-primary">
                      Guide
                    </p>
                    <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                      {guide.label}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {guide.description}
                    </p>
                  </div>
                  <ArrowRightIcon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </PublicPageContent>
    </PublicPage>
  );
}
