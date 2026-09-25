import { describe, expect, it } from "vitest";

import { homepageFaqItems, homepageFaqSchema } from "@/components/homepage/faq";

describe("homepage FAQ content", () => {
  it("keeps the visible FAQ and FAQ schema in sync", () => {
    expect(homepageFaqSchema.mainEntity).toHaveLength(homepageFaqItems.length);
    expect(homepageFaqSchema.mainEntity).toEqual(
      homepageFaqItems.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    );
  });

  it("keeps the landing page FAQ focused on pre-signup and buying-decision questions", () => {
    expect(homepageFaqItems.map(({ question }) => question)).toEqual([
      "What is Vidicy?",
      "Is this right for my visa type or situation?",
      "How is this different from a generic visa checklist or ChatGPT?",
      "What do I get for free before paying?",
      "Is this a law firm, immigration consultant, or embassy partner?",
      "Do I still need to follow official embassy or government guidance?",
      "Is this a subscription or a one-time payment?",
      "Is my passport, bank statement, and personal data safe here?",
      "What happens if I follow the guidance and still get rejected?",
    ]);
  });
});
