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
          Vidicy is a review desk for visa agencies. Upload the passport, form, bank statement,
          letters, bookings, and photos; Vidicy points to missing files, mismatched details, and
          client fixes before a reviewer sends the report.
        </span>
      ),
    },
    {
      question: "Who is Vidicy built for?",
      answer: (
        <span>
          Vidicy is built for agencies whose workday is passports, forms, bank statements, client
          letters, and follow-up messages. It gives the team one queue for each client file and one
          list of fixes before the case moves forward.
        </span>
      ),
    },
    {
      question: "Which workflows does Vidicy support?",
      answer: (
        <span>
          The product is focused on tourist, visit, study, work, and family cases where reviewers
          compare forms, passports, statements, letters, bookings, and prior visas before a client
          file is marked ready.
        </span>
      ),
    },
    {
      question: "Is Vidicy replacing agency reviewers?",
      answer: (
        <span>
          No. Vidicy gives reviewers a shorter pile: what is missing, what contradicts another file,
          and what the client must fix. The agency keeps the client relationship and the final
          submission call.
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
          Vidicy is onboarding selected agency teams through private pilots. Tell us the routes you
          review, how many files arrive each month, and where the review desk slows down.
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
      links: [{ href: "/enterprise", text: "Contact", icon: null }],
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
