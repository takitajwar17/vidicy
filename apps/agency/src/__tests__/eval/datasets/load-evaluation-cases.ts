import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { evaluationCases } from "./evaluation-cases";

const documentSchema = z.object({
  checklistItemId: z.string().min(1),
  documentName: z.string().min(1),
  isRequired: z.boolean(),
  textContent: z.string().nullable(),
  description: z.string().optional(),
  commonMistakes: z.string().optional(),
  relevantChunks: z.string().optional(),
  visionImages: z
    .array(z.string().regex(/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i))
    .optional(),
});

const caseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  input: z.object({
    asOfDate: z.string().date().optional(),
    visaType: z.string().min(1),
    homeCountry: z.string().min(1),
    destinationCountry: z.string().min(1),
    currentCountry: z.string().optional(),
    embassy: z.string().optional(),
    applicantName: z.string().optional(),
    relationship: z.string().optional(),
    documents: z
      .array(documentSchema)
      .min(1)
      .max(100)
      .refine(
        (documents) =>
          new Set(documents.map((document) => document.checklistItemId)).size === documents.length,
        "Checklist identifiers must be unique within each case",
      ),
  }),
  expected: z.object({
    scoreRange: z
      .object({ min: z.number().min(0).max(100), max: z.number().min(0).max(100) })
      .refine((range) => range.min <= range.max, "Score range must have min <= max"),
    expectedRiskLevel: z.enum(["low", "medium", "high"]),
    expectedRedFlags: z.array(z.string().min(1)).optional(),
    expectedRecommendations: z.array(z.string().min(1)).optional(),
    expectedItemStatuses: z.record(z.enum(["ok", "missing", "needs_review"])).optional(),
  }),
  context: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const datasetSchema = z.object({
  provenance: z
    .object({
      kind: z.enum(["synthetic", "reviewer-labelled"]),
      description: z.string().min(1),
      version: z.string().min(1),
      reviewers: z.array(z.string().min(1)).optional(),
    })
    .refine(
      (provenance) =>
        provenance.kind !== "reviewer-labelled" || (provenance.reviewers?.length ?? 0) > 0,
      "Reviewer-labelled cases must identify the supplied reviewers",
    ),
  cases: z
    .array(caseSchema)
    .min(1)
    .max(1000)
    .refine(
      (cases) => new Set(cases.map((testCase) => testCase.id)).size === cases.length,
      "Case identifiers must be unique",
    ),
});

export type EvaluationDataset = z.infer<typeof datasetSchema>;

/** External provenance is supplied by the caller and is not independently verified. */
export async function loadEvaluationCases({ path }: { path?: string }): Promise<EvaluationDataset> {
  if (!path) {
    return datasetSchema.parse({
      provenance: {
        kind: "synthetic",
        version: "synthetic-review-v2",
        description:
          "Synthetic documents and developer-authored expected findings; not an expert-labelled accuracy study.",
      },
      cases: evaluationCases,
    });
  }
  if ((await stat(path)).size > 32 * 1024 * 1024)
    throw new Error("Evaluation dataset must not exceed 32 MiB");
  return datasetSchema.parse(JSON.parse(await readFile(path, "utf8")));
}
