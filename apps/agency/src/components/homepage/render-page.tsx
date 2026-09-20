import type { ReactNode } from "react";

import type { HomepageConfig } from "@/components/homepage/config";
import { homepageFaqSchema } from "@/components/homepage/faq";
import { CANONICAL_SITE_URL } from "@/constants";

export type LandingPageRenderer = (props: {
  config: HomepageConfig;
  includeSiteChrome?: boolean;
}) => ReactNode;

const homepageSchema = {
  "@context": "https://schema.org",
  "@type": ["SoftwareApplication", "WebApplication"],
  name: "Vidicy",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Vidicy is an AI-powered visa preparation tool that helps you build an embassy-specific checklist, review application documents for missing or inconsistent evidence, understand the risk picture in your file, and improve it before submission.",
  url: CANONICAL_SITE_URL,
  featureList: [
    "Embassy-specific document checklist generation",
    "AI document evaluation and risk scoring",
    "Cross-document inconsistency detection",
    "Atlas AI assistant with document-grounded answers",
    "Iterative re-upload and re-evaluation",
    "Support for US, Schengen, UK, Canada, and Australia visas",
  ],
  offers: {
    "@type": "Offer",
    price: "79",
    priceCurrency: "USD",
  },
  publisher: {
    "@type": "Organization",
    name: "Vidicy",
    url: CANONICAL_SITE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${CANONICAL_SITE_URL}/static_logo.svg`,
    },
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Vidicy",
  url: CANONICAL_SITE_URL,
  description:
    "AI-powered visa document review. Generate embassy-specific checklists, review your file for weak or inconsistent evidence, and get guided help before you submit.",
  inLanguage: "en",
};

export function renderHomepage({
  config,
  Renderer,
}: {
  config: HomepageConfig;
  Renderer: LandingPageRenderer;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageSchema) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(homepageFaqSchema) }}
      />
      <Renderer
        config={config}
        includeSiteChrome={false}
      />
    </>
  );
}
