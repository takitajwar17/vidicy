import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MarketingFaqPage from "@/app/(marketing)/faq/page";
import {
  faqItems,
  faqSchema,
  faqSections,
} from "@/app/(marketing)/faq/content";
import MarketingLayout from "@/app/(marketing)/layout";

describe("dedicated FAQ page", () => {
  it("keeps the visible FAQ items and FAQ schema in sync", () => {
    expect(faqSchema.mainEntity).toHaveLength(faqItems.length);
    expect(faqSchema.mainEntity).toEqual(
      faqItems.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    );
  });

  it("groups FAQ questions into clear user-facing sections", () => {
    expect(faqSections.map((section) => section.title)).toEqual([
      "Before You Start",
      "How It Works",
      "Evaluations",
      "Pricing",
      "Trust & Support",
      "Official requirements",
    ]);

    expect(faqSections.every((section) => section.items.length > 0)).toBe(true);
  });

  it("renders the dedicated marketing FAQ experience on /faq", () => {
    const markup = renderToStaticMarkup(<MarketingFaqPage />);

    expect(markup).toContain("FAQ");
    expect(markup).toContain("Everything you need to know");
    expect(markup).toContain("Before You Start");
    expect(markup).toContain("How It Works");
    expect(markup).toContain("Evaluations");
    expect(markup).toContain("Pricing");
    expect(markup).toContain("Trust &amp; Support");
    expect(markup).toContain("Official requirements");
    expect(markup).toContain("What is Vidicy?");
    expect(markup).toContain("Do I need to have all my documents ready before I start?");
    expect(markup).toContain("Can Atlas explain why a document was flagged?");
    expect(markup).toContain("What unlocks after payment?");
    expect(markup).toContain("What happens if I follow the guidance and still get rejected?");
    expect(markup).toContain("Still have questions?");
  });

  it("uses the shared marketing layout chrome once", () => {
    const markup = renderToStaticMarkup(
      <MarketingLayout>
        <MarketingFaqPage />
      </MarketingLayout>,
    );

    expect(markup.match(/Skip to main content/g)).toHaveLength(1);
    expect(markup.match(/All rights reserved\./g)).toHaveLength(1);
    expect(markup.match(/id="main-content"/g)).toHaveLength(1);
  });
});
