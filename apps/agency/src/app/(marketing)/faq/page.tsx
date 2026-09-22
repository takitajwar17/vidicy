import type { Metadata } from "next";

import { faqSchema, faqSections } from "@/app/(marketing)/faq/content";
import { FaqsSection } from "@/components/faqs-page";
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
} from "@/components/public-page-shell";
import { constructMetadata } from "@/lib/utils";

export const metadata: Metadata = constructMetadata({
  title: "Visa application FAQ",
  description:
    "FAQ for Vidicy: embassy-specific checklists, AI document review, Atlas, privacy, pricing, refunds, and when to re-check official government guidance.",
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
        title="Visa application FAQ"
        description="Everything you need to know before you start, pay, upload, and submit."
      />

      <PublicPageContent>
        <FaqsSection sections={faqSections} />
      </PublicPageContent>
    </PublicPage>
  );
}
