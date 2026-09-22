import type { Route } from "next";

export type ProblemGuideSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export type ProblemGuideRouteExample = {
  title: string;
  href: Route;
  summary: string;
  bullets: string[];
};

export type ProblemGuideFaqItem = {
  question: string;
  answer: string;
};

export type ProblemGuideTable = {
  title: string;
  description?: string;
  headers: string[];
  rows: string[][];
};

export type ProblemGuideLink = {
  href: Route;
  label: string;
  description: string;
};

export type ProblemGuideInlineContextLink = {
  href: Route;
  label: string;
  context: string;
};

/**
 * Official portals for R03 freshness — users should verify requirements on government sites.
 * When a linked government URL or policy title changes, re-open each href, confirm the page
 * still matches the route, then bump the guide’s `updatedAt` / `lastUpdated` and re-run link checks.
 */
export type ProblemGuideOfficialSource = {
  label: string;
  /** Government or supranational site — open in new tab from the guide renderer. */
  href: string;
  note: string;
};

export type ProblemGuideVerificationSection = {
  title: string;
  intro: string;
  officialSources: ProblemGuideOfficialSource[];
};

export type ProblemGuideConfig = {
  slug: string;
  href: Route;
  title: string;
  description: string;
  cardImage?: string;
  eyebrow: string;
  publishedAt: string;
  updatedAt: string;
  lastUpdated: string;
  directAnswerHeading: string;
  directAnswer: string;
  inlineContextLinks?: ProblemGuideInlineContextLink[];
  coveredRoutes: ProblemGuideRouteExample[];
  keyTakeaways: string[];
  problemSections: ProblemGuideSection[];
  routeSections: ProblemGuideRouteExample[];
  comparisonTable: ProblemGuideTable;
  selfCheckHeading: string;
  selfCheckItems: string[];
  faqItems: ProblemGuideFaqItem[];
  relatedLinks: ProblemGuideLink[];
  /** Optional: embassy-rule refresh copy + primary-source links. */
  verificationSection?: ProblemGuideVerificationSection;
};

export type ProblemGuideCard = {
  title: string;
  publishedAt: string;
  summary: string;
  author: string;
  slug: string;
  image: string;
  href: Route;
};

export const GUIDE_DEFAULT_IMAGE = "/static_logo.svg";

export const visaRouteLinks: ProblemGuideLink[] = [
  {
    href: "/visas/us" as Route,
    label: "US visa routes",
    description: "B1/B2 visitor and F-1 student examples",
  },
  {
    href: "/visas/schengen" as Route,
    label: "Schengen visa routes",
    description: "Short-stay visitor examples across Schengen states",
  },
  {
    href: "/visas/uk" as Route,
    label: "UK visa routes",
    description: "Standard Visitor and student examples",
  },
  {
    href: "/visas/canada" as Route,
    label: "Canada visa routes",
    description: "TRV and study permit examples",
  },
  {
    href: "/visas/australia" as Route,
    label: "Australia visa routes",
    description: "Visitor and student examples",
  },
];

export const problemGuideLinks: ProblemGuideLink[] = [
  {
    href: "/guides/avoid-visa-rejection-document-mistakes" as Route,
    label: "Avoid visa rejection due to document mistakes",
    description: "The paperwork issues that quietly break otherwise viable files.",
  },
  {
    href: "/guides/proof-of-funds-for-visa-application" as Route,
    label: "Proof of funds for a visa application",
    description: "What officers look for in bank statements, sponsor evidence, and money flow.",
  },
  {
    href: "/guides/employment-letter-for-visa-application" as Route,
    label: "Employment letter for a visa application",
    description: "What HR letters need to say if they are going to help instead of hurt.",
  },
];

export const problemGuides: Record<string, ProblemGuideConfig> = {
  "avoid-visa-rejection-document-mistakes": {
    slug: "avoid-visa-rejection-document-mistakes",
    href: "/guides/avoid-visa-rejection-document-mistakes" as Route,
    title: "How to avoid visa rejection due to document mistakes",
    description:
      "A practical guide to the document mistakes that trigger visa refusals, with route-specific examples for US, Schengen, UK, Canada, and Australia applications.",
    cardImage: "/guides/hidden-document-errors-magnifying-glass.avif",
    eyebrow: "Guide",
    publishedAt: "2026-10-08",
    updatedAt: "2026-10-08",
    lastUpdated: "October 8, 2026",
    directAnswerHeading: "Short answer",
    directAnswer:
      "This guide is for first-time and repeat applicants who need stronger documentary evidence and cross-document consistency before submission—not legal advice on whether you qualify. Many visa refusals are not caused by being unqualified. They happen because the paperwork does not hold together: a bank statement stops too early, an employment letter leaves out key details, a sponsor document is too thin, or the dates across the file do not match. Consular officers read the file as a whole, so small inconsistencies that look harmless in isolation can weaken credibility once documents are compared side by side.",
    inlineContextLinks: [
      {
        href: "/tools/us-visa-photo-requirements" as Route,
        label: "US visa photo checker",
        context: "Useful when your file has photo-size or formatting risk.",
      },
      {
        href: "/tools/schengen-visa-photo-requirements" as Route,
        label: "Schengen visa photo checker",
        context: "Quick pre-check before a final route-specific review.",
      },
    ],
    coveredRoutes: [
      {
        title: "US B1/B2 visitor visa",
        href: "/visas/us" as Route,
        summary: "Travel purpose, funding story, and return-tie evidence need to make sense together.",
        bullets: [
          "Travel dates should line up with leave dates and hotel or host details.",
          "Bank statements should support the trip without looking newly staged.",
        ],
      },
      {
        title: "US F-1 student visa",
        href: "/visas/us" as Route,
        summary: "Tuition funding, sponsor evidence, and source of funds need to be easy to follow.",
        bullets: [
          "Sponsor letters without sponsor bank records usually leave holes.",
          "Large recent transfers need a believable source and supporting documents.",
        ],
      },
      {
        title: "Schengen short-stay tourist visa",
        href: "/visas/schengen" as Route,
        summary: "Travel insurance, leave approval, trip cost coverage, and booking dates are compared closely.",
        bullets: [
          "Insurance dates should cover the actual stay, not just the flight dates.",
          "Employment and bank evidence should support the same travel window.",
        ],
      },
      {
        title: "UK Standard Visitor visa",
        href: "/visas/uk" as Route,
        summary: "The file needs a coherent story about purpose, funding, and ties back home.",
        bullets: [
          "A healthy balance is not enough if the money flow looks borrowed or unexplained.",
          "Employer and sponsor documents should support the same narrative as the application form.",
        ],
      },
      {
        title: "Canada Temporary Resident Visa",
        href: "/visas/canada" as Route,
        summary: "Invitation letters, sponsor proof, and traceable finances matter more than generic reassurance.",
        bullets: [
          "Support letters should be backed by the inviter's financial evidence if they are paying.",
          "Employment and property documents help the return-home story feel real.",
        ],
      },
      {
        title: "Australia Visitor visa subclass 600",
        href: "/visas/australia" as Route,
        summary: "Purpose of travel, accessible funds, and employment ties often carry the file.",
        bullets: [
          "The funding evidence should show actual access to money, not just paper support.",
          "Employer letters should confirm leave and expected return to work.",
        ],
      },
    ],
    keyTakeaways: [
      "Officers compare documents against each other, not one by one.",
      "A single weak document can cast doubt on stronger ones nearby.",
      "Document quality is often about consistency, not just completeness.",
    ],
    problemSections: [
      {
        title: "Reference numbers and official sources (verify on the primary site)",
        paragraphs: [
          "These figures come from public rules and fee schedules. Fees and procedures change—always confirm the live page before you budget or book travel.",
          "Under Article 23 of the EU Visa Code, a decision on a Schengen visa application should normally be taken within 15 calendar days, and in individual cases may take up to 45 calendar days (Regulation (EU) 2019/1155; consolidated Visa Code on EUR-Lex). Article 12(1)(a) requires a passport valid at least three months after the intended departure from Member States’ territory, issued within the previous 10 years, and containing at least two blank pages.",
          "The U.S. Department of State lists a $185 machine-readable visa (MRV) fee for most nonimmigrant visa classes (including common visitor and student categories) on its official fee schedule—see travel.state.gov “Fees for Visa Services.”",
          "UK entry clearance decisions follow the Immigration Rules (Appendix Visitor, paragraph V 4.2 sets out the grounds to be satisfied). The Home Office publishes national statistics on applications and outcomes by category in data tables on GOV.UK (Immigration system statistics data tables; also quarterly “Visas, status and immigration data” releases). Use those tables for route-level volumes, not forum anecdotes.",
        ],
      },
      {
        title: "Missing or incomplete documents",
        paragraphs: [
          "A file can look complete at a glance and still be weak. The problem is often not a missing category of document. It is a missing detail inside a document that should have carried more weight.",
          "Applicants commonly upload an employment letter with no salary, bank statements that stop before the application date, or sponsor letters with no evidence showing where the money is coming from.",
        ],
        bullets: [
          "Bank statements that do not cover the expected review period",
          "Employment letters without start date, salary, or leave approval",
          "Sponsor letters without sponsor bank records, payslips, or ID",
          "Travel insurance that does not cover the full stay",
        ],
      },
      {
        title: "Cross-document mismatches",
        paragraphs: [
          "Consular officers do not treat each PDF as a separate story. They compare the employer name in the employment letter with the bank statement header, the trip dates in the application form with hotel reservations, and the salary on paper with the deposits in the account.",
          "A mismatch does not always mean fraud, but it does create work for the officer. In a high-volume system, that is a bad place to be.",
        ],
        bullets: [
          "Employer name written differently across documents",
          "Salary that does not match the deposit pattern",
          "Trip dates that do not line up across form, booking, and insurance",
          "Address or passport details that change from one file to the next",
        ],
      },
      {
        title: "Weak sponsor and relationship evidence",
        paragraphs: [
          "Sponsored files often fail because they prove intent but not capacity. A relative may write a generous support letter, but if the file does not show the sponsor's income, bank history, and relationship to the applicant, the promise carries less weight.",
          "This shows up often in visitor and student routes where the applicant is not personally funding the full trip.",
        ],
      },
      {
        title: "Translation, formatting, and presentation problems",
        paragraphs: [
          "Some files break down for boring reasons: a translated birth certificate does not match the passport spelling, a scan cuts off the account holder's name, or the photo size is wrong for the country.",
          "These are exactly the kinds of problems applicants skip when they are focused on the bigger story of the trip.",
        ],
      },
    ],
    routeSections: [
      {
        title: "US B1/B2 visitor visa",
        href: "/visas/us" as Route,
        summary:
          "Tourist and business visitor files usually get weaker when the travel purpose sounds clean but the supporting paperwork does not quite back it up.",
        bullets: [
          "The employment letter should support the same travel dates and return timeline.",
          "If a host or family member is covering costs, the file should show that relationship and their ability to pay.",
          "The bank history should look stable before the application, not suddenly inflated.",
        ],
      },
      {
        title: "Schengen short-stay tourist visa",
        href: "/visas/schengen" as Route,
        summary:
          "Schengen files are often broken by technical details that feel minor to the applicant but obvious to the reviewer.",
        bullets: [
          "Insurance dates should cover the full stay across the intended travel window.",
          "Leave approval, hotel reservations, and flight timing should tell one clean story.",
          "Three months of banking history is often more believable than a last-minute balance screenshot.",
        ],
      },
      {
        title: "UK Standard Visitor visa",
        href: "/visas/uk" as Route,
        summary:
          "UK visitor cases usually weaken when the source of money or the credibility of the trip is left too vague.",
        bullets: [
          "Unexplained deposits can undercut an otherwise strong balance.",
          "If a sponsor is paying, the file should prove both relationship and funding source.",
          "Employment and property evidence can help the return-home story feel grounded.",
        ],
      },
      {
        title: "Canada Temporary Resident Visa",
        href: "/visas/canada" as Route,
        summary:
          "For Canada TRV files, invitation letters and support claims need enough evidence behind them to stand up on paper.",
        bullets: [
          "The inviter's documents should match what the invitation letter promises.",
          "The applicant's own financial and employment records should still make sense, even in a sponsored trip.",
          "Relationship and return-home evidence matter more when the overall file feels thin.",
        ],
      },
      {
        title: "Australia Visitor visa subclass 600",
        href: "/visas/australia" as Route,
        summary:
          "Australia visitor files often depend on whether the officer can quickly see a stable financial position and a credible reason to return home.",
        bullets: [
          "Employer evidence should confirm ongoing work and approved leave.",
          "Bank statements should show usable funds, not money that appeared just before lodgement.",
          "If a family member is supporting the trip, their evidence should be complete, not just promised.",
        ],
      },
    ],
    comparisonTable: {
      title: "What officers compare against what",
      description: "The same document can look fine by itself and weak once it is checked against the rest of the file.",
      headers: ["Document", "Compared against", "What commonly breaks", "Why it matters"],
      rows: [
        [
          "Employment letter",
          "Bank statement header and salary deposits",
          "Employer name or salary figure does not line up",
          "It makes both documents feel less reliable.",
        ],
        [
          "Application form travel dates",
          "Hotel booking, flight itinerary, and insurance",
          "The dates are not consistent across the file",
          "It suggests careless prep or an unstable travel plan.",
        ],
        [
          "Sponsor letter",
          "Sponsor bank statements and payslips",
          "The promise to pay is not backed by evidence",
          "Support that cannot be verified does not carry much weight.",
        ],
        [
          "Passport and translated civil documents",
          "Birth certificate, marriage certificate, affidavits",
          "Name spellings or dates do not match exactly",
          "Identity mismatches create avoidable questions.",
        ],
        [
          "Immigration Rules / visa law conditions",
          "Evidence you submit (forms, finances, ties)",
          "The applicant tells a plausible story but does not prove each legal requirement with documents",
          "UK visit decisions are assessed against the Immigration Rules (Appendix Visitor, V 4.2). Official outcomes—not rumors—appear in Home Office national statistics (GOV.UK: Immigration system statistics data tables, https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables). Why it matters: refusals often cite insufficient evidence or credibility assessed against those rules; weak paperwork fails the test even when the trip sounds reasonable.",
        ],
      ],
    },
    selfCheckHeading: "Quick self-check before you submit",
    selfCheckItems: [
      "Make sure every major document covers the right date range with no gaps.",
      "Check that names, employer details, salary, and travel dates match across the file.",
      "Make sure sponsor claims are backed by sponsor evidence, not just a letter.",
      "Recheck insurance, hotel, and flight timing against the application form.",
      "Review translated documents against the passport spelling line by line.",
      "Look for any document that sounds weaker when read next to the rest of the file.",
    ],
    faqItems: [
      {
        question: "Can one document mismatch really lead to a visa refusal?",
        answer:
          "Yes. A mismatch does not always mean refusal by itself, but it can make the officer doubt the reliability of the rest of the file. In a document-heavy route, that matters.",
      },
      {
        question: "Do consular officers compare employment letters with bank statements?",
        answer:
          "They often do. If the salary on the letter does not fit the deposits in the account, or the employer name changes from one document to another, it raises questions quickly.",
      },
      {
        question: "What if I am being sponsored by family?",
        answer:
          "Then the relationship and the sponsor's ability to pay both need proof. A support letter alone is usually not the whole answer.",
      },
      {
        question: "Is this different for Schengen, UK, Canada, US, and Australia cases?",
        answer:
          "Yes. The same themes repeat, but the route-specific weak spots change. Schengen files often break on technical trip documents, while student and sponsored routes often break on funding clarity.",
      },
      {
        question: "What should I do when embassy rules or document lists change?",
        answer:
          "Re-check the official government or embassy website for your route, then update your checklist and re-run a cross-document review. Changes can affect translation rules, photograph specifications, bank-statement coverage windows, appointment steps, or which originals you must carry.",
      },
    ],
    relatedLinks: [
      problemGuideLinks[1],
      problemGuideLinks[2],
      ...visaRouteLinks,
    ],
    verificationSection: {
      title: "Verify official requirements and refresh when rules change",
      intro:
        "Document quality is only half of the story. The other half is whether the embassy or VAC still accepts the same forms, translations, and evidence windows on the day you apply. Treat embassy rules as a moving target (R03 freshness): re-check the official checklist after policy updates, holidays, or new fee and service rules, then re-run your own cross-document review before submission. If a linked government URL returns an error, redirects to a replacement policy page, or shows a new fee or document list, stop and re-verify your pack against that page before submitting—and refresh this guide’s last updated date after you confirm outbound links still match the cited policy.",
      officialSources: [
        {
          label: "United States — visas (nonimmigrant overview)",
          href: "https://travel.state.gov/content/travel/en/us-visas.html",
          note: "Use for the official US visa category you are applying under and the supporting document expectations published by the U.S. Department of State.",
        },
        {
          label: "European Union — Schengen visa policy",
          href: "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy_en",
          note: "Use for the EU-level Schengen visa framework and links to the consulate that handles your country.",
        },
        {
          label: "United Kingdom — Standard Visitor visa",
          href: "https://www.gov.uk/standard-visitor",
          note: "Use for the official GOV.UK document and evidence guidance for the route you select.",
        },
        {
          label: "Canada — visit, study, and work",
          href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/application.html",
          note: "Use for the Immigration, Refugees and Citizenship Canada (IRCC) document checklist tied to your form and biometric steps.",
        },
        {
          label: "Australia — Department of Home Affairs",
          href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing",
          note: "Use for the official visa listing and the checklist for the subclass you are lodging.",
        },
      ],
    },
  },
  "proof-of-funds-for-visa-application": {
    slug: "proof-of-funds-for-visa-application",
    href: "/guides/proof-of-funds-for-visa-application" as Route,
    title: "Proof of funds for a visa application",
    description:
      "What proof of funds should show, why bank statements get flagged, and how officers review money evidence on Schengen, UK, Canada, US, and Australia visas.",
    cardImage: "/guides/proof-of-funding-for-visa-applications-hero.avif",
    eyebrow: "Guide",
    publishedAt: "2026-10-08",
    updatedAt: "2026-10-08",
    lastUpdated: "October 8, 2026",
    directAnswerHeading: "Short answer",
    directAnswer:
      "Proof of funds is not only about showing a balance. It is about showing a believable money story: where the funds came from, whether they have been there long enough to look real, whether the applicant or sponsor can actually use them, and whether the amount fits the trip, tuition, or stay being proposed. When embassy rules change, the required statement window or acceptable account types can change too—re-check the official checklist, then re-verify your money evidence against it.",
    inlineContextLinks: [
      {
        href: "/guides/avoid-visa-rejection-document-mistakes" as Route,
        label: "Avoid visa rejection due to document mistakes",
        context: "Cross-document mismatch checklist before submission.",
      },
      {
        href: "/visas" as Route,
        label: "Route checklist hub",
        context: "Use the destination-specific checklist for your visa class.",
      },
    ],
    coveredRoutes: [
      {
        title: "Schengen short-stay tourist visa",
        href: "/visas/schengen" as Route,
        summary: "Trip cost, stay length, and recent account history usually matter more than a single ending balance.",
        bullets: [
          "The money should look sufficient across the trip, not just on one day.",
          "Large deposits right before filing often need explanation.",
        ],
      },
      {
        title: "UK Standard Visitor visa",
        href: "/visas/uk" as Route,
        summary: "The UK route often hinges on whether the source of funds is credible and easy to trace.",
        bullets: [
          "Officers want to see where the money came from, not just that it exists.",
          "Sponsor-backed trips still need sponsor proof and relationship context.",
        ],
      },
      {
        title: "Canada study permit",
        href: "/visas/canada" as Route,
        summary: "Tuition support and living-cost evidence need to be traceable and usable.",
        bullets: [
          "A sponsor letter without source documents leaves a big gap.",
          "Money should look available for study, not parked temporarily for the application.",
        ],
      },
      {
        title: "US F-1 student visa",
        href: "/visas/us" as Route,
        summary: "Funding evidence needs to make sense against tuition, sponsor capacity, and the student's overall profile.",
        bullets: [
          "Recent large transfers need context.",
          "Sponsor evidence should be complete enough to stand on its own.",
        ],
      },
      {
        title: "Australia Student visa subclass 500",
        href: "/visas/australia" as Route,
        summary: "Funds should look accessible, documented, and consistent with the claimed plan of study.",
        bullets: [
          "The money should not look borrowed for a screenshot.",
          "Supporting records matter when a relative is funding the route.",
        ],
      },
    ],
    keyTakeaways: [
      "A strong balance is not enough if the money flow looks staged.",
      "Sponsors need to prove both willingness and capacity.",
      "Continuity over time is usually more persuasive than a last-minute top-up.",
    ],
    problemSections: [
      {
        title: "What proof of funds is actually trying to prove",
        paragraphs: [
          "Officers are usually looking for three things at once: whether the money exists, whether the applicant can really use it, and whether the money story fits the trip or study plan.",
          "That is why a balance screenshot often does less work than a proper run of statements, payslips, tax records, and sponsor evidence.",
        ],
      },
      {
        title: "Why bank statements get flagged",
        paragraphs: [
          "A statement gets weaker when it looks freshly assembled for the application. The classic signs are a large unexplained deposit, a balance that has been near zero for months and suddenly rises, or a statement that does not cover the expected review period.",
          "Officers also notice when the account holder's name is missing, the statement is cropped badly, or the account type is not a natural fit for the claimed funding story.",
        ],
        bullets: [
          "Recent unexplained deposits",
          "Statements that stop too early",
          "Accounts that regularly drop too low for the claimed trip",
          "Screenshots without enough account detail to verify ownership",
        ],
      },
      {
        title: "Salaried, self-employed, and sponsored applicants are judged differently",
        paragraphs: [
          "A salaried applicant usually needs statements and income records that line up cleanly. A self-employed applicant may need to work harder to show regular income and legitimate business activity. A sponsored applicant needs both the applicant's own situation and the sponsor's capacity to be understandable on paper.",
          "Where people get stuck is assuming one kind of proof covers every situation. It usually does not.",
        ],
      },
    ],
    routeSections: [
      {
        title: "Schengen short-stay tourist visa",
        href: "/visas/schengen" as Route,
        summary:
          "A Schengen visitor file usually needs funds that make sense against the trip length, accommodation plan, and supporting documents.",
        bullets: [
          "A last-minute balance jump can look weaker than a lower but stable account history.",
          "If a relative is helping, the file should still show who is paying for what.",
          "Travel dates and money availability should overlap cleanly.",
        ],
      },
      {
        title: "UK Standard Visitor visa",
        href: "/visas/uk" as Route,
        summary:
          "UK visitor decisions often turn on whether the source of money is credible and traceable, not just whether the balance looks high.",
        bullets: [
          "Explain unusual deposits with supporting papers where possible.",
          "Sponsor-backed trips need sponsor income and bank evidence, not just a promise.",
          "The money story should fit the applicant's job, business, or family situation.",
        ],
      },
      {
        title: "Canada study permit",
        href: "/visas/canada" as Route,
        summary:
          "Canada study cases often weaken when tuition funding is claimed broadly but not documented tightly enough.",
        bullets: [
          "If parents or relatives are paying, their relationship and source of funds should be easy to prove.",
          "Statements should make it clear the money is actually available for school and living costs.",
          "The file should not force the officer to guess how tuition will really be covered.",
        ],
      },
      {
        title: "US F-1 student visa",
        href: "/visas/us" as Route,
        summary:
          "US student files usually need a funding story that is straightforward enough to survive both document review and follow-up questioning.",
        bullets: [
          "Sponsor letters should match sponsor statements, tax records, and employment evidence.",
          "Sudden transfers into the student's account are weaker if there is no source explanation.",
          "The overall funding should look plausible against the academic plan.",
        ],
      },
      {
        title: "Australia Student visa subclass 500",
        href: "/visas/australia" as Route,
        summary:
          "Australia student cases often come down to whether the claimed money looks accessible and genuinely tied to the applicant's plan.",
        bullets: [
          "Usable funds usually matter more than impressive but hard-to-access assets.",
          "If family money is involved, show the connection and the source clearly.",
          "The evidence should feel stable, not staged for filing week.",
        ],
      },
    ],
    comparisonTable: {
      title: "Weak evidence versus stronger evidence",
      headers: ["Situation", "Weak evidence", "Stronger evidence", "Why the stronger version works better"],
      rows: [
        [
          "Recent large deposit",
          "One statement with a balance spike and no explanation",
          "Statement history plus salary records, transfer source, or sponsor explanation",
          "It gives the officer a believable source instead of a guess.",
        ],
        [
          "Sponsored trip",
          "Sponsor letter only",
          "Sponsor letter, sponsor bank statements, payslips or tax records, and proof of relationship",
          "It proves the sponsor can actually do what the letter promises.",
        ],
        [
          "Student funding",
          "Generic claim that tuition is covered",
          "Clear statements, sponsor papers, and a traceable source of funds",
          "It shows how the plan will really be paid for.",
        ],
        [
          "Regular income",
          "A balance with no visible income pattern",
          "Statements that show a stable deposit pattern linked to employment or business records",
          "It makes the account history feel real and ongoing.",
        ],
      ],
    },
    selfCheckHeading: "Proof-of-funds self-check",
    selfCheckItems: [
      "Review whether the statement period covers the time the officer would expect to see.",
      "Flag any large recent deposit and ask whether you can prove where it came from.",
      "Make sure the account holder name and account details are visible.",
      "Check that the amount shown makes sense for the trip, course, or stay you are claiming.",
      "If you are sponsored, make sure the sponsor file proves both relationship and financial capacity.",
      "Read the financial story from start to finish and see whether a stranger would believe it quickly.",
    ],
    faqItems: [
      {
        question: "Is a high bank balance enough for a visa application?",
        answer:
          "Not by itself. Officers usually care about how the money got there, whether it looks stable, and whether it fits the applicant's overall story.",
      },
      {
        question: "Can I use a family sponsor for proof of funds?",
        answer:
          "Yes, in many routes, but the sponsor file usually needs more than a letter. Relationship proof and sponsor financial records matter.",
      },
      {
        question: "Do unexplained deposits really hurt a file?",
        answer:
          "They can. A recent large deposit is one of the easiest things for an officer to question if the source is not obvious from the rest of the documents.",
      },
      {
        question: "Is proof of funds judged the same way for visitor and student visas?",
        answer:
          "No. The same documents may appear in both routes, but student cases usually need a clearer long-range funding story while visitor cases focus more on trip affordability and credibility.",
      },
      {
        question: "What if the embassy updates financial evidence rules after I gathered my statements?",
        answer:
          "Pull the latest official guidance for your route, then refresh your proof-of-funds pack. You may need a longer statement period, different account types, or extra sponsor documents. Re-run a consistency check so deposits, sponsor letters, and tuition figures still align after the change.",
      },
    ],
    relatedLinks: [
      problemGuideLinks[0],
      problemGuideLinks[2],
      ...visaRouteLinks,
    ],
    verificationSection: {
      title: "Verify financial requirements and refresh when rules change",
      intro:
        "Minimum balances, acceptable account types, and how many months of history to show are set by the issuing authority for your visa class—not by a blog or a template. When fees, biometrics, or evidence rules update (R03), download fresh bank packs and re-check sponsor documents against the live checklist before submission.",
      officialSources: [
        {
          label: "United States — visas (nonimmigrant overview)",
          href: "https://travel.state.gov/content/travel/en/us-visas.html",
          note: "Confirm funding expectations for your visa category and any school or sponsor forms tied to US study routes.",
        },
        {
          label: "European Union — Schengen visa policy",
          href: "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy_en",
          note: "Use with your member state’s consulate page for means-of-support and insurance rules.",
        },
        {
          label: "United Kingdom — Standard Visitor visa",
          href: "https://www.gov.uk/standard-visitor",
          note: "Check maintenance and evidence expectations for the route you select.",
        },
        {
          label: "Canada — IRCC applications",
          href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/application.html",
          note: "Align proof of funds with the document list for your specific form and program.",
        },
        {
          label: "Australia — Department of Home Affairs visa listing",
          href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing",
          note: "Confirm financial capacity wording for the subclass you lodge.",
        },
      ],
    },
  },
  "employment-letter-for-visa-application": {
    slug: "employment-letter-for-visa-application",
    href: "/guides/employment-letter-for-visa-application" as Route,
    title: "Employment letter for a visa application",
    description:
      "What employment letters must include for visas, common HR gaps, and how officers read them on Schengen, UK, Canada, US, and Australia routes.",
    cardImage: "/guides/employment-letter-for-visa-checklist-hero.avif",
    eyebrow: "Guide",
    publishedAt: "2026-10-08",
    updatedAt: "2026-10-08",
    lastUpdated: "October 8, 2026",
    directAnswerHeading: "Short answer",
    directAnswer:
      "A good employment letter proves that the applicant has real ongoing work, approved leave for the trip, steady income, and a clear reason to return. A weak one is often too vague to do any of that. It may confirm the person works there, but leave out salary, start date, leave approval, or any statement that they are expected back. If the embassy asks for updated employment evidence, request a new letter so dates and figures still match your bank records and itinerary.",
    inlineContextLinks: [
      {
        href: "/guides/proof-of-funds-for-visa-application" as Route,
        label: "Proof of funds for a visa application",
        context: "Use this to align salary claims with account history.",
      },
      {
        href: "/visas" as Route,
        label: "Visa route pages",
        context: "Pick the route-specific checklist that matches your case.",
      },
    ],
    coveredRoutes: [
      {
        title: "Schengen short-stay tourist visa",
        href: "/visas/schengen" as Route,
        summary: "Schengen files often rely on the employment letter to support both funding and return-home ties.",
        bullets: [
          "Leave dates should match the trip exactly.",
          "Salary and role should fit the banking pattern.",
        ],
      },
      {
        title: "UK Standard Visitor visa",
        href: "/visas/uk" as Route,
        summary: "The letter helps show stable work and reason to return after the visit.",
        bullets: [
          "Generic HR confirmation letters often do less work than people think.",
          "Role, salary, and return-to-work language matter.",
        ],
      },
      {
        title: "Canada Temporary Resident Visa",
        href: "/visas/canada" as Route,
        summary: "Employment evidence helps the file show both finances and local ties.",
        bullets: [
          "A letter that matches payslips and bank deposits is much stronger.",
          "Approved leave helps the travel plan feel real rather than speculative.",
        ],
      },
      {
        title: "Australia Visitor visa subclass 600",
        href: "/visas/australia" as Route,
        summary: "Australia visitor files often get stronger when the employment letter is detailed and current.",
        bullets: [
          "The officer should be able to see the job, income, leave, and expected return in one place.",
          "Outdated or generic letters leave more room for doubt.",
        ],
      },
      {
        title: "US B1/B2 visitor visa",
        href: "/visas/us" as Route,
        summary: "The letter can support the return-home story and explain why the trip fits the applicant's real work life.",
        bullets: [
          "A clean leave approval line helps if the trip is short and specific.",
          "Salary and employer details should not conflict with the bank evidence.",
        ],
      },
    ],
    keyTakeaways: [
      "Employment letters do more than confirm a job exists.",
      "The best letters match the rest of the file line by line.",
      "HR letters often need a specific request because standard templates are too thin.",
    ],
    problemSections: [
      {
        title: "What the letter is trying to prove",
        paragraphs: [
          "The letter usually has to do at least four jobs: confirm the applicant really works there, show the income level, approve the leave, and show there is a job to return to after the trip.",
          "If one of those pieces is missing, the letter may still exist, but it may not do enough work for the route.",
        ],
      },
      {
        title: "What HR often leaves out",
        paragraphs: [
          "A lot of HR teams issue a generic employment confirmation letter because that is what they use for banking or rental purposes. That version may mention the role and nothing else.",
          "For a visa file, the missing details are usually the important ones: salary, leave approval, employment start date, and return-to-work confirmation.",
        ],
        bullets: [
          "No salary figure",
          "No approved leave dates",
          "No start date",
          "No statement that the employee is expected back",
          "No signatory details or company contact information",
        ],
      },
      {
        title: "Why the letter has to match the rest of the file",
        paragraphs: [
          "The employment letter is rarely read alone. It is checked against payslips, bank deposits, tax records, and the travel dates in the application.",
          "If the salary on the letter does not match the statement pattern, or the leave dates do not match the itinerary, the letter stops helping and starts raising questions.",
        ],
      },
    ],
    routeSections: [
      {
        title: "Schengen short-stay tourist visa",
        href: "/visas/schengen" as Route,
        summary:
          "For Schengen visitor files, the employment letter often carries both the leave approval and the return-home story.",
        bullets: [
          "Leave dates should match the itinerary and hotel dates.",
          "Salary should fit the bank statement deposits.",
          "The letter should make it obvious the applicant is expected back at work.",
        ],
      },
      {
        title: "UK Standard Visitor visa",
        href: "/visas/uk" as Route,
        summary:
          "UK visitor cases usually benefit from an employment letter that sounds concrete, not ceremonial.",
        bullets: [
          "The officer should see role, salary, and approved leave without reading between the lines.",
          "A short trip backed by real leave approval is easier to believe than a vague travel plan.",
          "The letter should support the applicant's local ties, not just their income.",
        ],
      },
      {
        title: "Canada Temporary Resident Visa",
        href: "/visas/canada" as Route,
        summary:
          "In a Canada TRV file, employment evidence helps show both economic stability and a reason to return after the trip.",
        bullets: [
          "The letter should line up with payslips and bank statements.",
          "Approved leave makes the trip look planned rather than speculative.",
          "If the applicant changed jobs recently, the rest of the file should explain that cleanly.",
        ],
      },
      {
        title: "Australia Visitor visa subclass 600",
        href: "/visas/australia" as Route,
        summary:
          "Australia visitor cases often get stronger when the employment letter is current, specific, and visibly tied to the actual trip.",
        bullets: [
          "Use exact leave dates rather than generic wording.",
          "Include salary and role so the banking pattern is easier to read.",
          "Make the expected return-to-work line explicit.",
        ],
      },
      {
        title: "US B1/B2 visitor visa",
        href: "/visas/us" as Route,
        summary:
          "For US B1/B2 files, the employment letter can help the officer see that the trip fits inside a real working life the applicant will return to.",
        bullets: [
          "The leave period should make sense for the trip being described.",
          "The employer name should match the bank statement header and any supporting records.",
          "If the trip is employer-related, the letter should make that relationship clear.",
        ],
      },
    ],
    comparisonTable: {
      title: "What makes an employment letter weak versus useful",
      headers: ["Field", "Weak version", "Stronger version", "Why it helps"],
      rows: [
        [
          "Role and status",
          "Confirms the person works here",
          "States role, department, and employment start date",
          "It gives the officer a fuller picture of stability.",
        ],
        [
          "Income",
          "No salary listed",
          "States monthly or annual salary clearly",
          "It can be checked against payslips and bank deposits.",
        ],
        [
          "Leave",
          "Says the employee may travel",
          "Approves exact leave dates that match the itinerary",
          "It makes the trip look planned and legitimate.",
        ],
        [
          "Return",
          "No comment on future employment",
          "States the employee is expected to resume duties after travel",
          "It strengthens the return-home story.",
        ],
      ],
    },
    selfCheckHeading: "Employment letter self-check",
    selfCheckItems: [
      "Make sure the letter includes full name, role, and employment start date.",
      "Check that the salary on the letter fits the bank statement and payslips.",
      "Use exact approved leave dates that match the travel plan.",
      "Ask HR to include a clear statement that you are expected back at work.",
      "Make sure the letter is recent, signed, and issued on company letterhead.",
      "Read the letter next to the rest of the file and look for anything that does not line up.",
    ],
    faqItems: [
      {
        question: "Is an employment letter required for every visa application?",
        answer:
          "Not every route treats it the same way, but many visitor and sponsored files get stronger when the employment letter is detailed and current.",
      },
      {
        question: "What if my HR department only gives a basic template letter?",
        answer:
          "Ask for a visa-specific version. A banking-style confirmation letter is often too thin because it leaves out leave approval, salary, or return-to-work language.",
      },
      {
        question: "Should the employment letter match my bank statement?",
        answer:
          "Yes. The salary, employer name, and general employment story should make sense next to the account history and payslips.",
      },
      {
        question: "Can self-employed applicants use the same kind of letter?",
        answer:
          "Usually not in the same way. Self-employed applicants often need business registration, tax records, client invoices, or accountant documentation instead of a traditional employer letter.",
      },
      {
        question: "Should I get a new employment letter if embassy rules or my travel dates change?",
        answer:
          "Often yes. Leave approval, salary lines, and return-to-work wording should match the trip you are filing for. If the official route updates what counts as acceptable employment evidence, ask HR for a revised letter on letterhead and re-check it against payslips and bank deposits.",
      },
    ],
    relatedLinks: [
      problemGuideLinks[0],
      problemGuideLinks[1],
      ...visaRouteLinks,
    ],
    verificationSection: {
      title: "Align employment evidence with official requirements",
      intro:
        "Some routes expect a letter on company letterhead with specific fields; others accept payslips and contracts as primary evidence. When consulates publish new templates or clarify leave documentation (R03), replace stale letters so salary, role, and leave dates still match your application and supporting financial documents.",
      officialSources: [
        {
          label: "United States — visas (nonimmigrant overview)",
          href: "https://travel.state.gov/content/travel/en/us-visas.html",
          note: "Use the category you are applying under to see how employment ties are typically evidenced.",
        },
        {
          label: "European Union — Schengen visa policy",
          href: "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy_en",
          note: "Pair with your consulate’s checklist for employment and leave documentation.",
        },
        {
          label: "United Kingdom — Standard Visitor visa",
          href: "https://www.gov.uk/standard-visitor",
          note: "Confirm what you should submit for work and ties evidence for your visitor route.",
        },
        {
          label: "Canada — IRCC applications",
          href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/application.html",
          note: "Match letters and employment records to the form and document list you use.",
        },
        {
          label: "Australia — Department of Home Affairs visa listing",
          href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing",
          note: "Check the subclass guidance for employment and genuine-temporary-entrant expectations where applicable.",
        },
      ],
    },
  },
};

export function getProblemGuide(slug: keyof typeof problemGuides) {
  return problemGuides[slug];
}

export function getProblemGuideImage(guide: Pick<ProblemGuideConfig, "cardImage">) {
  return guide.cardImage ?? GUIDE_DEFAULT_IMAGE;
}

export function getProblemGuideCards(): ProblemGuideCard[] {
  return Object.values(problemGuides).map((guide) => ({
    title: guide.title,
    publishedAt: guide.publishedAt,
    summary: guide.description,
    author: "Anian",
    slug: guide.slug,
    image: getProblemGuideImage(guide),
    href: guide.href,
  }));
}
