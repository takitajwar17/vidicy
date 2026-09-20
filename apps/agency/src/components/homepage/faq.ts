export const homepageFaqItems = [
  {
    question: "What is Vidicy?",
    answer:
      "Vidicy is a document-preparation workflow that generates a route-aware checklist, evaluates uploaded PDFs for gaps and inconsistencies, and helps you tighten evidence before submission. Visa applications are expensive to get wrong, so the product focuses on preventable paperwork mistakes—not legal advice or approval guarantees.",
  },
  {
    question: "Is this right for my visa type or situation?",
    answer:
      "If your outcome depends on document quality, consistency, and supporting evidence, this is the kind of case it is built for. It is especially useful for first-time applicants, previous refusals, family cases, and applications filed outside your passport country.",
  },
  {
    question: "How is this different from a generic visa checklist or ChatGPT?",
    answer:
      "Generic tools give broad advice. Vidicy is built around your visa type, embassy or consulate, and uploaded documents, so the feedback is tied to your actual file instead of a generic answer.",
  },
  {
    question: "What do I get for free before paying?",
    answer:
      "You can start without committing right away. The free path lets you create your application, generate the checklist, and run an initial evaluation before deciding whether to pay for deeper review support.",
  },
  {
    question: "Is this a law firm, immigration consultant, or embassy partner?",
    answer:
      "No. Vidicy is a document-preparation product, not a law firm, immigration consultancy, government service, or embassy partner. It is built to help you prepare a stronger file and catch preventable document issues earlier.",
  },
  {
    question: "Do I still need to follow official embassy or government guidance?",
    answer:
      "Yes. Visa rules, document lists, and appointment steps can change. Use Vidicy to organize and cross-check your file, then confirm the latest requirements on the issuing government’s official immigration pages or your embassy—those sources define what must be submitted.",
  },
  {
    question: "Is this a subscription or a one-time payment?",
    answer:
      "It is a one-time payment per application, not a recurring subscription.",
  },
  {
    question: "Is my passport, bank statement, and personal data safe here?",
    answer:
      "That concern is completely reasonable. Your files are handled in a protected document workflow with controlled access, and they are used to generate your checklist, evaluation, and in-product assistance, not to train public AI models.",
  },
  {
    question: "What happens if I follow the guidance and still get rejected?",
    answer:
      "The goal is to reduce preventable mistakes, not make unrealistic promises. If you are still rejected after following the guidance, the case may be reviewed under the platform's eligible-case refund terms, subject to verification of both the rejection and your compliance with the guidance.",
  },
] as const;

export const homepageFaqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: homepageFaqItems.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  })),
} as const;
