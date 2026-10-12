export const CHECKLIST_REQUIREMENTS = [
  "required",
  "recommended",
  "conditional",
  "unknown",
] as const;
export const CHECKLIST_APPLICABILITY = ["applies", "does_not_apply", "unknown"] as const;
export type ChecklistRequirementType = (typeof CHECKLIST_REQUIREMENTS)[number];
export type ChecklistApplicability = (typeof CHECKLIST_APPLICABILITY)[number];

export interface ChecklistRequirementInput {
  id: string;
  applicantId: string | null;
  isRequired: boolean;
  requirementType?: ChecklistRequirementType | null;
  applicability?: ChecklistApplicability | null;
  requirementCondition?: string | null;
  origin?: string | null;
  removedAt?: Date | string | null;
}

export function getChecklistRequirement(item: ChecklistRequirementInput) {
  const requirementType = item.requirementType ?? (item.isRequired ? "required" : "recommended");
  const applicability = item.applicability ?? "applies";
  return {
    requirementType,
    applicability,
    isRequired:
      !item.removedAt &&
      applicability === "applies" &&
      ["required", "conditional"].includes(requirementType),
    unresolved:
      !item.removedAt &&
      applicability !== "does_not_apply" &&
      (requirementType === "unknown" ||
        (requirementType !== "recommended" && applicability === "unknown")),
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getResearchCandidates(settings: string) {
  const candidates = new Map<string, Record<string, unknown>>();
  try {
    const parsed: unknown = JSON.parse(settings);
    if (record(parsed) && record(parsed.checklistResearch)) {
      const visit = (research: unknown) => {
        if (!record(research)) return;
        if (Array.isArray(research.previousResearch)) research.previousResearch.forEach(visit);
        for (const candidate of Array.isArray(research.candidates) ? research.candidates : []) {
          if (record(candidate) && typeof candidate.checklistItemId === "string")
            candidates.set(candidate.checklistItemId, candidate);
        }
      };
      Object.values(parsed.checklistResearch).forEach(visit);
    }
  } catch {
    /* Legacy rows without research retain their saved classification. */
  }
  return candidates;
}

export function getGeneratedChecklistIds(settings: string) {
  return new Set(getResearchCandidates(settings).keys());
}

/** Recover older generated classifications without a live-data migration. */
export function resolveChecklistItems<T extends ChecklistRequirementInput>({
  items,
  settings,
}: {
  items: T[];
  settings: string;
}) {
  const candidates = getResearchCandidates(settings);
  return items
    .filter((item) => !item.removedAt)
    .map((item) => {
      const candidate =
        !item.requirementType && item.origin !== "staff" ? candidates.get(item.id) : undefined;
      const requirementType =
        candidate &&
        CHECKLIST_REQUIREMENTS.includes(candidate.requirement as ChecklistRequirementType)
          ? (candidate.requirement as ChecklistRequirementType)
          : getChecklistRequirement(item).requirementType;
      const applicability =
        candidate &&
        CHECKLIST_APPLICABILITY.includes(candidate.applicability as ChecklistApplicability)
          ? (candidate.applicability as ChecklistApplicability)
          : getChecklistRequirement(item).applicability;
      const resolved = {
        ...item,
        requirementType,
        applicability,
        requirementCondition:
          item.requirementCondition ??
          (typeof candidate?.condition === "string" ? candidate.condition : null),
      };
      return { ...resolved, isRequired: getChecklistRequirement(resolved).isRequired };
    });
}

export interface ReviewDocumentInput {
  id: string;
  checklistItemId: string | null;
  extractionStatus?: string;
  indexingStatus?: string;
  textContent?: string | null;
  imageDescription?: string | null;
  mimeType?: string;
  pageCount?: number | null;
}

export function isDocumentUsable(document: ReviewDocumentInput) {
  if (["queued", "extracting"].includes(document.extractionStatus ?? "")) return false;
  if (document.textContent?.trim() || document.imageDescription?.trim()) return true;
  return (
    ["completed", "partial"].includes(document.extractionStatus ?? "") &&
    (document.mimeType?.startsWith("image/") ||
      (document.mimeType === "application/pdf" && (document.pageCount ?? 0) > 0))
  );
}

export function getReviewAvailability({
  applicantId,
  items,
  documents,
}: {
  applicantId: string;
  items: ChecklistRequirementInput[];
  documents: ReviewDocumentInput[];
}) {
  const relevant = items.filter(
    (item) =>
      !item.removedAt &&
      item.applicability !== "does_not_apply" &&
      (item.applicantId === applicantId || item.applicantId === null),
  );
  const unavailable = (
    state: "checklist_needed" | "documents_needed" | "processing" | "unreadable",
    reason: string,
  ) => ({ canReview: false, state, reason });
  if (!relevant.length)
    return unavailable(
      "checklist_needed",
      "Generate or add checklist items for this applicant first.",
    );
  const ids = new Set(relevant.map((item) => item.id));
  const latest = new Map<string, ReviewDocumentInput>();
  for (const document of documents)
    if (
      document.checklistItemId &&
      ids.has(document.checklistItemId) &&
      !latest.has(document.checklistItemId)
    )
      latest.set(document.checklistItemId, document);
  if (!latest.size)
    return unavailable("documents_needed", "Upload documents for this applicant first.");
  if ([...latest.values()].some(isDocumentUsable))
    return { canReview: true, state: "available" as const, reason: null };
  if (
    [...latest.values()].some((document) =>
      ["queued", "extracting"].includes(document.extractionStatus ?? ""),
    )
  )
    return unavailable("processing", "Wait for document processing to finish.");
  return unavailable(
    "unreadable",
    "No usable document evidence. Retry processing or replace the files.",
  );
}

export function getRequirementLabel(item: ChecklistRequirementInput) {
  const state = getChecklistRequirement(item);
  if (state.applicability === "does_not_apply") return "Does not apply";
  if (state.unresolved)
    return state.requirementType === "conditional"
      ? "Conditional — details needed"
      : "Requirement not determined";
  return {
    required: "Required",
    recommended: "Recommended",
    conditional: "Required for this case",
    unknown: "Not determined",
  }[state.requirementType];
}
