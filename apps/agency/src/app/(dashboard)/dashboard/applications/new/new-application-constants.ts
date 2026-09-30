import { EMBASSY_DATA } from "./new-application-embassy-map";
export { YEAR_OPTIONS } from "@/constants";

export const DESTINATION_COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France",
  "Netherlands", "Sweden", "Denmark", "Norway", "Finland", "Switzerland", "Austria",
  "Belgium", "Ireland", "Schengen Area (Europe)", "New Zealand", "Japan", "Singapore",
  "South Korea",
]

// ---------------------------------------------------------------------------
// Dynamic visa types keyed by destination — contextual, not generic
// ---------------------------------------------------------------------------

export const VISA_TYPES_BY_DESTINATION: Record<string, { value: string; label: string }[]> = {
  "United States": [
    { value: "B1/B2 Visitor", label: "B1/B2 — Visitor / Tourism / Business" },
    { value: "F1 Student", label: "F1 — Student" },
    { value: "J1 Exchange", label: "J1 — Exchange Visitor" },
    { value: "H1B Work", label: "H1B — Specialty Occupation (Work)" },
    { value: "L1 Transfer", label: "L1 — Intracompany Transfer" },
    { value: "O1 Extraordinary", label: "O1 — Extraordinary Ability" },
    { value: "K1 Fiancé", label: "K1 — Fiancé(e)" },
    { value: "CR1/IR1 Spouse", label: "CR1 / IR1 — Spouse / Family" },
    { value: "Transit C", label: "C-1 — Transit Visa" },
  ],
  "United Kingdom": [
    { value: "Standard Visitor", label: "Standard Visitor" },
    { value: "Student", label: "Student (formerly Tier 4)" },
    { value: "Skilled Worker", label: "Skilled Worker" },
    { value: "Family - Partner or Spouse", label: "Family Visa – Partner or Spouse" },
    { value: "Family - Dependant", label: "Dependant Visa (Skilled Worker Dependant / Student Dependant)" },
    { value: "Graduate", label: "Graduate Route" },
    { value: "Transit", label: "Transit (Direct Airside / Short Stay)" },
  ],
  "Canada": [
    { value: "Visitor", label: "Visitor / Tourist" },
    { value: "Student Permit", label: "Study Permit" },
    { value: "Open Work Permit", label: "Open Work Permit" },
    { value: "Employer-specific Work Permit", label: "Employer-specific Work Permit" },
    { value: "Express Entry", label: "Permanent Residence – Express Entry System" },
    { value: "Family Sponsorship", label: "Family Sponsorship" },
    { value: "Working Holiday IEC", label: "International Experience Canada (IEC)" },
    { value: "Transit", label: "Transit Visa" },
  ],
  "Australia": [
    { value: "Visitor (600)", label: "Visitor Visa (Subclass 600)" },
    { value: "Student (500)", label: "Student Visa (Subclass 500)" },
    { value: "Working Holiday (417)", label: "Working Holiday (Subclass 417)" },
    { value: "Work Holiday (462)", label: "Work & Holiday (Subclass 462)" },
    { value: "TSS Work (482)", label: "Temporary Skill Shortage (Subclass 482)" },
    { value: "Partner (820/801)", label: "Partner Visa (Subclass 820 / 801)" },
    { value: "Transit (771)", label: "Transit Visa (Subclass 771)" },
  ],
  "Germany": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C)" },
    { value: "National Study (Type D)", label: "National Visa for Study Purposes (Visum zu Studienzwecken)" },
    { value: "EU Blue Card", label: "EU Blue Card (Blaue Karte EU)" },
    { value: "Visa for Qualified Professionals", label: "Visa for Qualified Professionals" },
    { value: "Job Seeker", label: "Job Seeker Visa" },
    { value: "Family Reunification", label: "Visa for Family Reunification (Familiennachzug)" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "France": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C)" },
    { value: "National Study (Type D)", label: "Long-Stay Student Visa (VLS-TS — Étudiant)" },
    { value: "National Work (Type D)", label: "Long-Stay Visa Equivalent to Residence Permit (VLS-TS) – Employee (Salarié)" },
    { value: "Talent Passport", label: "Talent Passport (Passeport Talent)" },
    { value: "Family Reunification", label: "Visa for Family Reunification (Regroupement familial)" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A — Transit aéroportuaire)" },
  ],
  "Netherlands": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C)" },
    { value: "National Study (Type D)", label: "Residence Permit for Study (MVV entry required if outside NL)" },
    { value: "Highly Skilled Migrant", label: "Highly Skilled Migrant (Kennismigrant)" },
    { value: "EU Blue Card Netherlands", label: "EU Blue Card" },
    { value: "Family Reunification", label: "Residence Permit for Family and Relatives" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "Sweden": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C)" },
    { value: "National Study (Type D)", label: "Residence Permit for Studies" },
    { value: "National Work (Type D)", label: "Work Permit (Arbetstillstånd)" },
    { value: "Family Reunification", label: "Residence Permit to Move to Someone in Sweden" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "Denmark": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C)" },
    { value: "National Study (Type D)", label: "Residence Permit for Higher Education" },
    { value: "National Work (Type D)", label: "Pay Limit Scheme" },
    { value: "Denmark Positive List", label: "Positive List Scheme" },
    { value: "Family Reunification", label: "Family Reunification Residence Permit" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "Norway": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C)" },
    { value: "National Study (Type D)", label: "Residence Permit for Studies" },
    { value: "National Work (Type D)", label: "Residence Permit for Skilled Workers" },
    { value: "Family Reunification", label: "Residence Permit for Family Immigration" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "Finland": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C)" },
    { value: "National Study (Type D)", label: "Residence Permit for Studies" },
    { value: "National Work (Type D)", label: "Residence Permit for an Employed Person (TTOL)" },
    { value: "Family Reunification", label: "Residence Permit on the Basis of Family Ties" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "Switzerland": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C — short stay)" },
    { value: "National Study (Type D)", label: "National Visa (Type D) for Study" },
    { value: "National Work (Type D)", label: "National Visa (Type D) for Gainful Employment" },
    { value: "Family Reunification", label: "Family Reunification Visa (Type D)" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "Austria": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C)" },
    { value: "National Study (Type D)", label: "Residence Permit – Student" },
    { value: "National Work (Type D)", label: "Red-White-Red Card / EU Blue Card" },
    { value: "Family Reunification", label: "Residence Permit – Family Member" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "Belgium": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Visitor Visa (Type C)" },
    { value: "National Study (Type D)", label: "Long Stay Visa (Type D) for Studies" },
    { value: "National Work (Type D)", label: "Single Permit (Combined Work and Residence Permit)" },
    { value: "Family Reunification", label: "Visa D for Family Reunification" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "Ireland": [
    { value: "Short Stay (C)", label: "Short Stay 'C' Visa (up to 90 days)" },
    { value: "Long Stay Study (D)", label: "Long Stay 'D' Visa – Study" },
    { value: "Long Stay Work (D)", label: "Long Stay 'D' Visa – Employment (Critical Skills Employment Permit / General Employment Permit)" },
    { value: "Join Family", label: "Long Stay 'D' Visa – Join Family Member" },
    { value: "Transit", label: "Transit Visa" },
  ],
  "Schengen Area (Europe)": [
    { value: "Schengen Visitor (Type C)", label: "Schengen Short-Stay Visa (Type C)" },
    { value: "Airport Transit (ATV)", label: "Airport Transit Visa (Type A)" },
  ],
  "New Zealand": [
    { value: "Visitor", label: "Visitor Visa" },
    { value: "Student", label: "Student Visa" },
    { value: "Work", label: "Accredited Employer Work Visa (AEWV)" },
    { value: "Working Holiday", label: "Working Holiday Visa" },
    { value: "Partner of a New Zealander", label: "Partner of a New Zealander Work Visa" },
    { value: "Partner of a Worker", label: "Partner of a Worker Work Visa" },
    { value: "Transit", label: "Transit Visa" },
  ],
  "Japan": [
    { value: "Short-Stay Tourist", label: "Temporary Visitor Visa (15 / 30 / 90 days)" },
    { value: "Student", label: "Student Visa" },
    { value: "Specified Skilled Worker", label: "Specified Skilled Worker (i) – Specified Skills" },
    { value: "Specified Skilled Worker (ii)", label: "Specified Skilled Worker (ii) – Advanced Specified Skills" },
    { value: "Engineer / IT Work", label: "Engineer / Specialist in Humanities / International Services" },
    { value: "Working Holiday", label: "Working Holiday" },
    { value: "Spouse / Family", label: "Spouse or Child of Japanese National" },
    { value: "Spouse of Permanent Resident", label: "Spouse or Child of Permanent Resident" },
    { value: "Transit", label: "Transit" },
  ],
  "Singapore": [
    { value: "Tourist", label: "Short-Term Visit Pass" },
    { value: "Employment Pass", label: "Employment Pass (EP)" },
    { value: "S Pass", label: "S Pass (Mid-Level Workers)" },
    { value: "Student Pass", label: "Student Pass" },
    { value: "Dependant Pass", label: "Dependant's Pass" },
    { value: "Long Term Visit Pass", label: "Long-Term Visit Pass (LTVP)" },
    { value: "Transit", label: "Transit" },
  ],
  "South Korea": [
    { value: "C-3 Tourist", label: "C-3 — Short-Stay Tourist / Visitor" },
    { value: "D-2 Student", label: "D-2 — Student" },
    { value: "D-4 Language", label: "D-4 — General Training / Language Study" },
    { value: "E-7 Work", label: "E-7 — Specific Activities (Work)" },
    { value: "F-6 Marriage", label: "F-6 — Marriage Migrant" },
    { value: "H-1 Working Holiday", label: "H-1 — Working Holiday" },
    { value: "B-2 Transit", label: "B-2 — Transit" },
  ],
}

/** Falls back to a generic set when a destination has no specific mapping */
export const DEFAULT_VISA_TYPES = [
  { value: "Tourist", label: "Tourist / Visitor" },
  { value: "Student", label: "Student" },
  { value: "Work", label: "Work" },
  { value: "Business", label: "Business" },
  { value: "Family", label: "Family / Spouse" },
  { value: "Transit", label: "Transit" },
]

// ---------------------------------------------------------------------------
// Helper: get visa types for a destination (falls back to generic list)
// ---------------------------------------------------------------------------

export function getVisaTypes(destination: string): { value: string; label: string }[] {
  return VISA_TYPES_BY_DESTINATION[destination] ?? DEFAULT_VISA_TYPES
}

// ---------------------------------------------------------------------------
// Helper: get embassy list for a destination + applyingFrom route.
// Returns null when no data → triggers freetext fallback.
// ---------------------------------------------------------------------------

export function getEmbassies(destination: string, applyingFrom: string): string[] | null {
  return EMBASSY_DATA[destination]?.[applyingFrom] ?? null
}
