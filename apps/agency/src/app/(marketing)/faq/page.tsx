import type { Metadata } from "next";

import { faqSchema, faqSections } from "@/app/(marketing)/faq/content";
import { FaqsSection } from "@/components/faqs-page";
import { PublicPage, PublicPageContent, PublicPageHero } from "@/components/public-page-shell";
import { constructMetadata } from "@/lib/utils";

export const metadata: Metadata = constructMetadata({
  title: "Agency FAQ",
  description:
    "FAQ for Vidicy agency pilots: bulk visa file review, reviewer workflows, security, pricing, and official requirement handling.",
  alternates: {
    canonical: "/faq",
  },
});

export default function MarketingFaqPage() {
  return (
    <PublicPage>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <PublicPageHero
        eyebrow="FAQ"
        title="Questions agencies ask before using Vidicy."
        description="How the review workflow, pilots, security, and commercial setup work for visa and travel agencies."
      />

      <PublicPageContent>
        <FaqsSection sections={faqSections} />
      </PublicPageContent>
    </PublicPage>
  );
}
