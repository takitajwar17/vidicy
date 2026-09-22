import Link from "next/link";

import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell";
import { buttonVariants } from "@/components/ui/button";
import { CANONICAL_SITE_URL } from "@/constants";
import { siteConfig } from "@/lib/config";
import { SUBPROCESSORS, SUBPROCESSORS_LAST_UPDATED } from "@/lib/subprocessors";
import { cn, constructMetadata } from "@/lib/utils";

const subprocessorsDescription =
  "Third-party vendors that may process personal data for Vidicy: hosting, email, analytics, security, and AI. Table lists name, purpose, and region.";

export const metadata = constructMetadata({
  title: "Subprocessors and Data Vendors",
  description: subprocessorsDescription,
  alternates: {
    canonical: "/subprocessors",
  },
});

const subprocessorsPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Subprocessors",
  description: subprocessorsDescription,
  url: `${CANONICAL_SITE_URL}/subprocessors`,
  dateModified: "2026-10-07",
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
  about: SUBPROCESSORS.map((processor) => ({
    "@type": "Organization",
    name: processor.name,
    url: processor.website,
    description: processor.purpose,
  })),
};

const columnClassName = "grid grid-cols-1 gap-3 px-5 py-5 md:grid-cols-[1.15fr_2.35fr_1.1fr_1.4fr] md:items-center md:gap-6 md:px-7";

export default function SubprocessorsPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(subprocessorsPageSchema) }}
      />

      <PublicPageHero
        eyebrow="Legal"
        title="Subprocessors"
        meta={`Current as of ${SUBPROCESSORS_LAST_UPDATED}`}
        description={`A current list of the third-party service providers that may process personal data on behalf of ${siteConfig.name}.`}
      />

      <PublicPageContent maxWidthClassName="max-w-6xl" className="space-y-10 sm:px-6">
        <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/92 shadow-[0_18px_50px_-32px_rgba(0,0,0,0.18)]">
          <div className={cn(columnClassName, "hidden border-b border-border/80 bg-muted/35 md:grid")}>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Name</p>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Purpose</p>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Location</p>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">Website</p>
          </div>

          <div className="divide-y divide-border/75">
            {SUBPROCESSORS.map((processor) => (
              <div key={processor.name}>
                <div className={cn(columnClassName, "hidden md:grid")}>
                  <p className="text-[1.05rem] font-semibold tracking-tight text-foreground">{processor.name}</p>
                  <p className="text-base leading-relaxed text-muted-foreground">{processor.purpose}</p>
                  <p className="text-base text-foreground/80">{processor.location}</p>
                  <a
                    href={processor.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-base text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
                  >
                    {processor.website}
                  </a>
                </div>

                <div className="space-y-4 px-5 py-5 md:hidden">
                  <div className="space-y-1.5">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Name</p>
                    <p className="text-lg font-semibold tracking-tight text-foreground">{processor.name}</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Purpose</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{processor.purpose}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Location</p>
                      <p className="text-sm text-foreground/80">{processor.location}</p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Website</p>
                      <a
                        href={processor.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {processor.website}
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-3xl text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            This registry reflects our current subprocessors as of {SUBPROCESSORS_LAST_UPDATED}. If you need a signed
            data processing agreement or have a vendor-specific question, contact{" "}
            <a href={`mailto:${siteConfig.links.email}`} className="font-medium text-primary hover:underline">
              {siteConfig.links.email}
            </a>
            .
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/privacy" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
              Privacy Policy
            </Link>
            <Link href="/terms" className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
              Terms of Service
            </Link>
          </div>
        </div>
      </PublicPageContent>
    </PublicPage>
  );
}
