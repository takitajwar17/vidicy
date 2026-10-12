import { VISA_TYPES_BY_DESTINATION } from "./visa-route-catalog";
import { z } from "zod";
import {
  calculateReviewValue,
  compareReviewDecimals,
  type ReviewCalculation,
  type ReviewCalculationResult,
} from "./review-calculations";

export const REVIEW_RUBRIC_VERSION = "route-review-v1";

export type ReviewRouteFamily =
  | "visitor"
  | "student"
  | "work"
  | "family"
  | "permanent_residence"
  | "transit"
  | "working_holiday"
  | "exchange"
  | "post_study"
  | "unknown";
export interface ReviewRouteContext {
  destinationCountry: string;
  visaType: string;
  stage?: string;
  subtype?: string;
  applicationDate?: string;
  facts?: Record<string, unknown>;
}
export interface ReviewRoute {
  id: string;
  label: string;
  family: ReviewRouteFamily;
  status: "research_draft" | "unresolved";
  guidance: string[];
  requiredFacts: string[];
  sourceUrls: string[];
}
export interface ReviewEvidenceReference {
  documentId: string;
  page?: number;
  field?: string;
}
export interface ReviewFact {
  state: "declared" | "extracted" | "confirmed" | "missing" | "conflicting";
  value?: unknown;
  evidence?: ReviewEvidenceReference[];
}
export type RuleCondition =
  | {
      readonly op: "decimal_gte" | "decimal_lte";
      readonly fact: string;
      readonly value: string;
      readonly unit: string;
      readonly currency: string | null;
      readonly period: { startDate: string; endDate: string } | null;
    }
  | {
      readonly op: "eq" | "gte" | "gt" | "lte" | "lt";
      readonly fact: string;
      readonly value: string | number | boolean;
    }
  | { readonly op: "all" | "any"; readonly conditions: readonly RuleCondition[] }
  | { readonly op: "not"; readonly condition: RuleCondition }
  | {
      readonly op: "at_least";
      readonly count: number;
      readonly conditions: readonly RuleCondition[];
    }
  | {
      readonly op: "every" | "some";
      readonly collection: string;
      readonly condition: RuleCondition;
    };
export interface ReviewRuleSource {
  id: string;
  url: string;
  authority: string;
  locator: string;
  version: string;
  status: "active" | "suspended" | "conflict" | "retired";
  effectiveFrom: string;
  effectiveTo?: string;
  event: "applicationDate" | "asOfDate" | `fact:${string}`;
  checkedAt: string;
  nextReviewAt: string;
  reviewedBy: string;
}
export interface ReviewCriterion {
  id: string;
  label: string;
  kind: "eligibility" | "evidence" | "submission" | "official_points";
  mandatory: boolean;
  sourceIds: string[];
  applicability?: RuleCondition;
  exemption?: RuleCondition;
  deferral?: RuleCondition;
  requirement: RuleCondition;
  individualReview?: boolean;
}
export interface ReviewRulePack {
  id: string;
  version: string;
  routeId: string;
  status: "research_draft" | "active" | "retired";
  inventoryComplete: boolean;
  reviewedBy: string;
  reviewedAt: string;
  stages: string[];
  subtypes: string[];
  sources: ReviewRuleSource[];
  criteria: ReviewCriterion[];
  calculations?: ReviewCalculation[];
}
export type CriterionState =
  | "supported"
  | "not_applicable"
  | "exempt"
  | "deferred"
  | "missing_fact"
  | "missing_evidence"
  | "concern"
  | "review_required"
  | "source_conflict";
export interface ReviewCriterionResult {
  id: string;
  label: string;
  kind: ReviewCriterion["kind"];
  mandatory: boolean;
  state: CriterionState;
  sourceIds: string[];
  evidence: ReviewEvidenceReference[];
}
export interface RouteAssessment {
  version: string;
  routeId: string;
  routeLabel: string;
  family: ReviewRouteFamily;
  support: "research_draft" | "unresolved" | "active";
  status: "review_required" | "ready";
  asOfDate: string;
  nextReviewAt: string;
  contextKey: string;
  packId: string | null;
  packVersion: string | null;
  packKey: string;
  missingFacts: string[];
  criteria: ReviewCriterionResult[];
  calculations: ReviewCalculationResult[];
  blockers: {
    id: string;
    kind: "unapproved_rules" | "unknown_route" | "missing_fact" | "criterion";
    message: string;
  }[];
  sourceUrls: string[];
}

// Exact menu values only. Country and route form one identity; no substring fallback.
const FAMILIES: Record<Exclude<ReviewRouteFamily, "unknown">, readonly string[]> = {
  visitor: [
    "B1/B2 Visitor",
    "Standard Visitor",
    "Visitor",
    "Visitor (600)",
    "Schengen Visitor (Type C)",
    "Short Stay (C)",
    "Short-Stay Tourist",
    "Tourist",
    "C-3 Tourist",
  ],
  student: [
    "F1 Student",
    "Student",
    "Student Permit",
    "Student (500)",
    "National Study (Type D)",
    "Long Stay Study (D)",
    "Student Pass",
    "D-2 Student",
    "D-4 Language",
  ],
  work: [
    "H1B Work",
    "L1 Transfer",
    "O1 Extraordinary",
    "Skilled Worker",
    "Open Work Permit",
    "Employer-specific Work Permit",
    "TSS Work (482)",
    "EU Blue Card",
    "Visa for Qualified Professionals",
    "Job Seeker",
    "National Work (Type D)",
    "Talent Passport",
    "Highly Skilled Migrant",
    "EU Blue Card Netherlands",
    "Denmark Positive List",
    "Long Stay Work (D)",
    "Work",
    "Specified Skilled Worker",
    "Specified Skilled Worker (ii)",
    "Engineer / IT Work",
    "Employment Pass",
    "S Pass",
    "E-7 Work",
  ],
  family: [
    "K1 Fiancé",
    "CR1/IR1 Spouse",
    "Family - Partner or Spouse",
    "Family - Dependant",
    "Family Sponsorship",
    "Partner (820/801)",
    "Family Reunification",
    "Join Family",
    "Partner of a New Zealander",
    "Partner of a Worker",
    "Spouse / Family",
    "Spouse of Permanent Resident",
    "Dependant Pass",
    "Long Term Visit Pass",
    "F-6 Marriage",
  ],
  permanent_residence: ["Express Entry"],
  transit: ["Transit C", "Transit", "Transit (771)", "Airport Transit (ATV)", "B-2 Transit"],
  working_holiday: [
    "Working Holiday IEC",
    "Working Holiday (417)",
    "Work Holiday (462)",
    "Working Holiday",
    "H-1 Working Holiday",
  ],
  exchange: ["J1 Exchange"],
  post_study: ["Graduate"],
};
const FAMILY_FACTS: Record<ReviewRouteFamily, string[]> = {
  visitor: ["purpose", "plannedActivities", "stayDates", "fundingPath"],
  student: ["institution", "course", "studyDates", "fundingPath", "fundingPeriod"],
  work: ["occupation", "employer", "workLocation", "qualificationPath", "salary", "workingHours"],
  family: ["sponsorLegalStatus", "relationshipToSponsor", "familyDates", "dependants"],
  permanent_residence: ["programme", "familySize", "nonAccompanyingFamily"],
  transit: ["airport", "itinerary", "airsideOrLandside", "onwardEntryPermission"],
  working_holiday: ["passportType", "dateOfBirth", "participationHistory", "applicationAccess"],
  exchange: ["programme", "sponsor", "fundingPath"],
  post_study: ["currentStatus", "courseCompletion", "applicationLocation"],
  unknown: [],
};
const FAMILY_GUIDANCE: Record<ReviewRouteFamily, string[]> = {
  visitor: [
    "Assess the permitted purpose and activities under the exact visitor route. First-time travel, no property, or no employment is not a universal defect. Do not invent a fixed bank balance or demand paid tickets without an applicable source.",
  ],
  student: [
    "Select the course, institution, funding period and accepted funding alternatives. A scholarship, education loan or sponsor can be an accepted path. Do not require personal savings in addition to an adequate approved alternative.",
  ],
  work: [
    "Select the occupation, employer route, qualification alternatives, salary basis and process stage. A degree, job offer, employer quota or labour-market test is not required by every work route.",
  ],
  family: [
    "Resolve the sponsor's legal basis before family conditions. Check age, dependency, custody, deadlines, protected rights and exceptions. Do not penalise the family because they plan to live together abroad.",
  ],
  permanent_residence: [
    "Resolve FSW, FST or CEC before Express Entry checks. FSW selection points and CRS are different calculations. CEC has no settlement-funds or education eligibility gate. Do not apply temporary visitor return-home criteria.",
  ],
  transit: [
    "Resolve visa exemption, airport transit and entry separately. Airside access, border crossing, baggage, airports, travel mode and onward entry permission can change the route. Do not require a return-to-home journey instead of onward travel.",
  ],
  working_holiday: [
    "Select the exact bilateral country, passport, category, age event and participation history. Separate personal eligibility from launch, quota, ballot, invitation and appointment availability. An agreement signed is not proof a scheme is open.",
  ],
  exchange: [
    "Resolve the exchange category and sponsor documents. Category-specific home-residence conditions must not be applied to every exchange applicant.",
  ],
  post_study: [
    "Resolve current status, eligible course completion, location and filing date. Do not demand a job offer unless the selected route requires one.",
  ],
  unknown: [
    "The exact route is unresolved. Do not infer the nearest visa from its name or create mandatory legal requirements.",
  ],
};
const COUNTRY_RESEARCH: Record<string, { sources: string[]; guidance: string; facts?: string[] }> =
  {
    "United States": {
      sources: ["https://travel.state.gov/content/travel/en/us-visas.html"],
      guidance:
        "Distinguish nonimmigrant, dual-intent, fiancé and immigrant spouse routes. A refusal, overstay and fraud finding are separate events. A visitor invitation is not a universal requirement.",
    },
    "United Kingdom": {
      sources: ["https://www.gov.uk/guidance/immigration-rules"],
      guidance:
        "Use the exact Appendix and dated transition. Official Student or Skilled Worker points are not a new weighted score. Family Appendix FM differs from worker/student dependants. Document relief need not waive the underlying funds condition.",
    },
    Canada: {
      sources: ["https://www.canada.ca/en/immigration-refugees-citizenship.html"],
      guidance:
        "Dual intent is permitted subject to the applicable conditions. Resolve open-work eligibility, study attestation exemptions and Quebec requirements. Former-country police-certificate expiry can be acceptable. Include non-accompanying family where required.",
    },
    Australia: {
      sources: [
        "https://www.legislation.gov.au/F1996B03551/latest/text",
        "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing",
      ],
      guidance:
        "Subclass 482 now includes Skills in Demand; select its stream and nomination date. Student Genuine Student assessment does not make a possible future PR plan adverse. Separate 820 from 801 and family-violence or other exceptions.",
    },
    Germany: {
      sources: ["https://www.gesetze-im-internet.de/aufenthg_2004/"],
      guidance:
        "Resolve the statutory basis: study, qualification path, Blue Card, opportunity card or post-study search. IT experience alternatives and skilled-family exceptions must be checked before demanding a degree or language evidence.",
    },
    France: {
      sources: [
        "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054301706/2026-10-18",
        "https://www.service-public.gouv.fr/particuliers/vosdroits/F2231",
      ],
      guidance:
        "Resolve the exact talent, employment or family category. Student funds changed from 1 August 2026; use the applicable legal formula and event date instead of an old fixed amount.",
    },
    Netherlands: {
      sources: ["https://ind.nl/en/residence-permits"],
      guidance:
        "Highly skilled migrant and Blue Card sponsor conditions differ. MVV is not universally required for everyone outside the Netherlands. Distinguish temporary permit duration from temporary residence purpose.",
    },
    Sweden: {
      sources: ["https://www.migrationsverket.se/en.html"],
      guidance:
        "Salary, study-work and family changes have separate 2026 dates and transition cohorts. Apply occupation exceptions and the relevant filing/decision event; do not combine jobs where the selected work route prohibits it.",
    },
    Denmark: {
      sources: ["https://www.nyidanmark.dk/en-GB"],
      guidance:
        "Pay Limit and the two Positive Lists have different conditions. Pay Limit does not impose a universal degree requirement. Study-family conditions have separate commencement dates and exceptions.",
    },
    Norway: {
      sources: ["https://www.udi.no/en/want-to-apply/"],
      guidance:
        "Skilled work can use a supported special-qualification path. Resolve study and family subcategories and their age/income exceptions. Do not treat a historical threshold as current.",
    },
    Finland: {
      sources: ["https://migri.fi/en/residence-permit"],
      guidance:
        "Resolve TTOL, study and family conditions separately. Study scholarship and insurance alternatives exist. The treatment of multiple jobs differs from Sweden. A sponsor's age exception does not automatically exempt the joining spouse.",
    },
    Switzerland: {
      sources: [
        "https://www.sem.admin.ch/sem/de/home/publiservice/weisungen-kreisschreiben/auslaenderbereich.html",
      ],
      guidance:
        "Resolve FNIA, free movement, protected UK rights, asylum or protection law before permit-letter rules. Select canton, municipality and mission. The F-family statutory waiting period and individual proportionality review are separate. Higher-education departure-letter instructions can conflict with local lists.",
      facts: ["legalRegime", "canton", "municipality"],
    },
    Austria: {
      sources: ["https://www.ris.bka.gv.at/", "https://oead.at/en/to-austria/entry-and-residence"],
      guidance:
        "Distinguish national Student permission from qualifying other-EU student mobility. Funding generally follows actual permit duration; a narrow over-12-month finite-assets mobility conflict requires authority review. Do not demand 24 months of cash in every case.",
    },
    Belgium: {
      sources: ["https://dofi.ibz.be/en", "https://fr.const-court.be/public/f/2026/2026-024f.pdf"],
      guidance:
        "Resolve sponsor protection, court suspension scope and transition conditions. Work rules differ between Brussels, Flanders, Wallonia and the German-speaking community. Do not use future published salary amounts before commencement.",
      facts: ["region"],
    },
    Ireland: {
      sources: [
        "https://www.irishimmigration.ie/",
        "https://enterprise.gov.ie/en/what-we-do/workplace-and-skills/employment-permits/",
      ],
      guidance:
        "Ireland is outside Schengen. Employment permits and entry visas are separate stages. Critical Skills and General permits differ. Family conditions depend on sponsor category and policy date.",
    },
    "Schengen Area (Europe)": {
      sources: ["https://eur-lex.europa.eu/eli/reg/2009/810/2024-06-28/eng"],
      guidance:
        "Select the competent member state from main purpose/length, with first entry only where no main destination exists. Apply local harmonised lists by filing jurisdiction. Free-movement family and airport-transit branches differ from ordinary visitors.",
      facts: ["memberState", "legalRegime"],
    },
    "New Zealand": {
      sources: ["https://www.immigration.govt.nz/opsmanual/"],
      guidance:
        "Use application-date instructions and explicit exceptions. AEWV minimum-skills salary alternative changed to NZD70/hour from 9 March 2026, without waiving employer-specific qualifications. Partner WF2 and WF3 differ. Qualifying visitor remote work is permitted.",
    },
    Japan: {
      sources: [
        "https://www.mofa.go.jp/j_info/visit/visa/index.html",
        "https://www.mofa.go.jp/j_info/visit/w_holiday/index.html",
      ],
      guidance:
        "COE and no-COE evidence paths differ. Specified Skilled Worker i and ii have different family and duration rules. Working Holiday age, repeat participation and filing location depend on the bilateral arrangement and current mission.",
    },
    Singapore: {
      sources: [
        "https://www.mom.gov.sg/passes-and-permits",
        "https://www.ica.gov.sg/enter-transit-depart",
      ],
      guidance:
        "Entry visa, visit pass and arrival card are different. EP COMPASS and S Pass differ; degree alternatives and exemptions exist. MOM and ICA long-term visit passes have different bases. Use effective application/renewal dates for future salary changes.",
    },
    "South Korea": {
      sources: [
        "https://www.hikorea.go.kr/board/BoardNtcDetailR.pt?BBS_SEQ=1&BBS_GB_CD=BS10&NTCCTT_SEQ=1062&page=1",
        "https://www.visa.go.kr/openPage.do?MENU_ID=10102",
      ],
      guidance:
        "Resolve exact status, occupation code version and visa/stay stage. E-7-1/2/3/4 and E-7-4R have different qualification, pay, points and employer rules. Current same-dated visa and stay manuals contain different embedded versions. D-4-2 and D-4-7 are distinct. B-2 entry exemption is not automatically the pure-transit visa route.",
      facts: ["statusCode", "occupationCodeVersion"],
    },
  };

export function resolveReviewRoute({
  destinationCountry,
  visaType,
}: Pick<ReviewRouteContext, "destinationCountry" | "visaType">): ReviewRoute {
  const option = VISA_TYPES_BY_DESTINATION[destinationCountry]?.find(
    (item) => item.value === visaType,
  );
  const family = option
    ? ((Object.entries(FAMILIES).find(([, values]) => values.includes(visaType))?.[0] as
        | ReviewRouteFamily
        | undefined) ?? "unknown")
    : "unknown";
  const research = COUNTRY_RESEARCH[destinationCountry];
  const resolved = Boolean(option && family !== "unknown" && research);
  return {
    id: `${encodeURIComponent(destinationCountry)}:${encodeURIComponent(visaType)}`,
    label: option?.label ?? visaType,
    family,
    status: resolved ? "research_draft" : "unresolved",
    guidance: [...FAMILY_GUIDANCE[family], ...(research ? [research.guidance] : [])],
    requiredFacts: [
      "stage",
      "subtype",
      "applicationDate",
      "nationality",
      "applicationLocation",
      "authority",
      ...FAMILY_FACTS[family],
      ...(research?.facts ?? []).filter((key) =>
        key === "occupationCodeVersion" || key === "region"
          ? family === "work"
          : key === "canton" || key === "municipality"
            ? !["visitor", "transit"].includes(family)
            : true,
      ),
    ],
    sourceUrls: research?.sources ?? [],
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function field(value: unknown, path: string): unknown {
  if (
    !path ||
    path.split(".").some((key) => ["__proto__", "prototype", "constructor"].includes(key))
  )
    return undefined;
  return path
    .split(".")
    .reduce<unknown>((current, key) => (object(current) ? current[key] : undefined), value);
}
function confirmedValue(value: unknown): unknown {
  return object(value) && value.state === "confirmed" ? value.value : undefined;
}
export type RuleTruth = boolean | "unknown";
export function evaluateRuleCondition({
  condition,
  facts,
}: {
  condition: RuleCondition;
  facts: Record<string, unknown>;
}): RuleTruth {
  try {
    if (!conditionSchema.safeParse(condition).success) return "unknown";
    return evaluateCondition({ condition, facts });
  } catch {
    return "unknown";
  }
}
function evaluateCondition({
  condition,
  facts,
}: {
  condition: RuleCondition;
  facts: Record<string, unknown>;
}): RuleTruth {
  if (condition.op === "not") {
    const answer = evaluateCondition({ condition: condition.condition, facts });
    return answer === "unknown" ? answer : !answer;
  }
  if (condition.op === "every" || condition.op === "some") {
    const people = confirmedValue(field(facts, condition.collection));
    if (!Array.isArray(people) || !people.length || people.some((person) => !object(person)))
      return "unknown";
    const answers = people.map((person) =>
      evaluateCondition({
        condition: condition.condition,
        facts: person as Record<string, unknown>,
      }),
    );
    return combine(answers, condition.op === "every" ? answers.length : 1);
  }
  if (condition.op === "all" || condition.op === "any" || condition.op === "at_least") {
    const answers = condition.conditions.map((child) =>
      evaluateCondition({ condition: child, facts }),
    );
    const count =
      condition.op === "all"
        ? answers.length
        : condition.op === "any"
          ? 1
          : "count" in condition
            ? condition.count
            : 0;
    if (!answers.length || !Number.isInteger(count) || count < 1 || count > answers.length)
      return "unknown";
    return combine(answers, count);
  }
  if (!("fact" in condition)) return "unknown";
  const value = confirmedValue(field(facts, condition.fact));
  if (value === undefined || value === null) return "unknown";
  if (condition.op === "decimal_gte" || condition.op === "decimal_lte") {
    if (
      !object(value) ||
      typeof value.value !== "string" ||
      !object(value.metadata) ||
      value.metadata.unit !== condition.unit ||
      value.metadata.currency !== condition.currency ||
      canonical(value.metadata.period) !== canonical(condition.period)
    )
      return "unknown";
    const compared = compareReviewDecimals({ left: value.value, right: condition.value });
    return compared === null
      ? "unknown"
      : condition.op === "decimal_gte"
        ? compared >= 0
        : compared <= 0;
  }
  if (condition.op === "eq")
    return typeof value === typeof condition.value ? value === condition.value : "unknown";
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    typeof condition.value !== "number" ||
    !Number.isFinite(condition.value)
  )
    return "unknown";
  if (condition.op === "gte") return value >= condition.value;
  if (condition.op === "gt") return value > condition.value;
  if (condition.op === "lte") return value <= condition.value;
  if (condition.op === "lt") return value < condition.value;
  return "unknown";
}
function combine(answers: RuleTruth[], required: number): RuleTruth {
  const yes = answers.filter((answer) => answer === true).length;
  if (yes >= required) return true;
  return yes + answers.filter((answer) => answer === "unknown").length < required
    ? false
    : "unknown";
}
function canonical(value: unknown, seen = new Set<object>()): string {
  if (Array.isArray(value) || object(value)) {
    if (seen.has(value) || seen.size > 128) return '"[invalid cyclic or deep value]"';
    seen.add(value);
    const result = Array.isArray(value)
      ? `[${value.map((item) => canonical(item, seen)).join(",")}]`
      : `{${Object.keys(value)
          .filter((key) => value[key] !== undefined)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key], seen)}`)
          .join(",")}}`;
    seen.delete(value);
    return result;
  }
  return JSON.stringify(value) ?? "null";
}
function validDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

const conditionSchema: z.ZodType<RuleCondition> = z.lazy(() =>
  z.union([
    z
      .object({
        op: z.enum(["decimal_gte", "decimal_lte"]),
        fact: z.string().min(1),
        value: z.string().regex(/^-?\d+(?:\.\d+)?$/),
        unit: z.string().min(1),
        currency: z.string().min(1).nullable(),
        period: z.object({ startDate: z.string().date(), endDate: z.string().date() }).nullable(),
      })
      .strict(),
    z
      .object({
        op: z.enum(["eq", "gte", "gt", "lte", "lt"]),
        fact: z.string().min(1),
        value: z.union([z.string(), z.number().finite(), z.boolean()]),
      })
      .strict(),
    z
      .object({ op: z.enum(["all", "any"]), conditions: z.array(conditionSchema).min(1).max(100) })
      .strict(),
    z
      .object({
        op: z.literal("at_least"),
        count: z.number().int().positive(),
        conditions: z.array(conditionSchema).min(1).max(100),
      })
      .strict(),
    z.object({ op: z.literal("not"), condition: conditionSchema }).strict(),
    z
      .object({
        op: z.enum(["every", "some"]),
        collection: z.string().min(1),
        condition: conditionSchema,
      })
      .strict(),
  ]),
);
const evidenceReferenceSchema = z
  .object({
    documentId: z.string().min(1),
    page: z.number().int().positive().optional(),
    field: z.string().min(1).optional(),
  })
  .strict();
const criterionStateSchema = z.enum([
  "supported",
  "not_applicable",
  "exempt",
  "deferred",
  "missing_fact",
  "missing_evidence",
  "concern",
  "review_required",
  "source_conflict",
]);
const criterionKindSchema = z.enum(["eligibility", "evidence", "submission", "official_points"]);
const criterionResultSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: criterionKindSchema,
  mandatory: z.boolean(),
  state: criterionStateSchema,
  sourceIds: z.array(z.string().min(1)),
  evidence: z.array(evidenceReferenceSchema),
});
const assessmentSchema = z.object({
  version: z.string(),
  routeId: z.string(),
  routeLabel: z.string(),
  family: z.enum([
    "visitor",
    "student",
    "work",
    "family",
    "permanent_residence",
    "transit",
    "working_holiday",
    "exchange",
    "post_study",
    "unknown",
  ]),
  support: z.enum(["research_draft", "unresolved", "active"]),
  status: z.enum(["review_required", "ready"]),
  asOfDate: z.string().date(),
  nextReviewAt: z.string().date(),
  contextKey: z.string(),
  packId: z.string().nullable(),
  packVersion: z.string().nullable(),
  packKey: z.string(),
  missingFacts: z.array(z.string()),
  criteria: z.array(criterionResultSchema),
  calculations: z.array(
    z.object({
      status: z.enum(["calculated", "unresolved"]),
      value: z.string().nullable(),
      unit: z.string().nullable(),
      currency: z.string().nullable(),
      period: z.object({ startDate: z.string().date(), endDate: z.string().date() }).nullable(),
      metadata: z.unknown(),
      trace: z.array(z.record(z.unknown())),
      sourceIds: z.array(z.string()),
      evidence: z.array(evidenceReferenceSchema),
    }),
  ),
  blockers: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["unapproved_rules", "unknown_route", "missing_fact", "criterion"]),
      message: z.string(),
    }),
  ),
  sourceUrls: z.array(z.string().url()),
});
const packSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  routeId: z.string().min(1),
  status: z.enum(["research_draft", "active", "retired"]),
  inventoryComplete: z.boolean(),
  reviewedBy: z.string().trim().min(1),
  reviewedAt: z.string().date(),
  stages: z.array(z.string().min(1)).min(1),
  subtypes: z.array(z.string().min(1)).min(1),
  sources: z
    .array(
      z.object({
        id: z.string().min(1),
        url: z.string().url(),
        authority: z.string().trim().min(1),
        locator: z.string().trim().min(1),
        version: z.string().trim().min(1),
        status: z.enum(["active", "suspended", "conflict", "retired"]),
        effectiveFrom: z.string().date(),
        effectiveTo: z.string().date().optional(),
        event: z.union([
          z.enum(["applicationDate", "asOfDate"]),
          z.string().regex(/^fact:[a-zA-Z][a-zA-Z0-9_.]*$/),
        ]),
        checkedAt: z.string().date(),
        nextReviewAt: z.string().date(),
        reviewedBy: z.string().trim().min(1),
      }),
    )
    .min(1)
    .max(500),
  criteria: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        kind: criterionKindSchema,
        mandatory: z.boolean(),
        sourceIds: z.array(z.string().min(1)).min(1),
        applicability: conditionSchema.optional(),
        exemption: conditionSchema.optional(),
        deferral: conditionSchema.optional(),
        requirement: conditionSchema,
        individualReview: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(1000),
  calculations: z
    .array(
      z.object({
        id: z
          .string()
          .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
          .refine((value) => !["constructor", "prototype", "__proto__"].includes(value)),
        sourceIds: z.array(z.string().min(1)).min(1),
        sourceDate: z.string().date(),
        expression: z.unknown(),
        output: z.object({
          scale: z.number().int().min(0).max(20),
          rounding: z.enum(["floor", "ceil", "half_up"]),
          unit: z.string().min(1),
          currency: z.string().min(1).nullable(),
          period: z.object({ startDate: z.string().date(), endDate: z.string().date() }).nullable(),
        }),
      }),
    )
    .max(100)
    .optional(),
});

// This is an admission control for machine-rule sources, not proof of a claim.
// Claim scope, legal effect and review provenance are still required per rule.
const OFFICIAL_SOURCE_HOSTS: Record<string, string[]> = {
  "United States": ["state.gov", "uscis.gov", "ecfr.gov", "govinfo.gov"],
  "United Kingdom": ["gov.uk", "legislation.gov.uk"],
  Canada: ["canada.ca", "justice.gc.ca"],
  Australia: ["legislation.gov.au", "homeaffairs.gov.au"],
  Germany: ["gesetze-im-internet.de", "diplo.de", "auswaertiges-amt.de", "bamf.de", "bund.de"],
  France: ["gouv.fr"],
  Netherlands: ["ind.nl", "government.nl", "netherlandsworldwide.nl"],
  Sweden: ["migrationsverket.se", "swedenabroad.se", "riksdagen.se"],
  Denmark: ["nyidanmark.dk", "retsinformation.dk"],
  Norway: ["udi.no", "lovdata.no", "regjeringen.no"],
  Finland: ["migri.fi", "finlex.fi"],
  Switzerland: [
    "admin.ch",
    "zh.ch",
    "ur.ch",
    "ag.ch",
    "ai.ch",
    "ar.ch",
    "be.ch",
    "bl.ch",
    "bs.ch",
    "fr.ch",
    "ge.ch",
    "gl.ch",
    "gr.ch",
    "jura.ch",
    "lu.ch",
    "ne.ch",
    "nw.ch",
    "ow.ch",
    "sg.ch",
    "sh.ch",
    "so.ch",
    "sz.ch",
    "tg.ch",
    "ti.ch",
    "vd.ch",
    "vs.ch",
    "zg.ch",
  ],
  Austria: ["bka.gv.at", "bmi.gv.at", "oead.at", "bmeia.gv.at", "oesterreich.gv.at"],
  Belgium: [
    "ibz.be",
    "const-court.be",
    "vlaanderen.be",
    "wallonie.be",
    "economie-emploi.brussels",
    "ostbelgienlive.be",
    "belgium.be",
    "fgov.be",
  ],
  Ireland: ["irishimmigration.ie", "gov.ie", "irishstatutebook.ie"],
  "Schengen Area (Europe)": [],
  "New Zealand": ["immigration.govt.nz", "legislation.govt.nz"],
  Japan: ["mofa.go.jp", "moj.go.jp", "emb-japan.go.jp"],
  Singapore: ["mom.gov.sg", "ica.gov.sg", "agc.gov.sg"],
  "South Korea": [
    "hikorea.go.kr",
    "visa.go.kr",
    "immigration.go.kr",
    "moj.go.kr",
    "mofa.go.kr",
    "motir.go.kr",
    "law.go.kr",
    "moel.go.kr",
  ],
};
function hasIntakeFact(context: ReviewRouteContext, key: string) {
  const value = ["stage", "subtype", "applicationDate"].includes(key)
    ? context[key as "stage"]
    : context.facts?.[key];
  if (object(value) && "state" in value)
    return (
      value.state !== "missing" &&
      value.state !== "conflicting" &&
      value.value !== undefined &&
      value.value !== null &&
      value.value !== ""
    );
  return value !== undefined && value !== null && value !== "";
}
function validSource(
  source: ReviewRuleSource | undefined,
  context: ReviewRouteContext,
  asOfDate: string,
): boolean {
  if (!source) return false;
  const eventDate = sourceEventDate(source, context, asOfDate);
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    return false;
  }
  const hosts = [
    ...(OFFICIAL_SOURCE_HOSTS[context.destinationCountry] ?? []),
    "europa.eu",
    "echr.coe.int",
  ];
  const official = hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    official &&
    Boolean(
      source.authority.trim() &&
      source.locator.trim() &&
      source.version.trim() &&
      source.reviewedBy.trim(),
    ) &&
    source.status === "active" &&
    validDate(eventDate) &&
    validDate(source.effectiveFrom) &&
    validDate(source.checkedAt) &&
    validDate(source.nextReviewAt) &&
    source.checkedAt <= asOfDate &&
    asOfDate < source.nextReviewAt &&
    source.effectiveFrom <= eventDate &&
    (!source.effectiveTo || (validDate(source.effectiveTo) && eventDate < source.effectiveTo))
  );
}
/** Return a complete evidence proof for the truth branch used by the rule. */
function evidenceFor(
  condition: RuleCondition,
  facts: Record<string, unknown>,
  expected = true,
): ReviewEvidenceReference[] {
  if (evaluateRuleCondition({ condition, facts }) !== expected) return [];
  if ("fact" in condition) {
    const fact = field(facts, condition.fact);
    return object(fact) && fact.state === "confirmed" && Array.isArray(fact.evidence)
      ? fact.evidence.flatMap((item) => {
          const result = evidenceReferenceSchema.safeParse(item);
          return result.success ? [result.data] : [];
        })
      : [];
  }
  if (condition.op === "not") return evidenceFor(condition.condition, facts, !expected);
  let branches: { condition: RuleCondition; facts: Record<string, unknown> }[];
  let required: number;
  if ("conditions" in condition) {
    branches = condition.conditions.map((child) => ({ condition: child, facts }));
    const positiveCount =
      condition.op === "all"
        ? branches.length
        : condition.op === "any"
          ? 1
          : "count" in condition
            ? condition.count
            : 0;
    required = expected ? positiveCount : branches.length - positiveCount + 1;
  } else if ("collection" in condition) {
    const people = confirmedValue(field(facts, condition.collection));
    if (!Array.isArray(people) || !people.length || !people.every(object)) return [];
    branches = people.map((person) => ({ condition: condition.condition, facts: person }));
    const positiveCount = condition.op === "every" ? branches.length : 1;
    required = expected ? positiveCount : branches.length - positiveCount + 1;
  } else return [];
  const complete = branches
    .map((branch) => evidenceFor(branch.condition, branch.facts, expected))
    .filter((evidence) => evidence.length > 0);
  return complete.length >= required ? complete.slice(0, required).flat() : [];
}

function sourceEventDate(
  source: ReviewRuleSource,
  context: ReviewRouteContext,
  asOfDate: string,
): unknown {
  return source.event === "applicationDate"
    ? context.applicationDate
    : source.event === "asOfDate"
      ? asOfDate
      : confirmedValue(field(context.facts, source.event.slice(5)));
}

/** Each numeric observation keeps its own source-selected date cutoff. */
function calculationTraceDatesValid({
  calculation,
  result,
  pack,
  context,
  asOfDate,
}: {
  calculation: ReviewCalculation;
  result: ReviewCalculationResult;
  pack: ReviewRulePack;
  context: ReviewRouteContext;
  asOfDate: string;
}): boolean {
  const dateAllowed = (value: unknown, sourceIds: readonly string[]) =>
    validDate(value) &&
    value <= asOfDate &&
    (sourceIds.length ? sourceIds : calculation.sourceIds).every((id) => {
      const source = pack.sources.find((candidate) => candidate.id === id);
      const eventDate = source ? sourceEventDate(source, context, asOfDate) : undefined;
      return source && validDate(eventDate) && value <= eventDate;
    });
  // The final rounding record has aggregate provenance. Validate its numeric
  // inputs and operation metadata at their original source boundaries instead.
  return (
    dateAllowed(calculation.sourceDate, calculation.sourceIds) &&
    result.trace
      .filter((step) => step.operation !== "round")
      .every((step) => {
        const metadata = step.metadata;
        return (
          metadata !== null &&
          dateAllowed(metadata.sourceDate, metadata.sourceIds) &&
          (!metadata.fx || dateAllowed(metadata.fx.rateDate, metadata.fx.sourceIds))
        );
      })
  );
}

function assessCriterion({
  criterion,
  pack,
  context,
  asOfDate,
}: {
  criterion: ReviewCriterion;
  pack: ReviewRulePack;
  context: ReviewRouteContext;
  asOfDate: string;
}): ReviewCriterionResult {
  const facts = context.facts ?? {};
  const test = (condition: RuleCondition) => evaluateRuleCondition({ condition, facts });
  let state: CriterionState;
  let supportingCondition = criterion.requirement;
  if (
    !criterion.sourceIds.length ||
    criterion.sourceIds.some(
      (id) =>
        !validSource(
          pack.sources.find((source) => source.id === id),
          context,
          asOfDate,
        ),
    )
  )
    state = "source_conflict";
  else if (criterion.applicability && test(criterion.applicability) === false)
    state = "not_applicable";
  else if (criterion.applicability && test(criterion.applicability) === "unknown")
    state = "missing_fact";
  else if (criterion.exemption && test(criterion.exemption) === true) {
    state = "exempt";
    supportingCondition = criterion.exemption;
  } else if (criterion.individualReview) state = "review_required";
  else {
    const answer = test(criterion.requirement);
    if (answer === true)
      state =
        criterion.kind === "evidence" && !evidenceFor(criterion.requirement, facts).length
          ? "missing_evidence"
          : "supported";
    else if (
      criterion.deferral &&
      ["evidence", "submission"].includes(criterion.kind) &&
      test(criterion.deferral) === true
    ) {
      state = "deferred";
      supportingCondition = criterion.deferral;
    } else if (
      answer === "unknown" ||
      (criterion.exemption && test(criterion.exemption) === "unknown")
    )
      state = "missing_fact";
    else state = criterion.kind === "evidence" ? "missing_evidence" : "concern";
  }
  return {
    id: criterion.id,
    label: criterion.label,
    kind: criterion.kind,
    mandatory: criterion.mandatory,
    state,
    sourceIds: criterion.sourceIds,
    evidence: evidenceFor(supportingCondition, facts),
  };
}

/** Research records are deliberately not registered as approved machine rules. */
export function buildRouteAssessment({
  context,
  asOfDate,
  pack,
}: {
  context?: ReviewRouteContext;
  asOfDate: string;
  pack?: ReviewRulePack;
}): RouteAssessment {
  if (!validDate(asOfDate)) throw new Error("A valid review date is required");
  const selected = context ?? { destinationCountry: "", visaType: "" };
  const route = resolveReviewRoute(selected);
  let validPack = false;
  try {
    validPack = packSchema.safeParse(pack).success;
  } catch {
    /* Malformed recursive definitions cannot activate. */
  }
  const approved =
    route.status !== "unresolved" &&
    validPack &&
    pack?.status === "active" &&
    pack.inventoryComplete &&
    pack.reviewedAt <= asOfDate &&
    pack.routeId === route.id &&
    pack.stages.includes(selected.stage ?? "") &&
    pack.subtypes.includes(selected.subtype ?? "") &&
    pack.criteria.some((criterion) => criterion.mandatory) &&
    new Set(pack.criteria.map((item) => item.id)).size === pack.criteria.length &&
    new Set(pack.sources.map((item) => item.id)).size === pack.sources.length &&
    new Set(pack.calculations?.map((item) => item.id) ?? []).size ===
      (pack.calculations?.length ?? 0);
  const missingFacts = route.requiredFacts.filter((key) => !hasIntakeFact(selected, key));
  const derivedFacts: Record<string, unknown> = { ...selected.facts, calculations: {} };
  const calculatedFacts = derivedFacts.calculations as Record<string, unknown>;
  const calculations =
    approved && pack
      ? (pack.calculations ?? []).map((calculation) => {
          const result = calculateReviewValue({ calculation, facts: derivedFacts });
          const sourceIds = [...new Set([...calculation.sourceIds, ...result.sourceIds])];
          const valid =
            calculation.sourceDate <= asOfDate &&
            calculationTraceDatesValid({
              calculation,
              result,
              pack,
              context: selected,
              asOfDate,
            }) &&
            sourceIds.length > 0 &&
            sourceIds.every((id) =>
              validSource(
                pack.sources.find((source) => source.id === id),
                selected,
                asOfDate,
              ),
            );
          const recorded = valid
            ? result
            : { ...result, status: "unresolved" as const, value: null };
          if (recorded.status === "calculated")
            calculatedFacts[calculation.id] = {
              state: "confirmed",
              value: { value: recorded.value, metadata: recorded.metadata },
              evidence: recorded.evidence,
            };
          return recorded;
        })
      : [];
  const criteria =
    approved && pack
      ? pack.criteria.map((criterion) =>
          assessCriterion({
            criterion,
            pack,
            context: { ...selected, facts: derivedFacts },
            asOfDate,
          }),
        )
      : [];
  const blockers: RouteAssessment["blockers"] = [];
  if (!approved)
    blockers.push({
      id: "route-support",
      kind:
        route.status === "unresolved" ? "unknown_route" : pack ? "criterion" : "unapproved_rules",
      message:
        route.status === "unresolved"
          ? "Resolve the exact visa route before checking its legal requirements."
          : pack
            ? "The encoded route rules do not match the case or are incomplete. Resolve the route checks before marking ready."
            : "Route guidance is used for the agency workflow. Encoded legal clearance is assessed separately.",
    });
  for (const [index, calculation] of calculations.entries())
    if (calculation.status !== "calculated")
      blockers.push({
        id: `calculation:${index}`,
        kind: "criterion",
        message:
          "An official calculation has missing inputs, incompatible units, or an unresolved source.",
      });
  if (!validDate(selected.applicationDate))
    missingFacts.push(...(missingFacts.includes("applicationDate") ? [] : ["applicationDate"]));
  // An approved inventory declares the exact intake it needs through its conditions.
  // Generic research prompts do not add legal requirements to an approved pack.
  const requiredIntake = approved ? ["stage", "subtype", "applicationDate"] : route.requiredFacts;
  for (const key of missingFacts.filter((key) => requiredIntake.includes(key)))
    blockers.push({
      id: `fact:${key}`,
      kind: "missing_fact",
      message: `Record ${key} to select the applicable requirements.`,
    });
  for (const criterion of criteria)
    if (
      criterion.state === "source_conflict" ||
      (criterion.mandatory &&
        !["supported", "not_applicable", "exempt", "deferred"].includes(criterion.state))
    )
      blockers.push({
        id: `criterion:${criterion.id}`,
        kind: "criterion",
        message: `${criterion.label}: ${criterion.state.replaceAll("_", " ")}.`,
      });
  const tomorrow = new Date(`${asOfDate}T00:00:00.000Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 7);
  const nextReviewAt = [
    tomorrow.toISOString().slice(0, 10),
    ...(approved && pack
      ? pack.sources.map((source) => source.nextReviewAt).filter(validDate)
      : []),
  ].sort()[0];
  return {
    version: REVIEW_RUBRIC_VERSION,
    routeId: route.id,
    routeLabel: route.label,
    family: route.family,
    support: approved ? "active" : route.status,
    status: blockers.length ? "review_required" : "ready",
    asOfDate,
    nextReviewAt,
    contextKey: canonical(selected),
    packId: approved && pack ? pack.id : null,
    packVersion: approved && pack ? pack.version : null,
    packKey: canonical(approved ? pack : null),
    missingFacts,
    criteria,
    calculations,
    blockers,
    sourceUrls: approved && pack ? pack.sources.map((source) => source.url) : route.sourceUrls,
  };
}
export function canSubmitRouteAssessment(assessment: unknown): boolean {
  const result = assessmentSchema.safeParse(assessment);
  if (!result.success) return false;
  const value = result.data;
  return (
    value.version === REVIEW_RUBRIC_VERSION &&
    value.support === "active" &&
    value.status === "ready" &&
    value.blockers.length === 0 &&
    Boolean(value.packId && value.packVersion) &&
    value.calculations.every(
      (calculation) => calculation.status === "calculated" && calculation.value !== null,
    ) &&
    value.criteria.some((criterion) => criterion.mandatory) &&
    value.criteria.every(
      (criterion) =>
        criterion.state !== "source_conflict" &&
        !(criterion.state === "deferred" && !["evidence", "submission"].includes(criterion.kind)) &&
        !(
          criterion.state === "supported" &&
          criterion.kind === "evidence" &&
          !criterion.evidence.length
        ) &&
        (!criterion.mandatory ||
          ["supported", "not_applicable", "exempt", "deferred"].includes(criterion.state)),
    )
  );
}
// The agency confirmed expert approval of the route guidance. Its research
// serialization status is not a workflow hold. Encoded rule failures still block.
const approvedGuidanceRouteIds = new Set(
  Object.entries(VISA_TYPES_BY_DESTINATION).flatMap(([destinationCountry, routes]) =>
    routes.map(({ value }) => resolveReviewRoute({ destinationCountry, visaType: value }).id),
  ),
);

export function canMarkCaseReady(assessment: unknown): boolean {
  const parsed = assessmentSchema.safeParse(assessment);
  if (!parsed.success) return false;
  const value = parsed.data;
  if (value.support === "active") return canSubmitRouteAssessment(value);
  return (
    value.version === REVIEW_RUBRIC_VERSION &&
    value.support === "research_draft" &&
    approvedGuidanceRouteIds.has(value.routeId) &&
    value.packId === null &&
    value.packVersion === null &&
    value.packKey === "null" &&
    value.criteria.length === 0 &&
    value.calculations.length === 0 &&
    // Generic intake prompts remain useful details, not mandatory legal criteria.
    value.blockers.every((blocker) => ["unapproved_rules", "missing_fact"].includes(blocker.kind))
  );
}

export function isRouteAssessmentCurrent({
  assessment,
  context,
  asOfDate,
  pack,
}: {
  assessment: unknown;
  context: ReviewRouteContext;
  asOfDate: string;
  pack?: ReviewRulePack;
}): boolean {
  const parsed = assessmentSchema.safeParse(assessment);
  if (!parsed.success) return false;
  const value = parsed.data;
  if (
    value.version !== REVIEW_RUBRIC_VERSION ||
    !validDate(asOfDate) ||
    asOfDate < value.asOfDate ||
    asOfDate >= value.nextReviewAt ||
    value.contextKey !== canonical(context)
  )
    return false;
  const current = buildRouteAssessment({ context, asOfDate: value.asOfDate, pack });
  return canonical(current) === canonical(value);
}
