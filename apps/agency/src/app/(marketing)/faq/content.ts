type FaqItem = {
  question: string;
  answer: string;
};

type FaqSection = {
  title: string;
  items: readonly FaqItem[];
};

export const faqSections = [
  {
    title: "Before You Start",
    items: [
      {
        question: "What is Vidicy?",
        answer:
          "It is for people who do not want to guess their way through an expensive visa application. Vidicy helps you build the right checklist, review your documents for risks, and tighten weak spots before you submit.",
      },
      {
        question: "Who is this for?",
        answer:
          "It is for applicants who want more clarity before they spend time, money, and energy on submission. That includes first-time applicants, people who have been rejected before, families applying together, and applicants filing from a country that is different from their passport country.",
      },
      {
        question: "Is Vidicy right for my visa type?",
        answer:
          "If your visa outcome depends on document quality, consistency, and supporting evidence, this is the kind of case the product is meant for. It is most useful when you need a stronger file, not just a basic form checklist.",
      },
      {
        question: "Which countries and visa categories do you support?",
        answer:
          "The current focus is on high-demand destinations where document review matters most, including the US, UK, Schengen countries, Canada, and Australia. Support is organized around the visa categories and embassy workflows that matter most for those routes.",
      },
      {
        question: "Can this help if I was rejected before?",
        answer:
          "Yes, and that is one of the strongest use cases for it. After a rejection, the next application usually needs stronger evidence, fewer inconsistencies, and a clearer story across the whole file.",
      },
      {
        question:
          "Can I use this if I’m applying from a country that isn’t my passport country?",
        answer:
          "Yes. The setup accounts for both your passport country and the country you are applying from, because embassy expectations can change based on where the file is submitted.",
      },
      {
        question: "Do I need to have all my documents ready before I start?",
        answer:
          "No, you do not need a perfect file to start. You can begin with what you already have, generate the checklist, and use the workflow to see what is missing before the application is complete.",
      },
      {
        question: "What happens right after I create an application?",
        answer:
          "You answer a few setup questions about your passport, destination, visa type, and embassy. From there, the product generates your checklist and walks you through upload and evaluation.",
      },
      {
        question: "How personalized is the checklist really?",
        answer:
          "It is meant to feel specific to your case, not like a generic blog checklist. The checklist is tied to your visa type, embassy, and application context.",
      },
      {
        question: "What if my embassy or consulate isn’t listed?",
        answer:
          "You are not blocked if a curated option is missing. You can still enter the embassy manually so the application can be set up and reviewed in context.",
      },
    ],
  },
  {
    title: "How It Works",
    items: [
      {
        question: "How does the AI know which documents matter for my case?",
        answer:
          "It starts with your destination, visa type, embassy, and applicant details, because that context changes what matters. That information is used to generate the checklist before document review begins.",
      },
      {
        question: "What kinds of issues will the evaluation actually catch?",
        answer:
          "It is meant to catch the kinds of issues people often miss on their own. That includes missing documents, weak evidence, incomplete letters, outdated files, and mismatches across dates, names, salary details, and travel plans.",
      },
      {
        question: "Will it flag inconsistencies between different documents?",
        answer:
          "Yes. One of the main goals is to cross-check documents against each other instead of reviewing each file in isolation.",
      },
      {
        question: "Can it tell me what’s missing, weak, or risky?",
        answer:
          "Yes. The evaluation shows what is missing, which items look weak, and where the application still carries avoidable risk.",
      },
      {
        question: "What does the readiness score actually mean?",
        answer:
          "Think of it as a practical signal, not a promise. It shows how strong the file looks based on what you uploaded and helps you decide what to fix next, but it is not a guarantee of approval.",
      },
      {
        question: "How should I interpret low, medium, or high risk?",
        answer:
          "Those labels are there to make the situation easier to read quickly. A higher-risk result means more unresolved issues remain, while a lower-risk result means the package looks stronger and more complete.",
      },
      {
        question: "Can I re-upload documents after I fix something?",
        answer:
          "Yes. The workflow is built for revision, so you can upload improved versions and keep refining the application.",
      },
      {
        question: "Do I get updated feedback each time I revise my file?",
        answer:
          "Yes. The feedback refreshes as the file changes, so you can see what improved and what still needs work.",
      },
      {
        question: "How many times can I re-evaluate my application?",
        answer:
          "The paid workflow supports repeated re-evaluations while you improve the file. The free path is more limited and is meant to help you get started before checkout.",
      },
    ],
  },
  {
    title: "Evaluations",
    items: [
      {
        question: "What is Atlas, and how is it different from ChatGPT?",
        answer:
          "Atlas is the assistant inside the product, not a general chatbot. It is designed to work inside your visa workflow, where context matters.",
      },
      {
        question:
          "Does Atlas answer based on my actual documents or just general visa advice?",
        answer:
          "It answers in the context of your actual application, not just with generic visa advice. That includes your checklist, uploaded files, and evaluation history.",
      },
      {
        question: "Can Atlas explain why a document was flagged?",
        answer:
          "Yes. One of its main jobs is to explain why something was flagged and what to do next.",
      },
      {
        question: "Can Atlas tell me how to improve a specific document?",
        answer:
          "Yes. Atlas helps you understand how to strengthen a specific document and what a better version should address.",
      },
      {
        question: "Can I ask Atlas embassy-specific questions?",
        answer:
          "Yes. The product is built around embassy-specific preparation, so embassy-level context is part of the experience.",
      },
      {
        question: "Is Atlas available before payment or only after checkout?",
        answer:
          "Atlas is part of the paid workflow. The free path lets you start, generate your checklist, and see some value before deciding whether to unlock the full analysis flow.",
      },
    ],
  },
  {
    title: "Pricing",
    items: [
      {
        question: "Is this a subscription or a one-time payment?",
        answer:
          "It is a one-time payment per application, not a recurring subscription.",
      },
      {
        question: "What do I get for free before paying?",
        answer:
          "You can start without committing right away. The free path lets you create the application, generate the checklist, and get an initial evaluation before deciding whether to pay.",
      },
      {
        question: "What unlocks after payment?",
        answer:
          "Payment unlocks the full analysis workflow, including repeated re-evaluations and Atlas, the in-product assistant.",
      },
      {
        question: "Why do I need to pay after the first evaluation?",
        answer:
          "The first evaluation is there so you can see the value before you spend more. Payment then unlocks the deeper iterative workflow instead of limiting the product to a one-off scan.",
      },
      {
        question: "Can I add my spouse, child, or other applicants later?",
        answer:
          "Yes. The product supports multi-applicant cases and lets you add more applicants after the initial setup.",
      },
      {
        question: "How does family pricing work?",
        answer:
          "Pricing adjusts based on applicant count, and the family flow is meant to make multi-person cases simpler and more economical than adding everyone one by one.",
      },
      {
        question: "What if I’m applying with multiple people under one case?",
        answer:
          "That is supported. The workflow can handle multiple applicants in the same application context so the case stays organized.",
      },
      {
        question:
          "Do all applicants need to be applying for the same visa and embassy?",
        answer:
          "Yes. Multi-applicant pricing is meant for people sharing the same visa type and embassy context within one application.",
      },
    ],
  },
  {
    title: "Trust & Support",
    items: [
      {
        question: "Is my passport, bank statement, and personal data safe here?",
        answer:
          "That concern is completely reasonable given what you are uploading. The product is designed as a secure document workflow with protected storage and controlled access because it handles sensitive identity and financial records.",
      },
      {
        question: "Where are my uploaded documents stored?",
        answer:
          "Your files are stored as part of the application workflow in protected cloud storage. Access is controlled and limited to the people who should see it.",
      },
      {
        question: "Are my documents used to train AI models?",
        answer:
          "No. Your documents are processed to deliver the checklist, evaluation, and chat experience, not to train public AI models.",
      },
      {
        question: "Who can see my application and files?",
        answer:
          "Access is limited to you and the collaborators you explicitly invite into the application.",
      },
      {
        question: "Is this legal advice?",
        answer:
          "No. Vidicy is a preparation and document-review tool, not a law firm or licensed immigration advisor.",
      },
      {
        question: "Do you guarantee visa approval?",
        answer:
          "No, and it would be dishonest to claim otherwise. The goal is to reduce preventable mistakes and help you submit a stronger application, but the embassy still makes the final decision.",
      },
      {
        question:
          "What happens if I follow the guidance and still get rejected?",
        answer:
          "That situation is why the refund policy exists. The product treats this as a limited eligible-case refund review, subject to verification of both the rejection and your compliance with the platform guidance.",
      },
      {
        question:
          "How accurate is the AI, and what should I still verify myself?",
        answer:
          "The AI is there to improve clarity and catch risks, not replace your judgment. You should still verify final requirements with the relevant embassy or consulate and stay responsible for the final submission. Visa rules, document formats, and appointment steps can change; treat the issuing government’s published checklist as the source of truth for what must be filed.",
      },
      {
        question: "Can I invite a family member or consultant into my application?",
        answer:
          "Yes. Collaboration is supported, which is useful if you do not want to manage the whole process alone.",
      },
      {
        question: "Can multiple people work on the same application?",
        answer:
          "Yes. The workflow supports shared access so more than one person can contribute within the same application context.",
      },
      {
        question: "What if I get stuck and need human help?",
        answer:
          "You do not have to figure everything out alone. There is a support path for users who need help deciding what to upload, how to proceed, or how to understand the workflow.",
      },
      {
        question: "Do you support consultants, agencies, or high-volume teams?",
        answer:
          "Yes. The product includes an enterprise path for agencies, consultancies, and higher-volume teams that need a more customized setup.",
      },
    ],
  },
  {
    title: "Official requirements",
    items: [
      {
        question: "Where should I verify the latest visa document checklist?",
        answer:
          "Always confirm document lists on the issuing government’s official immigration pages or the embassy or consulate that processes your country. Examples of primary hubs include travel.state.gov for U.S. visas, home-affairs.ec.europa.eu for Schengen policy context plus your specific member state, gov.uk for UK routes, canada.ca for IRCC, and immi.homeaffairs.gov.au for Australia. Third-party checklists can drift; embassy-published requirements are what matter at submission.",
      },
      {
        question: "What should I do when embassy rules, fees, or VAC steps change?",
        answer:
          "Refresh your checklist against the live official page, then re-check your file for cross-document consistency. Changes can affect photograph rules, translation requirements, bank-statement coverage periods, biometrics appointments, or which originals you must carry. Re-run your review after any update that affects forms, evidence windows, or appointment logistics.",
      },
      {
        question: "Does Vidicy replace embassy guidance?",
        answer:
          "No. It is a preparation and review tool that helps you organize evidence and catch inconsistencies early. It does not issue visas and cannot override the legal requirements published by governments. Use it alongside—not instead of—the official instructions for your route.",
      },
    ],
  },
] as const satisfies readonly FaqSection[];

export const faqItems: readonly FaqItem[] = faqSections.flatMap(
  (section): readonly FaqItem[] => section.items,
);

export const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  })),
} as const;
