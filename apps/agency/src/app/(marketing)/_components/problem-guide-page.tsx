import { Suspense } from "react";

import {
  getProblemGuideImage,
  type ProblemGuideConfig,
  type ProblemGuideFaqItem,
} from "@/app/(marketing)/_content/problem-guides";
import Author from "@/components/author";
import { CANONICAL_SITE_URL, SITE_NAME } from "@/constants";
import { formatRelativeDate } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

function buildFaqSchema(faqItems: ProblemGuideFaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

function GuideArticleBody({ guide }: { guide: ProblemGuideConfig }) {
  return (
    <>
      <p>{guide.directAnswer}</p>
      {guide.inlineContextLinks?.length ? (
        <>
          <p>
            If this is the part of your file that still feels weak, these are the most relevant
            next reads.
          </p>
          <ul>
            {guide.inlineContextLinks.map((link) => (
              <li key={`${link.href}:${link.label}`}>
                <Link href={link.href}>{link.label}</Link>: {link.context}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {guide.keyTakeaways.length ? (
        <>
          <h2>Key takeaways</h2>
          <ul>
            {guide.keyTakeaways.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}

      {guide.verificationSection ? (
        <section aria-labelledby="guide-verification-heading">
          <h2 id="guide-verification-heading">{guide.verificationSection.title}</h2>
          <p>{guide.verificationSection.intro}</p>
          <h3>Primary sources to verify before you submit</h3>
          <p>
            Open the official route for your visa class and compare it to your file. These links are
            starting points for government-published requirements (refresh your checklist whenever
            rules change).
          </p>
          <ul>
            {guide.verificationSection.officialSources.map((src) => (
              <li key={src.href}>
                <a href={src.href} target="_blank" rel="noopener noreferrer">
                  {src.label}
                </a>
                : {src.note}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2>If you are applying for...</h2>
      <p>
        Start with the route that looks most like your file. The same document problem lands
        differently in a US B1/B2 visitor case than it does in a Canada study permit or a
        Schengen tourist application.
      </p>
      <ul>
        {guide.coveredRoutes.map((route) => (
          <li key={route.title}>
            <p>
              <strong>
                <Link href={route.href}>{route.title}</Link>
              </strong>{" "}
              {route.summary}
            </p>
            <ul>
              {route.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {guide.problemSections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.bullets?.length ? (
            <ul>
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <h2>How this shows up in real routes</h2>
      <p>
        These are not universal embassy rules. They are the patterns that tend to make a file look
        stronger or weaker on paper.
      </p>
      {guide.routeSections.map((section) => (
        <section key={section.title}>
          <h3>
            <Link href={section.href}>{section.title}</Link>
          </h3>
          <p>{section.summary}</p>
          <ul>
            {section.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </section>
      ))}

      <h2>{guide.comparisonTable.title}</h2>
      {guide.comparisonTable.description ? <p>{guide.comparisonTable.description}</p> : null}
      <table>
        <thead>
          <tr>
            {guide.comparisonTable.headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {guide.comparisonTable.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell) => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{guide.selfCheckHeading}</h2>
      <ol>
        {guide.selfCheckItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>

      <h2>Common questions</h2>
      {guide.faqItems.map((item) => (
        <section key={item.question}>
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </section>
      ))}

      <h2>Related guides and route pages</h2>
      <ul>
        {guide.relatedLinks.map((link) => (
          <li key={link.href}>
            <Link href={link.href}>{link.label}</Link>: {link.description}
          </li>
        ))}
      </ul>
    </>
  );
}

export function ProblemGuidePage({ guide }: { guide: ProblemGuideConfig }) {
  const pageUrl = `${CANONICAL_SITE_URL}${guide.href}`;
  const guideImage = getProblemGuideImage(guide);
  const imageUrl = `${CANONICAL_SITE_URL}${guideImage}`;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    datePublished: guide.publishedAt,
    dateModified: guide.updatedAt,
    description: guide.description,
    image: imageUrl,
    url: pageUrl,
    author: {
      "@type": "Person",
      name: "Anian",
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: CANONICAL_SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${CANONICAL_SITE_URL}/static_logo.svg`,
      },
    },
  };

  const breadcrumbSchema = {
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
        name: "Guides",
        item: `${CANONICAL_SITE_URL}/guides`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: guide.title,
        item: pageUrl,
      },
    ],
  };

  return (
    <section id="guide">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildFaqSchema(guide.faqItems)) }}
      />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <div className="mx-auto my-12 w-full max-w-[800px] space-y-4 px-4 sm:px-6 lg:px-8">
        <Suspense
          fallback={<div className="mb-8 h-64 w-full animate-pulse rounded-lg bg-muted"></div>}
        >
          <div className="mb-8">
            <Image
              width={1920}
              height={1080}
              src={guideImage}
              alt={`Cover image for ${guide.title}`}
              priority
              className="h-auto w-full rounded-lg border shadow-md"
            />
          </div>
        </Suspense>
        <div className="flex flex-col">
          <h1 className="title font-medium text-3xl tracking-tighter">{guide.title}</h1>
        </div>
        <div className="flex items-center justify-between text-sm">
          <Suspense fallback={<p className="h-5" />}>
            <div className="flex items-center space-x-2">
              <time dateTime={guide.publishedAt} className="text-sm text-muted-foreground">
                {formatRelativeDate(guide.publishedAt)}
              </time>
            </div>
          </Suspense>
        </div>
        <div className="flex items-center space-x-2">
          <Author
            twitterUsername="takitajwar17"
            name="Anian"
            image="/founder-avatar.jpeg"
          />
        </div>
        <article className="prose dark:prose-invert mx-auto max-w-full">
          <GuideArticleBody guide={guide} />
        </article>
      </div>
    </section>
  );
}
