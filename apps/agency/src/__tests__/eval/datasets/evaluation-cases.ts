/**
 * Synthetic regression cases for document evaluation scoring.
 *
 * Each case provides mock document text content and expected evaluation
 * evidence finding checks. Historical score bands do not define current quality.
 * These expectations are developer-authored, not expert labels or an accuracy study.
 */

import type { EvalTestCase } from "../framework/types";
import type { ReviewRouteContext } from "@/lib/review-rubric";

// ---------------------------------------------------------------------------
// Input shape (mirrors evaluateDocumentsAction context)
// ---------------------------------------------------------------------------

export interface EvaluationInput {
  /** Fixed review date keeps historical synthetic documents reproducible. */
  asOfDate?: string;
  visaType: string;
  homeCountry: string;
  destinationCountry: string;
  currentCountry?: string;
  embassy?: string;
  applicantName?: string;
  relationship?: string;
  routeContext?: ReviewRouteContext;
  /** Checklist items with associated document content */
  documents: DocumentItem[];
}

export interface DocumentItem {
  checklistItemId: string;
  documentName: string;
  isRequired: boolean;
  /** Simulated extracted text from the PDF */
  textContent: string | null;
  description?: string;
  commonMistakes?: string;
  /** Recorded retrieval evidence; this does not run the search service. */
  relevantChunks?: string;
  /** Inline images allow the same multimodal model path as production. */
  visionImages?: string[];
}

export interface EvaluationExpected {
  /** Optional caller-supplied evidence-coverage range; never an approval probability. */
  scoreRange?: { min: number; max: number };
  /** Optional caller-supplied evidence-state label, independent of coverage percentage. */
  expectedRiskLevel?: "low" | "medium" | "high";
  /** Optional caller-supplied coverage comparison. Built-in findings do not require score changes. */
  lowerScoreThanCaseId?: string;
  /** Each label is required; an array gives accepted alternatives for one finding. */
  expectedRedFlags?: (string | string[])[];
  /** Each label is required; an array gives accepted alternatives for one action. */
  expectedRecommendations?: (string | string[])[];
  /** Expected item feedback statuses */
  expectedItemStatuses?: Record<string, "ok" | "missing" | "needs_review">;
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

const limitedEvidenceCases: EvalTestCase<EvaluationInput, EvaluationExpected>[] = [
  {
    id: "uploads-complete-limited-evidence",
    description:
      "All listed uploads are present, but family, asset, prior-travel and trip evidence are absent",
    input: {
      asOfDate: "2026-09-30",
      visaType: "B1/B2 Visitor",
      homeCountry: "India",
      destinationCountry: "United States",
      documents: [
        {
          checklistItemId: "item-passport",
          documentName: "Valid Passport",
          isRequired: true,
          textContent:
            "PASSPORT\nRepublic of India\nSurname: SHARMA\nGiven Names: PRIYA\nPassport No: M1234567\nDate of Birth: 15 MAR 1990\nDate of Issue: 10 JAN 2023\nDate of Expiry: 09 JAN 2033\nPlace of Issue: NEW DELHI\nNationality: INDIAN",
        },
        {
          checklistItemId: "item-photo",
          documentName: "Passport Photo",
          isRequired: true,
          textContent:
            "2x2 inch photograph, white background, taken within last 6 months. Photo meets US visa specifications.",
        },
        {
          checklistItemId: "item-ds160",
          documentName: "DS-160 Confirmation",
          isRequired: true,
          textContent:
            "DS-160 CONFIRMATION PAGE\nApplication ID: AA009F4X2L\nSurname: SHARMA\nGiven Name: PRIYA\nDate of Application: 25 SEP 2026\nConfirmation Number: AA009F4X2L\nInterview Location: US Embassy New Delhi",
        },
        {
          checklistItemId: "item-bank",
          documentName: "Bank Statement",
          isRequired: true,
          textContent:
            "BANK STATEMENT\nAccount Holder: PRIYA SHARMA\nAccount Number: XXXX1234\nBank: State Bank of India\nPeriod: Mar 2026 – Aug 2026\nOpening Balance: INR 8,50,000\nClosing Balance: INR 12,30,000\nAverage Monthly Balance: INR 10,40,000\nMonthly salary credit: INR 1,80,000 from TCS Ltd",
        },
        {
          checklistItemId: "item-employment",
          documentName: "Employment Letter",
          isRequired: false,
          textContent:
            "TO WHOM IT MAY CONCERN\nThis is to certify that Ms. Priya Sharma is employed with Tata Consultancy Services Limited as Senior Software Engineer since March 2018.\nCurrent Annual Salary: INR 21,60,000\nShe has been granted leave from 2 October 2026 to 17 October 2026.\nShe is expected to resume duties on 18 October 2026.",
        },
      ],
    },
    expected: {
      expectedRecommendations: [],
      expectedItemStatuses: { "item-photo": "needs_review" },
    },
    metadata: {
      scenario: "limited-evidence",
      labelRationale:
        "A text description cannot establish photo compliance. The remaining abbreviated extracts have no expert-labelled valid status. Unlabelled findings remain unmeasured; absent property or prior travel does not itself establish ineligibility.",
    },
  },
  {
    id: "missing-required-docs",
    description: "Prepared case missing the fixture-designated passport and bank statement",
    input: {
      asOfDate: "2026-09-30",
      visaType: "B1/B2 Visitor",
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
          textContent:
            "DS-160 CONFIRMATION PAGE\nApplication ID: BB123X4Y5Z\nSurname: OKONKWO\nDate of Application: 25 SEP 2026",
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
      expectedRedFlags: ["passport", "bank", ["missing", "absent", "not uploaded", "not provided"]],
      expectedItemStatuses: {
        "item-passport": "missing",
        "item-bank": "missing",
      },
    },
    metadata: {
      scenario: "missing-docs",
      labelRationale:
        "The fixture-designated passport and bank uploads are absent. Check those missing-evidence findings without assigning legal eligibility or approval probability.",
    },
  },
  {
    id: "expired-passport",
    description: "Prepared passport with an expiry date before the fixed review date",
    input: {
      asOfDate: "2026-09-30",
      visaType: "Schengen Visitor (Type C)",
      homeCountry: "Egypt",
      destinationCountry: "Germany",
      documents: [
        {
          checklistItemId: "item-passport",
          documentName: "Valid Passport",
          isRequired: true,
          textContent:
            "PASSPORT\nArab Republic of Egypt\nSurname: HASSAN\nGiven Names: AHMED\nPassport No: A12345678\nDate of Birth: 20 JUN 1985\nDate of Issue: 15 MAR 2015\nDate of Expiry: 14 MAR 2022\nNationality: EGYPTIAN",
        },
        {
          checklistItemId: "item-insurance",
          documentName: "Travel Insurance",
          isRequired: true,
          textContent:
            "TRAVEL INSURANCE POLICY\nPolicy Holder: AHMED HASSAN\nPolicy Number: TI-2026-789\nCoverage: EUR 30,000 minimum\nValid From: 01 OCT 2026\nValid To: 18 OCT 2026\nCoverage Area: Schengen Zone",
        },
        {
          checklistItemId: "item-hotel",
          documentName: "Hotel Reservation",
          isRequired: false,
          textContent:
            "HOTEL BOOKING CONFIRMATION\nGuest: Ahmed Hassan\nHotel: Berlin Grand Hotel\nCheck-in: 05 OCT 2026\nCheck-out: 15 OCT 2026\nConfirmation: HB-2026-456",
        },
      ],
    },
    expected: {
      expectedRedFlags: [["expir", "no longer valid"], "passport"],
    },
    metadata: {
      scenario: "expired-doc",
      labelRationale:
        "The recorded passport expiry precedes the fixed review date. Check that direct date finding without assigning a risk band from a score.",
    },
  },
  {
    id: "weak-financials",
    description: "Student case with a material funding shortfall and limited supporting evidence",
    input: {
      asOfDate: "2026-09-30",
      visaType: "Student",
      homeCountry: "Bangladesh",
      destinationCountry: "United Kingdom",
      documents: [
        {
          checklistItemId: "item-passport",
          documentName: "Valid Passport",
          isRequired: true,
          textContent:
            "PASSPORT\nPeople's Republic of Bangladesh\nSurname: ISLAM\nGiven Names: NAFIS\nPassport No: BK0987654\nDate of Birth: 12 AUG 1998\nDate of Issue: 01 JUN 2023\nDate of Expiry: 31 MAY 2028\nNationality: BANGLADESHI",
        },
        {
          checklistItemId: "item-cas",
          documentName: "CAS Statement",
          isRequired: true,
          textContent:
            "CONFIRMATION OF ACCEPTANCE FOR STUDIES\nCAS Number: E4G1234567890\nStudent: NAFIS ISLAM\nCourse: MSc Computer Science\nInstitution: University of Manchester\nStart Date: October 2026\nCourse Fee: GBP 28,000\nCAS Assigned: 25 SEP 2026",
        },
        {
          checklistItemId: "item-bank",
          documentName: "Bank Statement",
          isRequired: true,
          textContent:
            "BANK STATEMENT\nAccount Holder: NAFIS ISLAM\nBank: Islami Bank Bangladesh Ltd\nPeriod: Jun 2026 – Aug 2026\nClosing Balance: BDT 450,000\nNote: Balance equivalent to approximately GBP 3,200",
        },
        {
          checklistItemId: "item-english",
          documentName: "English Language Certificate",
          isRequired: true,
          textContent:
            "IELTS TEST REPORT FORM\nCandidate: NAFIS ISLAM\nTest Date: 10 NOV 2024\nOverall Band Score: 6.5\nListening: 7.0\nReading: 6.5\nWriting: 6.0\nSpeaking: 6.5\nCentre: British Council Dhaka",
        },
      ],
    },
    expected: {
      expectedRedFlags: [
        ["insufficien", "shortfall", "deficit", "inadequate"],
        ["fund", "bank", "financial", "balance"],
      ],
      expectedRecommendations: [
        [
          "bank statement",
          "financial evidence",
          "financial document",
          "proof of funds",
          "sponsor",
          "loan",
        ],
        ["balance", "fund", "tuition", "fee"],
      ],
    },
    metadata: {
      scenario: "weak-financials",
      labelRationale:
        "Available GBP 3,200 does not cover the stated GBP 28,000 course fee. This checks the supplied amounts, not statutory funding sufficiency, undisclosed exemptions or a visa outcome.",
    },
  },
  {
    id: "mixed-quality-docs",
    description: "Prepared work documents with employer, role, location and pay contradictions",
    input: {
      asOfDate: "2026-09-30",
      visaType: "Employer-specific Work Permit",
      homeCountry: "Philippines",
      destinationCountry: "Canada",
      documents: [
        {
          checklistItemId: "item-passport",
          documentName: "Valid Passport",
          isRequired: true,
          textContent:
            "PASSPORT\nRepublic of the Philippines\nSurname: SANTOS\nGiven Names: MARIA\nPassport No: P5678901A\nDate of Birth: 25 DEC 1992\nDate of Issue: 20 FEB 2024\nDate of Expiry: 19 FEB 2034\nNationality: FILIPINO",
        },
        {
          checklistItemId: "item-lmia",
          documentName: "LMIA Document",
          isRequired: true,
          textContent:
            "LABOUR MARKET IMPACT ASSESSMENT\nLMIA Number: TW-1234-5678\nEmployer: ABC Tech Solutions Inc.\nPosition: Software Developer\nWage: CAD 85,000/year\nLocation: Toronto, Ontario\nLMIA Validity: 6 months from issue\nDate Issued: 19 SEP 2026",
        },
        {
          checklistItemId: "item-employment",
          documentName: "Employment Offer Letter",
          isRequired: true,
          textContent:
            "Dear Maria, We are pleased to offer you the position of Junior Web Designer at XYZ Design Studio for CAD 45,000/year in Vancouver, BC. Start date: TBD.",
        },
        {
          checklistItemId: "item-education",
          documentName: "Educational Credentials",
          isRequired: false,
          textContent:
            "TRANSCRIPT OF RECORDS\nUniversity of the Philippines\nDegree: BS Computer Science\nGraduated: June 2014\nGPA: 1.75 (Cum Laude equivalent)",
        },
      ],
    },
    expected: {
      expectedRedFlags: [
        ["mismatch", "inconsisten", "discrepan", "contradict", "conflict"],
        ["employer", "ABC Tech Solutions", "XYZ Design Studio"],
        ["salary", "wage", "compensation", "pay", "85,000", "85000", "45,000", "45000"],
      ],
      expectedRecommendations: ["employment", "offer"],
    },
    metadata: {
      scenario: "mixed-quality",
      labelRationale:
        "Employer, role, location and salary contradict the supplied work documents. Check the specific cross-document findings without requiring a weighted score change.",
    },
  },
];

// Prepared reference evidence supports controlled document-finding checks.
// It does not establish complete statutory eligibility or a numerical risk band.
const completeReferenceInput: EvaluationInput = {
  asOfDate: "2026-09-30",
  applicantName: "PRIYA SHARMA",
  relationship: "primary",
  visaType: "B1/B2 Visitor",
  homeCountry: "India",
  currentCountry: "India",
  destinationCountry: "United States",
  embassy: "New Delhi",
  documents: [
    {
      checklistItemId: "reference-passport",
      documentName: "Passport and prior travel record",
      isRequired: true,
      description: "Confirm identity, passport validity and the supplied entry/exit record.",
      textContent:
        "PASSPORT AND TRAVEL RECORD\nHolder: PRIYA SHARMA\nPassport M1234567; issued 10 JAN 2023; expires 09 JAN 2033; issued by Republic of India, New Delhi.\nPrior passport and stamped travel pages: UK entry 10 JUN 2019, exit 20 JUN 2019 before authorized end 10 JUL 2019; Germany entry 05 MAY 2022, exit 15 MAY 2022 before authorized end 04 JUN 2022.\nSigned immigration declaration: no visa refusals, overstays, deportations or immigration violations.",
    },
    {
      checklistItemId: "reference-bank",
      documentName: "Bank Statement",
      isRequired: true,
      description:
        "Confirm six months of savings, income and coverage of the supplied travel budget.",
      textContent:
        "STATE BANK OF INDIA — SIGNED SIX-MONTH ACCOUNT STATEMENT\nAccount holder: PRIYA SHARMA; account ending 1234; issued 29 SEP 2026.\nMar 2026 closing INR 850000; Apr 910000; May 970000; Jun 1040000; Jul 1120000; Aug 2026 1230000.\nEvery month: salary credit INR 180000 from Tata Consultancy Services Ltd. Ordinary household expenses are paid monthly. No loans, third-party transfers or unusual deposits. Unencumbered savings INR 1230000.\nThe attached 02–17 OCT 2026 travel budget is INR 350000 including return transport, lodging, meals and contingency; all costs are self-funded.",
    },
    {
      checklistItemId: "reference-employment",
      documentName: "Employment and approved leave letter",
      isRequired: true,
      description: "Check employer, salary, leave approval and the return-to-work date.",
      textContent:
        "TATA CONSULTANCY SERVICES LIMITED — EMPLOYMENT CERTIFICATE\nEmployee: PRIYA SHARMA; senior software engineer since MAR 2018. Permanent employment; annual salary INR 2160000 (monthly INR 180000), consistent with payslips and bank credits.\nPaid leave approved 02–17 OCT 2026 for United States tourism. Employee must resume the permanent India-based role on 18 OCT 2026.\nSigned and stamped by Anjali Rao, HR Director, 28 SEP 2026; verification reference HR-PS-125. Issuer verification: employer HR department through the official company staff directory at https://www.tcs.com/.",
    },
    {
      checklistItemId: "reference-family",
      documentName: "Family residence evidence",
      isRequired: false,
      description:
        "Check the applicant's relationship evidence and which family members remain in India.",
      textContent:
        "FAMILY EVIDENCE — PRINCIPAL APPLICANT PRIYA SHARMA\nCertified marriage and child birth records identify Priya Sharma, spouse Arun Sharma, and their dependent child. Municipal residence certificate dated 27 SEP 2026 confirms the family lives together in New Delhi.\nSigned household declaration: Arun and the child remain in India during Priya's solo tourism trip, 02–17 OCT 2026. Priya returns to their shared home on 17 OCT 2026.",
    },
    {
      checklistItemId: "reference-property",
      documentName: "Registered property title",
      isRequired: false,
      description: "Check ownership and location against the applicant's identity.",
      textContent:
        "REGISTERED PROPERTY TITLE — NEW DELHI LAND REGISTRY\nOwner: PRIYA SHARMA; identity passport M1234567. Residential home in New Delhi, India, owned since 2020; certified registry extract dated 27 SEP 2026. This is the applicant's continuing home with spouse and child. Signed registry seal and registration reference ND-2020-PS-100.",
    },
    {
      checklistItemId: "reference-itinerary",
      documentName: "Confirmed return travel, hotel and itinerary",
      isRequired: true,
      description: "Check that purpose, travel dates, duration, bookings and budget agree.",
      textContent:
        "CONFIRMED TOURISM BOOKINGS — PASSENGER/GUEST PRIYA SHARMA\nRound trip New Delhi–New York: departure 02 OCT 2026; return arrival New Delhi 17 OCT 2026. Paid confirmed return ticket reference RT-PS-2610.\nConfirmed Manhattan hotel stay 02–16 OCT 2026, guest Priya Sharma, booking HOTEL-PS-2610. Tourism itinerary: New York museums, city landmarks and a guided day trip; no employment or study. Total travel budget INR 350000, paid from personal savings. Approved leave ends 17 OCT; work resumes 18 OCT 2026.",
    },
    {
      checklistItemId: "reference-application",
      documentName: "Application confirmation and signed purpose declaration",
      isRequired: true,
      description:
        "Check consistent identity and purpose; no missing answer, unsigned field or conflicting declaration.",
      textContent:
        "DS-160 CONFIRMATION AND SIGNED DECLARATION\nApplicant: PRIYA SHARMA; passport M1234567; application AA009F4X2L; submitted 25 SEP 2026 to US Embassy New Delhi.\nPurpose: solo tourism in New York, 02–17 OCT 2026; no work or study. Permanent job with Tata Consultancy Services Ltd; monthly salary INR 180000. Budget INR 350000 from INR 1230000 savings. Spouse and dependent child remain at the family-owned New Delhi home.\nPrior UK and Schengen trips ended within authorized stays. No refusals, overstays or violations. All form answers complete; confirmation barcode present; signed by Priya Sharma on 25 SEP 2026.",
    },
  ],
};

function referenceVariant({
  id,
  description,
  itemId,
  textContent,
  expected,
}: {
  id: string;
  description: string;
  itemId: string;
  textContent: string | null;
  expected: Omit<EvaluationExpected, "scoreRange" | "lowerScoreThanCaseId">;
}): EvalTestCase<EvaluationInput, EvaluationExpected> {
  return {
    id,
    description,
    input: {
      ...completeReferenceInput,
      documents: completeReferenceInput.documents.map((document) =>
        document.checklistItemId === itemId ? { ...document, textContent } : { ...document },
      ),
    },
    expected: {
      ...expected,
    },
    metadata: {
      scenario: "controlled-variant",
      baseCaseId: "complete-reference",
      changedItemId: itemId,
      labelRationale:
        "Only one document changes. Check the specified evidence finding. Do not infer a mandatory score change or legal outcome.",
    },
  };
}

export const evaluationCases: EvalTestCase<EvaluationInput, EvaluationExpected>[] = [
  ...limitedEvidenceCases,
  {
    id: "complete-reference",
    description: "Complete prepared document evidence; route eligibility remains unapproved",
    input: completeReferenceInput,
    expected: {
      expectedItemStatuses: {
        "reference-passport": "ok",
        "reference-bank": "ok",
        "reference-employment": "ok",
      },
    },
    metadata: {
      scenario: "complete-reference",
      labelRationale:
        "Evidence addresses employment and leave, family, assets, financial history and budget, a consistent tourism itinerary, prior compliant travel and complete identity records. These are developer-authored evidence examples, not expert labels or legal eligibility conclusions.",
    },
  },
  referenceVariant({
    id: "reference-missing-bank",
    description: "Complete reference with only the required bank statement removed",
    itemId: "reference-bank",
    textContent: null,
    expected: {
      expectedItemStatuses: { "reference-bank": "missing" },
      expectedRedFlags: ["bank", ["missing", "absent", "not uploaded", "not provided"]],
      expectedRecommendations: ["bank"],
    },
  }),
  referenceVariant({
    id: "reference-expired-passport",
    description: "Complete reference with only the passport expiry changed to a past date",
    itemId: "reference-passport",
    textContent: completeReferenceInput.documents[0].textContent!.replace(
      "09 JAN 2033",
      "09 JAN 2024",
    ),
    expected: {
      expectedItemStatuses: { "reference-passport": "needs_review" },
      expectedRedFlags: [["expir", "no longer valid"], "passport"],
      expectedRecommendations: ["passport"],
    },
  }),
  referenceVariant({
    id: "reference-name-mismatch",
    description: "Complete reference with only the employment letter naming a different employee",
    itemId: "reference-employment",
    textContent: completeReferenceInput.documents[2].textContent!.replaceAll(
      "PRIYA SHARMA",
      "ANANYA SHARMA",
    ),
    expected: {
      expectedItemStatuses: { "reference-employment": "needs_review" },
      expectedRedFlags: [
        ["name", "identity"],
        ["mismatch", "inconsisten", "discrepan", "contradict", "differ"],
      ],
      expectedRecommendations: ["name"],
    },
  }),
];
