/**
 * Golden test cases for document evaluation scoring.
 *
 * Each case provides mock document text content and expected evaluation
 * quality constraints (score ranges, risk levels, expected flags).
 */

import type { EvalTestCase } from "../framework/types";

// ---------------------------------------------------------------------------
// Input shape (mirrors evaluateDocumentsAction context)
// ---------------------------------------------------------------------------

export interface EvaluationInput {
  visaType: string;
  homeCountry: string;
  destinationCountry: string;
  /** Checklist items with associated document content */
  documents: DocumentItem[];
}

export interface DocumentItem {
  checklistItemId: string;
  documentName: string;
  isRequired: boolean;
  /** Simulated extracted text from the PDF */
  textContent: string | null;
}

export interface EvaluationExpected {
  /** Expected overall score range */
  scoreRange: { min: number; max: number };
  /** Expected risk level */
  expectedRiskLevel: "low" | "medium" | "high";
  /** Keywords that should appear in red flags (if any) */
  expectedRedFlags?: string[];
  /** Keywords that should appear in recommendations */
  expectedRecommendations?: string[];
  /** Expected item feedback statuses */
  expectedItemStatuses?: Record<string, "ok" | "missing" | "needs_review">;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

export const evaluationCases: EvalTestCase<EvaluationInput, EvaluationExpected>[] = [
  {
    id: "strong-complete-application",
    description: "Complete tourist visa application with all strong documents — expect high score",
    input: {
      visaType: "Tourist / Visitor (B1/B2)",
      homeCountry: "India",
      destinationCountry: "United States",
      documents: [
        {
          checklistItemId: "item-passport",
          documentName: "Valid Passport",
          isRequired: true,
          textContent: "PASSPORT\nRepublic of India\nSurname: SHARMA\nGiven Names: PRIYA\nPassport No: M1234567\nDate of Birth: 15 MAR 1990\nDate of Issue: 10 JAN 2023\nDate of Expiry: 09 JAN 2033\nPlace of Issue: NEW DELHI\nNationality: INDIAN",
        },
        {
          checklistItemId: "item-photo",
          documentName: "Passport Photo",
          isRequired: true,
          textContent: "2x2 inch photograph, white background, taken within last 6 months. Photo meets US visa specifications.",
        },
        {
          checklistItemId: "item-ds160",
          documentName: "DS-160 Confirmation",
          isRequired: true,
          textContent: "DS-160 CONFIRMATION PAGE\nApplication ID: AA009F4X2L\nSurname: SHARMA\nGiven Name: PRIYA\nDate of Application: 25 SEP 2026\nConfirmation Number: AA009F4X2L\nInterview Location: US Embassy New Delhi",
        },
        {
          checklistItemId: "item-bank",
          documentName: "Bank Statement",
          isRequired: true,
          textContent: "BANK STATEMENT\nAccount Holder: PRIYA SHARMA\nAccount Number: XXXX1234\nBank: State Bank of India\nPeriod: Mar 2026 – Aug 2026\nOpening Balance: INR 8,50,000\nClosing Balance: INR 12,30,000\nAverage Monthly Balance: INR 10,40,000\nMonthly salary credit: INR 1,80,000 from TCS Ltd",
        },
        {
          checklistItemId: "item-employment",
          documentName: "Employment Letter",
          isRequired: false,
          textContent: "TO WHOM IT MAY CONCERN\nThis is to certify that Ms. Priya Sharma is employed with Tata Consultancy Services Limited as Senior Software Engineer since March 2018.\nCurrent Annual Salary: INR 21,60,000\nShe has been granted leave from 2 October 2026 to 17 October 2026.\nShe is expected to resume duties on 18 October 2026.",
        },
      ],
    },
    expected: {
      scoreRange: { min: 75, max: 100 },
      expectedRiskLevel: "low",
      expectedRecommendations: [],
      expectedItemStatuses: {
        "item-passport": "ok",
        "item-ds160": "ok",
        "item-bank": "ok",
      },
    },
    metadata: { scenario: "ideal" },
  },
  {
    id: "missing-required-docs",
    description: "Application missing required passport and bank statement — expect low score",
    input: {
      visaType: "Tourist / Visitor (B1/B2)",
      homeCountry: "Nigeria",
      destinationCountry: "United States",
      documents: [
        {
          checklistItemId: "item-passport",
          documentName: "Valid Passport",
          isRequired: true,
          textContent: null,
        },
        {
          checklistItemId: "item-ds160",
          documentName: "DS-160 Confirmation",
          isRequired: true,
          textContent: "DS-160 CONFIRMATION PAGE\nApplication ID: BB123X4Y5Z\nSurname: OKONKWO\nDate of Application: 25 SEP 2026",
        },
        {
          checklistItemId: "item-bank",
          documentName: "Bank Statement",
          isRequired: true,
          textContent: null,
        },
        {
          checklistItemId: "item-photo",
          documentName: "Passport Photo",
          isRequired: true,
          textContent: "Photo uploaded",
        },
      ],
    },
    expected: {
      scoreRange: { min: 0, max: 45 },
      expectedRiskLevel: "high",
      expectedRedFlags: ["passport", "bank", "missing"],
      expectedItemStatuses: {
        "item-passport": "missing",
        "item-bank": "missing",
      },
    },
    metadata: { scenario: "missing-docs" },
  },
  {
    id: "expired-passport",
    description: "Application with expired passport — expect red flag and medium/high risk",
    input: {
      visaType: "Tourist / Visitor (Schengen)",
      homeCountry: "Egypt",
      destinationCountry: "Germany",
      documents: [
        {
          checklistItemId: "item-passport",
          documentName: "Valid Passport",
          isRequired: true,
          textContent: "PASSPORT\nArab Republic of Egypt\nSurname: HASSAN\nGiven Names: AHMED\nPassport No: A12345678\nDate of Birth: 20 JUN 1985\nDate of Issue: 15 MAR 2015\nDate of Expiry: 14 MAR 2022\nNationality: EGYPTIAN",
        },
        {
          checklistItemId: "item-insurance",
          documentName: "Travel Insurance",
          isRequired: true,
          textContent: "TRAVEL INSURANCE POLICY\nPolicy Holder: AHMED HASSAN\nPolicy Number: TI-2026-789\nCoverage: EUR 30,000 minimum\nValid From: 01 OCT 2026\nValid To: 18 OCT 2026\nCoverage Area: Schengen Zone",
        },
        {
          checklistItemId: "item-hotel",
          documentName: "Hotel Reservation",
          isRequired: false,
          textContent: "HOTEL BOOKING CONFIRMATION\nGuest: Ahmed Hassan\nHotel: Berlin Grand Hotel\nCheck-in: 05 OCT 2026\nCheck-out: 15 OCT 2026\nConfirmation: HB-2026-456",
        },
      ],
    },
    expected: {
      scoreRange: { min: 20, max: 60 },
      expectedRiskLevel: "high",
      expectedRedFlags: ["expired", "passport"],
    },
    metadata: { scenario: "expired-doc" },
  },
  {
    id: "weak-financials",
    description: "Application with weak financial evidence — expect medium risk",
    input: {
      visaType: "Student (Tier 4 / Student Route)",
      homeCountry: "Bangladesh",
      destinationCountry: "United Kingdom",
      documents: [
        {
          checklistItemId: "item-passport",
          documentName: "Valid Passport",
          isRequired: true,
          textContent: "PASSPORT\nPeople's Republic of Bangladesh\nSurname: ISLAM\nGiven Names: NAFIS\nPassport No: BK0987654\nDate of Birth: 12 AUG 1998\nDate of Issue: 01 JUN 2023\nDate of Expiry: 31 MAY 2028\nNationality: BANGLADESHI",
        },
        {
          checklistItemId: "item-cas",
          documentName: "CAS Statement",
          isRequired: true,
          textContent: "CONFIRMATION OF ACCEPTANCE FOR STUDIES\nCAS Number: E4G1234567890\nStudent: NAFIS ISLAM\nCourse: MSc Computer Science\nInstitution: University of Manchester\nStart Date: October 2026\nCourse Fee: GBP 28,000\nCAS Assigned: 25 SEP 2026",
        },
        {
          checklistItemId: "item-bank",
          documentName: "Bank Statement",
          isRequired: true,
          textContent: "BANK STATEMENT\nAccount Holder: NAFIS ISLAM\nBank: Islami Bank Bangladesh Ltd\nPeriod: Jun 2026 – Aug 2026\nClosing Balance: BDT 450,000\nNote: Balance equivalent to approximately GBP 3,200",
        },
        {
          checklistItemId: "item-english",
          documentName: "English Language Certificate",
          isRequired: true,
          textContent: "IELTS TEST REPORT FORM\nCandidate: NAFIS ISLAM\nTest Date: 10 NOV 2024\nOverall Band Score: 6.5\nListening: 7.0\nReading: 6.5\nWriting: 6.0\nSpeaking: 6.5\nCentre: British Council Dhaka",
        },
      ],
    },
    expected: {
      scoreRange: { min: 40, max: 72 },
      expectedRiskLevel: "medium",
      expectedRedFlags: ["fund", "insufficien", "balance"],
      expectedRecommendations: ["fund", "evidence"],
    },
    metadata: { scenario: "weak-financials" },
  },
  {
    id: "mixed-quality-docs",
    description: "Application with mix of good and problematic documents — expect nuanced scoring",
    input: {
      visaType: "Work Permit",
      homeCountry: "Philippines",
      destinationCountry: "Canada",
      documents: [
        {
          checklistItemId: "item-passport",
          documentName: "Valid Passport",
          isRequired: true,
          textContent: "PASSPORT\nRepublic of the Philippines\nSurname: SANTOS\nGiven Names: MARIA\nPassport No: P5678901A\nDate of Birth: 25 DEC 1992\nDate of Issue: 20 FEB 2024\nDate of Expiry: 19 FEB 2034\nNationality: FILIPINO",
        },
        {
          checklistItemId: "item-lmia",
          documentName: "LMIA Document",
          isRequired: true,
          textContent: "LABOUR MARKET IMPACT ASSESSMENT\nLMIA Number: TW-1234-5678\nEmployer: ABC Tech Solutions Inc.\nPosition: Software Developer\nWage: CAD 85,000/year\nLocation: Toronto, Ontario\nLMIA Validity: 6 months from issue\nDate Issued: 19 SEP 2026",
        },
        {
          checklistItemId: "item-employment",
          documentName: "Employment Offer Letter",
          isRequired: true,
          textContent: "Dear Maria, We are pleased to offer you the position of Junior Web Designer at XYZ Design Studio for CAD 45,000/year in Vancouver, BC. Start date: TBD.",
        },
        {
          checklistItemId: "item-education",
          documentName: "Educational Credentials",
          isRequired: false,
          textContent: "TRANSCRIPT OF RECORDS\nUniversity of the Philippines\nDegree: BS Computer Science\nGraduated: June 2014\nGPA: 1.75 (Cum Laude equivalent)",
        },
      ],
    },
    expected: {
      scoreRange: { min: 30, max: 78 },
      expectedRiskLevel: "high",
      expectedRedFlags: ["mismatch", "inconsisten", "discrepan"],
      expectedRecommendations: ["employment", "offer"],
    },
    metadata: { scenario: "mixed-quality" },
  },
];
