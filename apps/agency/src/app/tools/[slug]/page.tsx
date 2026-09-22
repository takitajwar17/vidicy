import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
} from "lucide-react";

import { CANONICAL_SITE_URL, SITE_NAME } from "@/constants";
import { constructMetadata } from "@/lib/utils";
import {
  PublicPage,
  PublicPageContent,
  PublicPageHero,
  PublicSiteShell,
} from "@/components/public-page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  ENABLED_PHOTO_TOOL_SLUGS,
  getPhotoToolBySlug,
  getPhotoToolHref,
  toolsIndexItems,
  type ToolDefinition,
} from "../_content";
import { PhotoToolClient } from "../_components/photo-tool-client";

export const dynamicParams = false;

export function generateStaticParams() {
  return ENABLED_PHOTO_TOOL_SLUGS.map((slug) => ({ slug }));
}

function buildToolPageSchema(tool: ToolDefinition) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: tool.title,
    description: tool.description,
    applicationCategory: "PhotoRequirementsTool",
    operatingSystem: "Web",
    url: `${CANONICAL_SITE_URL}${getPhotoToolHref(tool.slug)}`,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: CANONICAL_SITE_URL,
    },
  };
}

function buildFaqSchema(tool: ToolDefinition) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: tool.faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

function buildBreadcrumbSchema(tool: ToolDefinition) {
  return {
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
        name: "Tools",
        item: `${CANONICAL_SITE_URL}/tools`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: tool.title,
        item: `${CANONICAL_SITE_URL}${getPhotoToolHref(tool.slug)}`,
      },
    ],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getPhotoToolBySlug(slug);

  if (!tool) {
    return constructMetadata({
      title: "Tool not found",
      description: "The requested visa tool does not exist.",
    });
  }

  return constructMetadata({
    title: tool.metaTitle,
    description: tool.metaDescription,
    alternates: {
      canonical: getPhotoToolHref(tool.slug),
    },
  });
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getPhotoToolBySlug(slug);

  if (!tool) {
    notFound();
  }

  const relatedTools = toolsIndexItems.filter((item) => item.slug !== tool.slug);
  const sidebarItems = [toolsIndexItems.find((item) => item.slug === tool.slug), ...relatedTools]
    .filter((item): item is (typeof toolsIndexItems)[number] => Boolean(item))
    .slice(0, 4);

  return (
    <PublicSiteShell>
      <PublicPage>
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildToolPageSchema(tool)) }}
        />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqSchema(tool)) }}
        />
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbSchema(tool)) }}
        />

        <PublicPageHero
          eyebrow="Tools"
          title={tool.title}
          description={tool.description}
        />

        <PublicPageContent maxWidthClassName="max-w-7xl" className="py-8 sm:py-12">
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="self-start lg:sticky lg:top-24">
              <Card className="shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Related Tools</CardTitle>
                  <CardDescription>Keep checking before you submit.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sidebarItems.map((item) => (
                    <Link
                      key={item.slug}
                      href={item.href}
                      className="block rounded-lg border bg-background/70 p-2.5 transition-colors hover:bg-muted/30"
                    >
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.routeSummary}</p>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </aside>

            <section className="space-y-3">
              <Link
                href="/tools"
                className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to tools
              </Link>

              <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <Link href="/tools" className="transition-colors hover:text-foreground">
                  Tools
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span>{tool.routeLabel}</span>
              </div>

              <PhotoToolClient tool={tool} />
            </section>
          </div>
        </PublicPageContent>
      </PublicPage>
    </PublicSiteShell>
  );
}
