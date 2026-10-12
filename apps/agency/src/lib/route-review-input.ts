import { z } from "zod";

const calendarDate = z.union([z.literal(""), z.string().date()]);
export const routeReviewInputSchema = z.object({
  applicationId: z.string().min(1),
  expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  destinationCountry: z.string().trim().min(1).max(100).optional(),
  visaType: z.string().trim().min(1).max(100).optional(),
  stage: z.string().trim().max(100),
  subtype: z.string().trim().max(255),
  applicationDate: calendarDate,
  facts: z
    .record(
      z
        .string()
        .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
        .refine((key) => !["constructor", "prototype", "__proto__"].includes(key)),
      z.string().trim().max(2000),
    )
    .refine((facts) => Object.keys(facts).length <= 80),
  applicants: z
    .array(
      z.object({
        id: z.string().min(1),
        nationality: z.string().trim().max(100),
        dateOfBirth: calendarDate.refine(
          (date) => !date || date <= new Date().toISOString().slice(0, 10),
          "Date of birth cannot be in the future",
        ),
      }),
    )
    .min(1)
    .max(100),
});
export type RouteReviewInput = z.infer<typeof routeReviewInputSchema>;

export const ROUTE_FACT_LABELS: Record<string, string> = {
  nationality: "Nationality",
  applicationLocation: "Application location",
  authority: "Responsible authority or mission",
  purpose: "Purpose of the visit",
  plannedActivities: "Planned activities",
  stayDates: "Arrival and departure dates",
  fundingPath: "Source of financial support",
  institution: "School or institution",
  course: "Course or qualification",
  studyDates: "Course start and end dates",
  fundingPeriod: "Period covered by the funds",
  occupation: "Occupation and duties",
  employer: "Employer or work-permit basis",
  workLocation: "Work location",
  qualificationPath: "Qualification or experience path",
  salary: "Pay, currency and gross or net basis",
  workingHours: "Contracted working hours",
  sponsorLegalStatus: "Sponsor's nationality and legal status",
  relationshipToSponsor: "Relationship to the sponsor",
  familyDates: "Relationship and permit dates",
  dependants: "Children, custody and dependency",
  programme: "Exact programme",
  familySize: "Family members included in the calculation",
  nonAccompanyingFamily: "Family members who will not travel",
  airport: "Transit airport and terminals",
  itinerary: "Full journey",
  airsideOrLandside: "Airside transit or border crossing",
  onwardEntryPermission: "Permission to enter the next destination",
  passportType: "Passport type and issuing country",
  dateOfBirth: "Date of birth",
  participationHistory: "Previous visas, participation and travel dates",
  applicationAccess: "Quota, ballot, invitation or appointment status",
  sponsor: "Programme sponsor",
  currentStatus: "Current immigration status",
  courseCompletion: "Course completion and reporting date",
  legalRegime: "Applicable legal basis",
  canton: "Canton",
  municipality: "Municipality",
  region: "Region",
  memberState: "Responsible Schengen state",
  statusCode: "Exact status code",
  occupationCodeVersion: "Occupation code and source edition",
};

export function readRouteReviewSettings(settings: string): {
  stage: string;
  subtype: string;
  applicationDate: string;
  facts: Record<string, string>;
} {
  try {
    const parsed = JSON.parse(settings);
    const saved = parsed?.routeReview;
    return {
      stage: typeof saved?.stage === "string" ? saved.stage : "",
      subtype: typeof saved?.subtype === "string" ? saved.subtype : "",
      applicationDate: typeof saved?.applicationDate === "string" ? saved.applicationDate : "",
      facts:
        saved?.facts && typeof saved.facts === "object" && !Array.isArray(saved.facts)
          ? Object.fromEntries(
              Object.entries(saved.facts).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string",
              ),
            )
          : {},
    };
  } catch {
    return { stage: "", subtype: "", applicationDate: "", facts: {} };
  }
}
