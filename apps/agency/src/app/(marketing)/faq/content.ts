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
          "Vidicy is visa application review software for visa and travel agencies. It helps review teams check client files in bulk, flag missing documents and inconsistencies, and produce client-ready issue lists.",
      },
      {
        question: "Who is this for?",
        answer:
          "Vidicy is for agencies that already process visa applications and want to increase review capacity without adding reviewers at the same pace.",
      },
      {
        question: "Is Vidicy replacing agency reviewers?",
        answer:
          "No. Vidicy is built to support review desks, not remove judgment. Agencies keep control of the client relationship, final notes, and submission decision.",
      },
      {
        question: "What types of agencies are a good fit?",
        answer:
          "The strongest fit is a visa or travel agency reviewing many client files every month, especially where missing documents, weak evidence, and cross-file inconsistencies slow the team down.",
      },
      {
        question: "Which visa categories can the workflow support?",
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
          "Agencies upload client files, route each case into a review queue, run document checks, review flagged issues, and produce clear next steps for the client.",
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
          "Yes. The first review output is a starting point for the review desk. Reviewers can keep, revise, or remove notes before anything is sent to a client.",
      },
      {
        question: "What does the client receive?",
        answer:
          "The client receives a clear issue list or report explaining what needs to be fixed, added, or clarified before the agency moves the case forward.",
      },
      {
        question: "Can Vidicy handle bulk intake?",
        answer:
          "That is the direction of the product. The agency workflow is being built around bulk upload, case queues, reviewer dashboards, and repeatable review steps.",
      },
    ],
  },
  {
    title: "Pilots",
    items: [
      {
        question: "How do agency pilots work?",
        answer:
          "We start with a narrow workflow, review real agency cases with the team, learn where the manual bottlenecks are, and configure the pilot around the agency's existing process.",
      },
      {
        question: "What kind of agency should request access?",
        answer:
          "Request access if your team reviews client files in volume and already feels the pain of repeated manual checks, reviewer backlogs, and unclear client follow-ups.",
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
          "It depends on volume and workflow complexity. The first step is a short conversation about your current review process, case volume, routes, and reporting needs.",
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
          "The best person is usually an owner, operations lead, visa department head, or manager responsible for review throughput and client delivery quality.",
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
          "Access should be limited to authorized agency users and the systems needed to run the review. Enterprise needs such as reviewer roles and permissions can be handled as part of rollout.",
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
          "Agencies should continue checking official sources. Vidicy is meant to help review teams apply the right checklist and re-check client files when requirements, fees, appointment steps, or evidence windows change.",
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
