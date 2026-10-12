/**
 * Developer-authored document proposal examples; not official mandatory checklists.
 *
 * Each case simulates a visa application scenario with expected
 * checklist characteristics — we don't hardcode exact outputs since
 * the LLM generates them, but we define constraints the output must meet.
 */

import type { EvalTestCase } from "../framework/types";

// ---------------------------------------------------------------------------
// Input shape (mirrors generateChecklistAction context)
// ---------------------------------------------------------------------------

export interface ChecklistInput {
  visaType: string;
  homeCountry: string;
  destinationCountry: string;
  embassy: string;
  applicantName: string;
  /** Prior approval history */
  approvedBefore?: boolean;
  approvedVisaType?: string;
  approvedYear?: string;
  /** Prior rejection history */
  rejectedBefore?: boolean;
  rejectedVisaType?: string;
  rejectedYear?: string;
  rejectedReason?: string;
  /** Whether this is a dependent applicant */
  isDependent?: boolean;
}

export interface ChecklistExpected {
  /** Historical external metadata only; no production count constraint. */
  minItems?: number;
  /** Historical external metadata only; no production count constraint. */
  maxItems?: number;
  /** Developer candidate-name examples, not verified legal requirements. */
  requiredDocNames: string[];
  /** Document names that should NOT appear */
  excludedDocNames?: string[];
  /** Visa-type-specific keywords expected in descriptions */
  expectedKeywords?: string[];
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

export const checklistCases: EvalTestCase<ChecklistInput, ChecklistExpected>[] = [
  {
    id: "us-tourist-b1b2-bd",
    description: "US B1/B2 tourist visa from Bangladesh — first-time applicant",
    input: {
      visaType: "B1/B2 Visitor",
      homeCountry: "Bangladesh",
      destinationCountry: "United States",
      embassy: "US Embassy Dhaka",
      applicantName: "Rashid Ahmed",
    },
    expected: {
      requiredDocNames: ["passport", "photo", "ds-160"],
      expectedKeywords: ["validity", "6 months"],
    },
    metadata: { difficulty: "standard", region: "south-asia" },
  },
  {
    id: "uk-student-tier4-in",
    description: "UK Student visa (Tier 4) from India — first-time student",
    input: {
      visaType: "Student",
      homeCountry: "India",
      destinationCountry: "United Kingdom",
      embassy: "UK Visa Application Centre New Delhi",
      applicantName: "Priya Sharma",
    },
    expected: {
      requiredDocNames: ["passport", "cas", "english"],
      expectedKeywords: ["CAS", "ATAS", "financial", "maintenance"],
    },
    metadata: { difficulty: "complex", region: "south-asia" },
  },
  {
    id: "schengen-tourist-ng",
    description: "Schengen tourist visa from Nigeria",
    input: {
      visaType: "Schengen Visitor (Type C)",
      homeCountry: "Nigeria",
      destinationCountry: "France",
      embassy: "French Embassy Lagos",
      applicantName: "Chidi Okonkwo",
    },
    expected: {
      requiredDocNames: ["passport", "photo", "insurance"],
      expectedKeywords: ["travel insurance", "itinerary", "hotel"],
    },
    metadata: { difficulty: "standard", region: "africa" },
  },
  {
    id: "canada-work-ph",
    description: "Canada work permit from Philippines",
    input: {
      visaType: "Employer-specific Work Permit",
      homeCountry: "Philippines",
      destinationCountry: "Canada",
      embassy: "Canadian Embassy Manila",
      applicantName: "Maria Santos",
    },
    expected: {
      requiredDocNames: ["passport", "lmia", "offer"],
      expectedKeywords: ["LMIA", "employer", "job offer"],
    },
    metadata: { difficulty: "complex", region: "southeast-asia" },
  },
  {
    id: "au-pr-cn",
    description: "Australia permanent residence (Subclass 189) from China",
    input: {
      visaType: "Permanent Residence (Subclass 189)",
      homeCountry: "China",
      destinationCountry: "Australia",
      embassy: "Australian Embassy Beijing",
      applicantName: "Wei Zhang",
    },
    expected: {
      requiredDocNames: ["passport", "skills assessment", "english"],
      expectedKeywords: ["points", "skills", "IELTS", "PTE"],
    },
    metadata: { difficulty: "complex", region: "east-asia" },
  },
  {
    id: "us-tourist-rejected-eg",
    description: "US tourist visa from Egypt — previously rejected, reapplying",
    input: {
      visaType: "B1/B2 Visitor",
      homeCountry: "Egypt",
      destinationCountry: "United States",
      embassy: "US Embassy Cairo",
      applicantName: "Ahmed Hassan",
      rejectedBefore: true,
      rejectedVisaType: "B1/B2",
      rejectedYear: "2024",
      rejectedReason: "Insufficient ties to home country",
    },
    expected: {
      requiredDocNames: ["passport", "photo", "ds-160"],
      expectedKeywords: ["ties", "employment", "property"],
    },
    metadata: { difficulty: "complex", region: "middle-east", hasRejection: true },
  },
  {
    id: "uk-family-dependent-pk",
    description: "UK Family/Dependent visa from Pakistan — spouse dependent",
    input: {
      visaType: "Family - Dependant",
      homeCountry: "Pakistan",
      destinationCountry: "United Kingdom",
      embassy: "UK Visa Application Centre Islamabad",
      applicantName: "Fatima Khan",
      isDependent: true,
    },
    expected: {
      requiredDocNames: ["passport", "relationship", "sponsor"],
      expectedKeywords: ["relationship", "financial", "sponsor", "accommodation"],
    },
    metadata: { difficulty: "complex", region: "south-asia", isDependent: true },
  },
];
