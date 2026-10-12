import { createHash } from "node:crypto";
import { ZSAError } from "zsa";
import type {
  applicantTable,
  checklistItemTable,
  uploadedDocumentTable,
  visaApplicationTable,
} from "@/db/schema";
import { REVIEW_RUBRIC_VERSION, type ReviewRouteContext } from "@/lib/review-rubric";
import { getReviewPipelineIdentity } from "@/lib/review-pipeline-version";
import { resolveChecklistItems } from "@/lib/checklist-state";

type Application = typeof visaApplicationTable.$inferSelect;
type Applicant = typeof applicantTable.$inferSelect;

export interface ReviewSnapshotInput {
  application: Application;
  applicants: Applicant[];
  checklistItems: (typeof checklistItemTable.$inferSelect)[];
  documents: (typeof uploadedDocumentTable.$inferSelect)[];
}

function readSettings(settings: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(settings);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function personFacts(applicant: Applicant) {
  return {
    id: applicant.id,
    name: applicant.name,
    relationship: applicant.relationship,
    nationality: applicant.nationality,
    dateOfBirth: applicant.dateOfBirth,
    passportNumber: applicant.passportNumber,
    approvedBefore: applicant.approvedBefore,
    approvedVisaType: applicant.approvedVisaType,
    approvedYear: applicant.approvedYear,
    rejectedBefore: applicant.rejectedBefore,
    rejectedVisaType: applicant.rejectedVisaType,
    rejectedYear: applicant.rejectedYear,
    rejectedReason: applicant.rejectedReason,
  };
}

export function buildReviewRouteContext({
  application,
  applicants,
  applicantId,
}: Pick<ReviewSnapshotInput, "application" | "applicants"> & { applicantId: string }) {
  const applicant = applicants.find((person) => person.id === applicantId);
  if (!applicant) throw new ZSAError("NOT_FOUND", "Applicant not found.");
  const settings = readSettings(application.settings);
  const route = settings.routeReview;
  const saved =
    route && typeof route === "object" && !Array.isArray(route)
      ? (route as Record<string, unknown>)
      : {};
  const facts =
    saved.facts && typeof saved.facts === "object" && !Array.isArray(saved.facts)
      ? (saved.facts as Record<string, unknown>)
      : {};
  return {
    destinationCountry: application.destinationCountry,
    visaType: application.visaType,
    stage: typeof saved.stage === "string" ? saved.stage : undefined,
    subtype: typeof saved.subtype === "string" ? saved.subtype : undefined,
    applicationDate: typeof saved.applicationDate === "string" ? saved.applicationDate : undefined,
    facts: {
      ...facts,
      ...(facts.relationshipToSponsor === undefined && facts.relationship !== undefined
        ? { relationshipToSponsor: facts.relationship }
        : {}),
      ...personFacts(applicant),
      applicantId,
      applicant: personFacts(applicant),
      applicants: [...applicants].sort((a, b) => a.id.localeCompare(b.id)).map(personFacts),
      partySize: applicants.length,
      homeCountry: application.homeCountry,
      currentCountry: application.currentCountry,
      embassy: application.embassy,
    },
  } satisfies ReviewRouteContext;
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function buildReviewContextHash({
  application,
  applicants,
  checklistItems,
  documents,
}: ReviewSnapshotInput) {
  const snapshot = {
    version: 2,
    pipeline: getReviewPipelineIdentity(),
    rubricVersion: REVIEW_RUBRIC_VERSION,
    application: {
      id: application.id,
      agencyId: application.agencyId,
      userId: application.userId,
      clientId: application.clientId,
      trashedAt: application.trashedAt,
      caseNumber: application.caseNumber,
      homeCountry: application.homeCountry,
      currentCountry: application.currentCountry,
      destinationCountry: application.destinationCountry,
      visaType: application.visaType,
      embassy: application.embassy,
      name: application.name,
      clientName: application.clientName,
      // Preserve every setting, including unknown future route facts.
      settings: application.settings,
      checklistSource: application.checklistSource,
      checklistCitations: application.checklistCitations,
      actualOutcome: application.actualOutcome,
      outcomeDate: application.outcomeDate,
      outcomeNotes: application.outcomeNotes,
    },
    applicants: [...applicants].sort((a, b) => a.id.localeCompare(b.id)).map(personFacts),
    checklistItems: resolveChecklistItems({ items: checklistItems, settings: application.settings })
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => ({
        id: item.id,
        applicationId: item.applicationId,
        applicantId: item.applicantId,
        documentName: item.documentName,
        description: item.description,
        commonMistakes: item.commonMistakes,
        isRequired: item.isRequired,
        requirementType: item.requirementType,
        applicability: item.applicability,
        requirementCondition: item.requirementCondition,
        sortOrder: item.sortOrder,
      })),
    // Hash full processing input, not only upload ID. Re-extraction can change
    // the model's evidence without a new upload.
    documents: [...documents].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash("sha256")
    .update(JSON.stringify(stableValue(snapshot)))
    .digest("hex");
}
