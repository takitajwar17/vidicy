import Logo from "@/components/logo";
import { CANONICAL_SITE_URL, SITE_NAME, SITE_DESCRIPTION } from "@/constants";
import { pricingPlans } from "@/config/pricing";
import { FaTwitter } from "react-icons/fa";
import type { Route } from "next";

export const BLUR_FADE_DELAY = 0.15;

export const marketingTopBarLinks = [
  {
    href: "/#pricing",
    label: "Pricing",
  },
  {
    href: "/faq",
    label: "FAQ",
  },
] as const;

/**
 * Global site configuration — navigation, pricing plans, FAQs, footer links.
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
    "AI Visa Assistant",
    "Schengen Visa",
    "US Visa",
    "UK Visa",
    "Canada Visa",
  ],
  links: {
    email: "support@vidicy.com",
    twitter: "https://twitter.com/takitajwar17",
  },
  header: [
    {
      trigger: "Features",
      content: {
        main: {
          icon: <Logo className="h-16 w-[120px] -ml-2" />,
          title: "AI-Powered Visa Preparation",
          description: "End-to-end guidance from document upload to submission readiness.",
          href: "/how-it-works" as Route,
        },
        items: [
          {
            href: "/how-it-works#step-2" as Route,
            title: "Document Analysis",
            description: "AI evaluates your full application and flags risks and inconsistencies.",
          },
          {
            href: "/how-it-works#step-1" as Route,
            title: "Embassy-Specific Checklists",
            description: "Personalized requirements based on your exact visa and consulate.",
          },
          {
            href: "/how-it-works#step-3" as Route,
            title: "Visa Chatbot",
            description: "Context-aware assistant that knows your application inside out.",
          },
        ],
      },
    },
    ...marketingTopBarLinks,
  ],
  pricing: pricingPlans,
  faqs: [
    {
      question: "What is Vidicy?",
      answer: (
        <span>
          Vidicy is a guided, AI-powered visa preparation platform. We help you
          submit the right documents, in the right way, for high-demand visas like the US, UK,
          Schengen, Canada, and Australia. We provide embassy-specific checklists, AI document
          evaluation, risk assessments, and iterative improvement until your application is
          submission-ready.
        </span>
      ),
    },
    {
      question: "How is this different from a visa consultant?",
      answer: (
        <span>
          Unlike traditional consultants, our AI reviews your full document package in minutes,
          cross-referencing every detail for inconsistencies. You get 24/7 access to a context-aware
          chatbot that understands your specific application, plus iterative feedback every time you
          re-upload. It&apos;s faster, more thorough, and more affordable than a human consultant.
        </span>
      ),
    },
    {
      question: "Which visa types do you support?",
      answer: (
        <span>
          We focus on high-demand, low-acceptance visas where rejections are common and guidance
          matters most. This includes US (B1/B2, H-1B, O-1, F-1), UK (Skilled Worker, Student, Global
          Talent), Schengen (all countries), Canada (visitor, study, work, start-up), and Australia
          (skilled, student, visitor). We&apos;re continuously adding more visa types.
        </span>
      ),
    },
    {
      question: "How does the refund policy work?",
      answer: (
        <span>
          Refunds are generally not available once the service has been used. A limited exception
          may apply if you followed the platform&apos;s guidance completely, received a visa
          rejection, and both the rejection and your compliance can be verified.
        </span>
      ),
    },
    {
      question: "Is my data secure?",
      answer: (
        <span>
          Absolutely. Your documents are encrypted in transit and at rest. We use enterprise-grade
          security and never share your personal information with third parties. Documents are only
          used for your visa evaluation and are automatically deleted after your application period
          ends.
        </span>
      ),
    },
    {
      question: "Can I re-upload documents after getting feedback?",
      answer: (
        <span>
          Yes — that&apos;s the core of our platform. Our iterative improvement loop lets you upload
          revised documents anytime. Each upload triggers a fresh AI evaluation with updated risk
          analysis and progress tracking, so you can keep improving until your application is in a
          strong, low-risk state.
        </span>
      ),
    },
  ],
  footer: [
    {
      title: "Product",
      links: [
        { href: "/#pricing", text: "Pricing", icon: null },
        { href: "/enterprise", text: "Enterprise", icon: null },
        { href: "/how-it-works", text: "How It Works", icon: null },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "/about", text: "About Us", icon: null },
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
