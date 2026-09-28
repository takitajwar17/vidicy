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
      "Agency Fit",
      "Workflow",
      "Pilots",
      "Commercials",
      "Security",
      "Official Requirements",
    ]);

    expect(faqSections.every((section) => section.items.length > 0)).toBe(true);
  });

  it("renders the dedicated marketing FAQ experience on /faq", () => {
    const markup = renderToStaticMarkup(<MarketingFaqPage />);

    expect(markup).toContain("FAQ");
    expect(markup).toContain("Questions agencies ask before using Vidicy.");
    expect(markup).toContain("Agency Fit");
    expect(markup).toContain("Workflow");
    expect(markup).toContain("Pilots");
    expect(markup).toContain("Commercials");
    expect(markup).toContain("Security");
    expect(markup).toContain("Official Requirements");
    expect(markup).toContain("What is Vidicy?");
    expect(markup).toContain("What does Vidicy check?");
    expect(markup).toContain("How do agency pilots work?");
    expect(markup).toContain("How is Vidicy priced?");
    expect(markup).toContain("Is client data safe in Vidicy?");
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
