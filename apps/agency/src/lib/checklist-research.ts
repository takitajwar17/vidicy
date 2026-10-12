import "server-only";

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { resolveReviewRoute, REVIEW_RUBRIC_VERSION } from "./review-rubric";

export const CHECKLIST_RESEARCH_VERSION = "checklist-v4-2026-10-23";

interface ResearchApplicant {
  id: string;
  name: string;
  relationship: string;
  nationality?: string | null;
  currentCountry?: string | null;
  dateOfBirth?: string | null;
  passportNumber?: string | null;
  approvedBefore?: boolean | null;
  approvedVisaType?: string | null;
  approvedYear?: string | null;
  rejectedBefore?: boolean | null;
  rejectedVisaType?: string | null;
  rejectedYear?: string | null;
  rejectedReason?: string | null;
}

interface ResearchApplication {
  id: string;
  homeCountry: string;
  currentCountry: string;
  destinationCountry: string;
  visaType: string;
  embassy: string;
  settings: string;
  trashedAt?: Date | null;
  finalSubmissionAt?: Date | null;
}

// Older generated rows include this prefix in their saved description.
export function getChecklistItemDescription(description: string): string {
  return description.replace(
    /^Draft — staff must confirm this document and its applicability\.\s*/,
    "",
  );
}

export function getApplicantChecklistDescription({
  description,
  applicantName,
}: {
  description: string;
  applicantName?: string;
}): string {
  const text = getChecklistItemDescription(description);
  const name = applicantName?.trim();
  if (!name || !/\s/.test(name)) return text;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fullName = name.split(/\s+/).map(escape).join("\\s+");
  const firstName = escape(name.split(/\s+/)[0]);
  return text.replace(
    new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${fullName}|${firstName}(?=['’]s\\b))(?![\\p{L}\\p{N}])`,
      "gu",
    ),
    (_match, offset: number) =>
      offset === 0 || /[.!?]\s+$/.test(text.slice(0, offset)) ? "The applicant" : "the applicant",
  );
}

export function readChecklistSettings(settings: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(settings);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Case settings must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function historyFlag({
  recorded,
  legacy,
  event,
}: {
  recorded: boolean | null | undefined;
  legacy: Record<string, unknown>;
  event: "approved" | "rejected";
}): boolean | null {
  if (typeof recorded === "boolean") return recorded;
  const legacyValue = legacy[`${event}Before`];
  if (typeof legacyValue === "boolean") return legacyValue;
  // A recorded event proves only that event; absent history stays unknown.
  return legacy.previousApplicationStatus === `previously_${event}` ? true : null;
}

export function buildChecklistResearchContext({
  application,
  applicants,
  applicantId,
  now,
  sourceVersion = `${CHECKLIST_RESEARCH_VERSION}:${REVIEW_RUBRIC_VERSION}`,
}: {
  application: ResearchApplication;
  applicants: ResearchApplicant[];
  applicantId: string;
  now: Date;
  sourceVersion?: string;
}) {
  const { checklistResearch: _generatedMetadata, ...settings } = readChecklistSettings(
    application.settings,
  );
  const people = applicants
    .map((person) => {
      const legacy = person.relationship === "primary" ? settings : {};
      return {
        id: person.id,
        name: person.name,
        relationship: person.relationship,
        nationality: person.nationality ?? null,
        currentCountry:
          person.currentCountry ??
          (person.relationship === "primary" ? application.currentCountry : null),
        dateOfBirth: person.dateOfBirth ?? null,
        passportNumber: person.passportNumber ?? null,
        history: {
          approvedBefore: historyFlag({
            recorded: person.approvedBefore,
            legacy,
            event: "approved",
          }),
          approvedVisaType: person.approvedVisaType ?? legacy.approvedVisaType ?? null,
          approvedYear: person.approvedYear ?? legacy.approvedYear ?? null,
          rejectedBefore: historyFlag({
            recorded: person.rejectedBefore,
            legacy,
            event: "rejected",
          }),
          rejectedVisaType: person.rejectedVisaType ?? legacy.rejectedVisaType ?? null,
          rejectedYear: person.rejectedYear ?? legacy.rejectedYear ?? null,
          rejectedReason: person.rejectedReason ?? legacy.rejectedReason ?? null,
        },
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  const applicant = people.find((person) => person.id === applicantId);
  if (!applicant) throw new Error("Applicant not found in this case.");
  return {
    version: sourceVersion,
    referenceDate: now.toISOString().slice(0, 10),
    routeResearch: resolveReviewRoute(application),
    application: {
      id: application.id,
      homeCountry: application.homeCountry,
      currentCountry: application.currentCountry,
      destinationCountry: application.destinationCountry,
      visaType: application.visaType,
      embassy: application.embassy,
      trashedAt: application.trashedAt?.toISOString() ?? null,
      finalSubmissionAt: application.finalSubmissionAt?.toISOString() ?? null,
      settings,
    },
    applicant,
    applicants: people,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function checklistResearchHash(
  context: ReturnType<typeof buildChecklistResearchContext>,
): string {
  const { referenceDate: _referenceDate, ...facts } = context;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(facts)))
    .digest("hex");
}

// URL validation establishes a usable citation, never official status or claim support.
export function validateChecklistSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      isIP(host) ||
      !host.includes(".") ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

const checklistSourceSchema = z.object({
  url: z.string().max(4000),
  claim: z.string().trim().min(1).max(4000),
  quotation: z.string().trim().max(4000),
  scope: z.string().trim().max(2000),
  effectiveDate: z.string().trim().max(100),
});

const generatedChecklistCandidateSchema = z.object({
  documentName: z.string().trim().min(1).max(255),
  description: z.string().trim().max(4000),
  commonMistakes: z.string().trim().max(2000),
  requirement: z.enum(["required", "recommended", "conditional", "unknown"]),
  condition: z.string().trim().max(2000),
  applicability: z.enum(["applies", "does_not_apply", "unknown"]),
  sources: z.array(checklistSourceSchema),
});

export const checklistCandidatesResponseSchema = z.object({
  items: z.array(generatedChecklistCandidateSchema).min(1),
});

// Preserve defaults for older saved candidates. The AI response requires every field.
const candidateSchema = generatedChecklistCandidateSchema.extend({
  description: generatedChecklistCandidateSchema.shape.description.default(""),
  commonMistakes: generatedChecklistCandidateSchema.shape.commonMistakes.default(""),
  requirement: generatedChecklistCandidateSchema.shape.requirement.default("unknown"),
  condition: generatedChecklistCandidateSchema.shape.condition.default(""),
  applicability: generatedChecklistCandidateSchema.shape.applicability.default("unknown"),
  sources: z
    .array(
      checklistSourceSchema.extend({
        quotation: checklistSourceSchema.shape.quotation.default(""),
        scope: checklistSourceSchema.shape.scope.default(""),
        effectiveDate: checklistSourceSchema.shape.effectiveDate.default(""),
      }),
    )
    .default([]),
});

export function normalizeChecklistCandidates({
  items,
  researchCitations,
}: {
  items: unknown;
  researchCitations: string[];
}) {
  const parsed = z.array(candidateSchema).min(1).parse(items);
  const citations = new Set(
    researchCitations.map(validateChecklistSourceUrl).filter((url): url is string => url !== null),
  );
  const seen = new Set<string>();
  return parsed
    .filter((item) => {
      const key = item.documentName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return item.applicability !== "does_not_apply";
    })
    .map((item, index) => ({
      ...item,
      // Preserve the source classification without claiming independent verification.
      isRequired:
        ["required", "conditional"].includes(item.requirement) && item.applicability === "applies",
      sortOrder: index + 1,
      reviewStatus: "unreviewed" as const,
      sources: item.sources.flatMap((source) => {
        const url = validateChecklistSourceUrl(source.url);
        return url && citations.has(url)
          ? [{ ...source, url, reviewStatus: "unverified" as const }]
          : [];
      }),
    }));
}

const storedResearchSchema = z.object({
  status: z.enum(["generated", "draft_pending_review"]),
  contextHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceVersion: z.string().min(1),
  referenceDate: z.string().date(),
  generatedAt: z.string().datetime(),
  retrievedAt: z.string().datetime().nullable(),
  source: z.enum(["live_search", "cached", "model_knowledge"]),
  route: z.object({ destinationCountry: z.string(), visaType: z.string() }).optional(),
  citations: z.array(z.string()),
  activeCandidateIds: z.array(z.string().min(1)).optional(),
  candidates: z.array(candidateSchema.extend({ checklistItemId: z.string().min(1) })),
});

function readStoredResearch(value: unknown) {
  const parsed = storedResearchSchema.safeParse(value);
  if (!parsed.success) return null;
  const record = parsed.data;
  const candidates = record.candidates.flatMap((candidate) => {
    const normalized = normalizeChecklistCandidates({
      items: [candidate],
      researchCitations: record.citations,
    })[0];
    return normalized ? [{ ...normalized, checklistItemId: candidate.checklistItemId }] : [];
  });
  const ids = new Set(candidates.map((candidate) => candidate.checklistItemId));
  return {
    ...record,
    citations: record.citations
      .map(validateChecklistSourceUrl)
      .filter((url): url is string => url !== null),
    activeCandidateIds: (record.activeCandidateIds ?? [...ids]).filter((id) => ids.has(id)),
    candidates,
  };
}

export interface ChecklistResearchDetailsInput {
  application: ResearchApplication;
  applicants: ResearchApplicant[];
  applicantId: string;
  now: Date;
}

export function getChecklistResearchDetails(input: ChecklistResearchDetailsInput) {
  const unavailable = {
    currentness: "unavailable" as const,
    records: [] as NonNullable<ReturnType<typeof readStoredResearch>>[],
    unreadableVersions: 0,
  };
  try {
    const settings = readChecklistSettings(input.application.settings);
    const research = settings.checklistResearch;
    if (!research || typeof research !== "object" || Array.isArray(research)) return unavailable;
    const latest = (research as Record<string, unknown>)[input.applicantId];
    const record = readStoredResearch(latest);
    if (!record) return unavailable;
    const previous = (latest as Record<string, unknown>).previousResearch;
    const older = Array.isArray(previous) ? previous.map(readStoredResearch) : [];
    const context = buildChecklistResearchContext(input);
    return {
      currentness:
        record.contextHash === checklistResearchHash(context) &&
        record.sourceVersion === context.version
          ? ("current" as const)
          : ("outdated" as const),
      records: [
        record,
        ...older
          .filter((version): version is NonNullable<typeof version> => version !== null)
          .reverse(),
      ],
      unreadableVersions: older.filter((version) => version === null).length,
    };
  } catch {
    return unavailable;
  }
}
