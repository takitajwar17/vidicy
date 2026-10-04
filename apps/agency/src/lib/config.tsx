import { CANONICAL_SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/constants";
import { FaTwitter } from "react-icons/fa";

export const BLUR_FADE_DELAY = 0.15;

export const marketingTopBarLinks = [
  {
    href: "/faq",
    label: "FAQ",
  },
  {
    href: "/enterprise",
    label: "Enterprise",
  },
  {
    href: "/about",
    label: "About",
  },
] as const;

/**
 * Global site configuration — navigation, FAQs, and footer links.
 * All content is tailored to the Vidicy product.
 */
export const siteConfig = {
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  url: CANONICAL_SITE_URL,
  keywords: [
    "Vidicy",
    "Visa Application",
    "Visa Rejection",
    "Document Review",
    "Visa Review Software",
    "Schengen Visa",
    "US Visa",
    "UK Visa",
    "Canada Visa",
  ],
  links: {
    email: "support@vidicy.com",
    twitter: "https://twitter.com/takitajwar17",
  },
  header: [...marketingTopBarLinks],
  faqs: [
    {
      question: "What is Vidicy?",
      answer: (
        <span>
          Vidicy is visa application review software for visa and travel agencies. It
          helps teams check client files in bulk, catch missing documents and inconsistencies, and
          turn review notes into clear client follow-ups.
        </span>
      ),
    },
    {
      question: "Who is Vidicy built for?",
      answer: (
        <span>
          Vidicy is built for agencies that already handle visa clients and need a faster review
          desk: intake queues, document checks, issue tracking, reviewer notes, and client-ready
          reports that keep every file moving with clear next steps.
        </span>
      ),
    },
    {
      question: "Which workflows does Vidicy support?",
      answer: (
        <span>
          The product is focused on high-volume tourist, visit, study, work, and family visa review
          workflows where document completeness, evidence quality, and cross-file consistency
          affect agency throughput.
        </span>
      ),
    },
    {
      question: "Is Vidicy replacing agency reviewers?",
      answer: (
        <span>
          No. Vidicy is designed to make review teams faster and more consistent. Agencies keep the
          client relationship, reviewer judgment, and submission call.
        </span>
      ),
    },
    {
      question: "Is my data secure?",
      answer: (
        <span>
          Client documents are handled through protected infrastructure with access controls,
          encrypted transport, and vendor-limited processing. We do not use client files to train
          public models.
        </span>
      ),
    },
    {
      question: "How can an agency get access?",
      answer: (
        <span>
          Vidicy is currently onboarding selected agency teams through private pilots. Teams can
          reach out through the Enterprise page to discuss volume, workflow, and rollout needs.
        </span>
      ),
    },
  ],
  footer: [
    {
      title: "Pages",
      links: [
        { href: "/faq", text: "FAQ", icon: null },
        { href: "/enterprise", text: "Enterprise", icon: null },
        { href: "/about", text: "About", icon: null },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "/enterprise", text: "Contact", icon: null },
      ],
    },
    {
      title: "Social",
      links: [
        {
          href: "https://twitter.com/takitajwar17",
          text: "Twitter",
          icon: <FaTwitter />,
        },
      ],
    },
  ],
};

export type SiteConfig = typeof siteConfig;
