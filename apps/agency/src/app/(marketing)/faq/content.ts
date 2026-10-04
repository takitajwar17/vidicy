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
    title: "Agency Fit",
    items: [
      {
        question: "What is Vidicy?",
        answer:
          "Vidicy is a review desk for visa agencies. Upload passports, forms, bank statements, letters, bookings, and photos; Vidicy points reviewers to missing files, mismatched details, and client fixes.",
      },
      {
        question: "Who is this for?",
        answer:
          "Vidicy is for agencies where reviewers still open piles of PDFs, compare forms against passports, chase clients for missing files, and write the same follow-up notes every week.",
      },
      {
        question: "Is Vidicy replacing agency reviewers?",
        answer:
          "No. Vidicy is built to support review desks, not remove judgment. Agencies keep control of the client relationship, final notes, and submission decision.",
      },
      {
        question: "What types of agencies are a good fit?",
        answer:
          "The strongest fit is a visa or travel agency with a daily queue of client files, especially where stale statements, weak letters, unreadable scans, and name or date mismatches slow the team down.",
      },
      {
        question: "Which visa categories can Vidicy review?",
        answer:
          "Vidicy is designed around document-heavy visa routes: tourist, visit, study, work, family, and similar cases where agencies need to review forms, passports, bank statements, employment documents, invitations, bookings, and supporting evidence.",
      },
      {
        question: "Is Vidicy available to every agency right now?",
        answer:
          "We are onboarding selected agency teams through private pilots before opening broader self-serve access.",
      },
    ],
  },
  {
    title: "Workflow",
    items: [
      {
        question: "How does the review workflow work?",
        answer:
          "Agencies add a case, upload the client files, assign a reviewer, check the documents, review the flags, and send the client a list of exact fixes.",
      },
      {
        question: "What does Vidicy check?",
        answer:
          "Vidicy looks for missing documents, weak evidence, outdated files, unreadable scans, incomplete letters, and mismatches across names, dates, passport details, income, employment, travel plans, and supporting documents.",
      },
      {
        question: "Will it flag inconsistencies between different documents?",
        answer:
          "Yes. Cross-file consistency is one of the core jobs. The system is meant to catch issues that are easy to miss when reviewers open each PDF separately.",
      },
      {
        question: "Can reviewers edit the final output?",
        answer:
          "Yes. Reviewers can keep, rewrite, or remove any note before it reaches a client. The software points; the reviewer decides.",
      },
      {
        question: "What does the client receive?",
        answer:
          "The client receives a clear issue list or report explaining what needs to be fixed, added, or clarified before the agency moves the case forward.",
      },
      {
        question: "Can Vidicy handle bulk intake?",
        answer:
          "Yes, that is the core agency direction: many client files, one queue, assigned reviewers, required documents, issue lists, and repeatable review steps.",
      },
    ],
  },
  {
    title: "Pilots",
    items: [
      {
        question: "How do agency pilots work?",
        answer:
          "We start with the files your team already reviews: the route, the required documents, the reviewer handoff, and the client follow-up. Then we pilot Vidicy around that desk.",
      },
      {
        question: "What kind of agency should request access?",
        answer:
          "Request access if your team reviews client files in volume and already loses time to repeated document checks, reviewer backlogs, and vague client follow-ups.",
      },
      {
        question: "Do we need to replace our current CRM or case system?",
        answer:
          "Not at the pilot stage. Vidicy can sit beside your current process while we validate the review workflow and integration needs.",
      },
      {
        question: "Do you support custom agency requirements?",
        answer:
          "Yes. Agencies often have route-specific checklists, client templates, and internal review practices. The pilot is where we learn and adapt those details.",
      },
      {
        question: "How long does it take to start a pilot?",
        answer:
          "It depends on case volume and route complexity. The first step is a short conversation about monthly files, top visa routes, reviewer handoffs, and where clients get stuck.",
      },
    ],
  },
  {
    title: "Commercials",
    items: [
      {
        question: "How is Vidicy priced?",
        answer:
          "Vidicy is sold as B2B SaaS for agencies. Pricing depends on case volume, workflow scope, support needs, and whether the agency needs white-label, API, or custom reporting features.",
      },
      {
        question: "Is there a free public plan?",
        answer:
          "No public free plan is currently available for agencies. Access is handled through selected pilots and enterprise conversations.",
      },
      {
        question: "Can larger agencies get volume pricing?",
        answer:
          "Yes. High-volume agencies can discuss annual contracts, volume tiers, white-label workflows, and deeper operational support.",
      },
      {
        question: "Can we use Vidicy across multiple branches or teams?",
        answer:
          "That is supported in the enterprise direction. Branches, reviewer roles, team access, and reporting needs can be discussed during the pilot setup.",
      },
      {
        question: "Who should contact Vidicy from our agency?",
        answer:
          "The best person is usually the owner, operations lead, visa department head, or manager who knows how many files arrive each month and where reviewers lose time.",
      },
    ],
  },
  {
    title: "Security",
    items: [
      {
        question: "Is client data safe in Vidicy?",
        answer:
          "Client files often include passports, bank statements, and other sensitive records, so Vidicy is designed around protected storage, access control, and limited data processing.",
      },
      {
        question: "Are documents used to train outside models?",
        answer:
          "No. Client documents are processed to deliver the review workflow and are not used to train public models.",
      },
      {
        question: "Who can see client files?",
        answer:
          "Only authorized agency users should see client files. Admins manage staff access, and reviewer roles can be set during rollout.",
      },
      {
        question: "Is Vidicy legal advice?",
        answer:
          "No. Vidicy is review workflow software. It does not replace licensed immigration advice, agency judgment, or official government instructions.",
      },
      {
        question: "Do you guarantee visa approval?",
        answer:
          "No. Government authorities make final visa decisions. Vidicy helps agencies reduce preventable mistakes and improve review consistency, but it cannot guarantee outcomes.",
      },
      {
        question: "Where can we review subprocessors?",
        answer:
          "The public subprocessors page lists the current vendors used to operate the product.",
      },
    ],
  },
  {
    title: "Official Requirements",
    items: [
      {
        question: "Does Vidicy replace official government requirements?",
        answer:
          "No. Vidicy helps agencies organize and review files, but official government, embassy, consulate, and VAC instructions remain the source of truth for what must be submitted.",
      },
      {
        question: "What happens when route requirements change?",
        answer:
          "Agencies should continue checking official sources. Vidicy helps the team re-check affected files when requirements, fees, appointment steps, or evidence windows change.",
      },
      {
        question: "Can agencies keep their own route checklists?",
        answer:
          "Yes. Many agencies already have route-specific operating knowledge. Vidicy is meant to support that knowledge, not flatten it into a generic checklist.",
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
