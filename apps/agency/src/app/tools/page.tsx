import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, Wrench } from "lucide-react";

import { CANONICAL_SITE_URL } from "@/constants";
import { constructMetadata } from "@/lib/utils";
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
  PublicSiteShell,
} from "@/components/public-page-shell";
import { Card, CardContent } from "@/components/ui/card";

import { toolsIndexItems } from "./_content";

export const metadata: Metadata = constructMetadata({
  title: "Free Visa Photo and Document Tools",
  description:
    "Free visa tools for checking photo requirements, document readiness, and common mistakes before you submit.",
  alternates: {
    canonical: "/tools",
  },
});

const toolsIndexSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Visa tools",
  description: "Free visa tools for photo requirements and document readiness.",
  url: `${CANONICAL_SITE_URL}/tools`,
  itemListElement: toolsIndexItems.map((tool, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: tool.title,
    url: `${CANONICAL_SITE_URL}${tool.href}`,
  })),
};

export default function ToolsIndexPage() {
  return (
    <PublicSiteShell>
      <PublicPage>
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(toolsIndexSchema) }}
        />

        <PublicPageHero
          eyebrow="Tools"
          title="Free visa tools"
          description="Run a fast pre-check before you submit."
        />

        <PublicPageContent maxWidthClassName="max-w-6xl" className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {toolsIndexItems.length} tools live
          </p>

          <section className="grid gap-4 md:grid-cols-2">
            {toolsIndexItems.map((tool) => (
              <Link key={tool.slug} href={tool.href} className="group">
                <Card className="h-full shadow-xs transition-colors group-hover:bg-muted/20">
                  <CardContent className="flex items-start justify-between gap-3 p-5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{tool.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{tool.routeSummary}</p>
                      </div>
                    </div>
                    <ArrowRightIcon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </section>
        </PublicPageContent>
      </PublicPage>
    </PublicSiteShell>
  );
}
