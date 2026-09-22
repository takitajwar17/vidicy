import type { Route } from "next";

export interface ToolFaqItem {
  question: string;
  answer: string;
}

export interface ToolResultBullet {
  label: string;
  value: string;
}

export interface ToolDefinition {
  slug: "us-visa-photo-requirements" | "schengen-visa-photo-requirements";
  title: string;
  description: string;
  updatedAt: string;
  eyebrow: string;
  routeLabel: string;
  routeSummary: string;
  heroKicker: string;
  heroHeadline: string;
  heroDescription: string;
  primaryCta: string;
  secondaryCta: string;
  enabled: boolean;
  metaTitle: string;
  metaDescription: string;
  faqItems: ToolFaqItem[];
  quickFacts: ToolResultBullet[];
  officialSources: Array<{ label: string; href: string; note: string }>;
  supportedFileTypes: string[];
  maxFileSizeMb: number;
  fileRequirements: string[];
  validationChecklist: string[];
  routeDisclaimer: string;
  previewNote: string;
  gateCopy: string;
}

export const PHOTO_TOOL_DEFINITIONS: Record<ToolDefinition["slug"], ToolDefinition> = {
  "us-visa-photo-requirements": {
    slug: "us-visa-photo-requirements",
    title: "US Visa Photo Requirements Checker",
    description:
      "Check a US visa photo against the most important technical requirements before you upload or print it.",
    updatedAt: "2026-10-09",
    eyebrow: "Tool",
    routeLabel: "US visa photo requirements",
    routeSummary: "Run a fast US photo check before submission.",
    heroKicker: "Visa photo checker",
    heroHeadline: "US Visa Photo Checker",
    heroDescription: "Upload once, get a clear pass/fix result in seconds.",
    primaryCta: "Check My Photo",
    secondaryCta: "Get Full Fix Plan",
    enabled: true,
    metaTitle: "US Visa Photo Requirements Tool",
    metaDescription:
      "Upload a US visa photo and check size, aspect ratio, file format, and common presentation issues with a free photo requirements tool.",
    faqItems: [
      {
        question: "What does the checker look for?",
        answer:
          "It checks technical requirements first, then uses AI to flag likely presentation issues such as background problems, glare, framing, and obvious compliance risks.",
      },
      {
        question: "Do you store my photo?",
        answer:
          "No. The tool is designed for ephemeral processing only. The photo is used to generate the result and is not stored server-side in the v1 flow.",
      },
      {
        question: "Is the result a guarantee?",
        answer:
          "No. It is a practical pre-check designed to reduce obvious mistakes, not a guarantee of approval or compliance with every embassy edge case.",
      },
    ],
    quickFacts: [
      { label: "Focus", value: "US photo compliance" },
      { label: "Core result", value: "Free" },
      { label: "Full report", value: "Unlock after sign-up" },
      { label: "Processing", value: "Ephemeral" },
    ],
    officialSources: [
      {
        label: "U.S. Department of State photo guidance",
        href: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/photos.html",
        note: "Primary source for US visa photo rules and examples.",
      },
      {
        label: "DS-160 FAQs",
        href: "https://travel.state.gov/content/travel/en/us-visas/visa-information-resources/forms/ds-160-online-nonimmigrant-visa-application/ds-160-faqs.html",
        note: "Useful for photo upload requirements and form behavior.",
      },
    ],
    supportedFileTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    maxFileSizeMb: 5,
    fileRequirements: [
      "Square or near-square framing expected",
      "JPEG, PNG, or WebP",
      "Under 5 MB",
      "Clear face and neutral expression",
    ],
    validationChecklist: [
      "Confirm the photo is sharp and not pixelated",
      "Check the background for shadows or color casts",
      "Verify the face is centered and fully visible",
      "Look for glare on glasses or reflective surfaces",
    ],
    routeDisclaimer:
      "This tool helps catch obvious compliance problems early. Always confirm final requirements on the official government page for your visa case.",
    previewNote: "Free instant result. Full fix plan unlocks after sign-up.",
    gateCopy: "Unlock the full fix order and detailed remediation steps.",
  },
  "schengen-visa-photo-requirements": {
    slug: "schengen-visa-photo-requirements",
    title: "Schengen Visa Photo Requirements Checker",
    description:
      "Check a Schengen visa photo against the most important technical and presentation requirements before submission.",
    updatedAt: "2026-10-09",
    eyebrow: "Tool",
    routeLabel: "Schengen visa photo requirements",
    routeSummary: "Run a fast Schengen photo check before submission.",
    heroKicker: "Visa photo checker",
    heroHeadline: "Schengen Visa Photo Checker",
    heroDescription: "Upload once, get a clear pass/fix result in seconds.",
    primaryCta: "Check My Photo",
    secondaryCta: "Get Full Fix Plan",
    enabled: true,
    metaTitle: "Schengen Visa Photo Requirements Tool",
    metaDescription:
      "Upload a Schengen visa photo and check dimensions, file format, background, and common presentation issues with a free requirements tool.",
    faqItems: [
      {
        question: "What does the checker look for?",
        answer:
          "It checks the photo against core technical rules and uses AI to flag visual issues like shadowing, centering, glare, and background tone.",
      },
      {
        question: "Do you store my photo?",
        answer:
          "No. The v1 flow is ephemeral and does not persist the uploaded image server-side.",
      },
      {
        question: "Is it country-agnostic?",
        answer:
          "No. This page is route-specific for Schengen photo requirements, because different visa routes often have slightly different presentation expectations.",
      },
    ],
    quickFacts: [
      { label: "Focus", value: "Schengen photo compliance" },
      { label: "Core result", value: "Free" },
      { label: "Full report", value: "Unlock after sign-up" },
      { label: "Processing", value: "Ephemeral" },
    ],
    officialSources: [
      {
        label: "EU visa framework",
        href: "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy_en",
        note: "Starting point for Schengen visa policy context.",
      },
      {
        label: "Schengen application guidance",
        href: "https://home-affairs.ec.europa.eu/policies/schengen/visa-policy/applying-schengen-visa_en",
        note: "Official guidance for applying in the correct route and context.",
      },
    ],
    supportedFileTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    maxFileSizeMb: 5,
    fileRequirements: [
      "35:45 framing expected",
      "JPEG, PNG, or WebP",
      "Under 5 MB",
      "Clear face and neutral expression",
    ],
    validationChecklist: [
      "Confirm the photo is sharp and not pixelated",
      "Check the background for shadows or color casts",
      "Verify the face is centered and fully visible",
      "Look for glare on glasses or reflective surfaces",
    ],
    routeDisclaimer:
      "This tool helps catch obvious compliance problems early. Always confirm final requirements on the official government page for your visa case.",
    previewNote: "Free instant result. Full fix plan unlocks after sign-up.",
    gateCopy: "Unlock the full fix order and detailed remediation steps.",
  },
};

export const ENABLED_PHOTO_TOOL_SLUGS = Object.values(PHOTO_TOOL_DEFINITIONS)
  .filter((tool) => tool.enabled)
  .map((tool) => tool.slug);

export function getPhotoToolBySlug(slug: string): ToolDefinition | null {
  if (slug in PHOTO_TOOL_DEFINITIONS) {
    const matchedTool = PHOTO_TOOL_DEFINITIONS[slug as ToolDefinition["slug"]];
    return matchedTool.enabled ? matchedTool : null;
  }

  return null;
}

export function getPhotoToolHref(slug: ToolDefinition["slug"]): Route {
  return `/tools/${slug}` as Route;
}

export const toolsIndexItems = Object.values(PHOTO_TOOL_DEFINITIONS)
  .filter((tool) => tool.enabled)
  .map((tool) => ({
    slug: tool.slug,
    href: getPhotoToolHref(tool.slug),
    title: tool.title,
    description: tool.description,
    eyebrow: tool.eyebrow,
    routeLabel: tool.routeLabel,
    routeSummary: tool.routeSummary,
  }));
