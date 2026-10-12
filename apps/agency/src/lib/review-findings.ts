import { z } from "zod";

export const REVIEW_FINDING_TITLE_MAX_LENGTH = 100;
export const REVIEW_FINDING_TITLE_MAX_WORDS = 10;

export const reviewFindingTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(REVIEW_FINDING_TITLE_MAX_LENGTH)
  .refine((title) => title.split(/\s+/).length <= REVIEW_FINDING_TITLE_MAX_WORDS, {
    message: "Use no more than 10 words in a finding title.",
  })
  .refine((title) => !/[\r\n]|\b(?:citem|udoc|appl|vapp|usr)_[a-z0-9_]+\b/i.test(title), {
    message: "Keep line breaks and internal record IDs out of finding titles.",
  })
  .refine((title) => !/\b\S+\.(?:pdf|docx?|png|jpe?g|webp|tiff?)\b/i.test(title), {
    message: "Use an issue label instead of a filename as the finding title.",
  });

export const reviewFindingSchema = z.object({
  title: reviewFindingTitleSchema,
  details: z.string().trim().min(1),
  recommendation: z.string().trim().min(1),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
/** Existing evaluations stored concern paragraphs as strings. */
export type StoredReviewFinding = string | ReviewFinding;

export function getReviewFindingText(finding: StoredReviewFinding): string {
  return typeof finding === "string"
    ? finding
    : `${finding.title}: ${finding.details}\n${finding.recommendation}`;
}

export function mergeReviewFindings(findings: ReviewFinding[]): ReviewFinding[] {
  return [...new Map(findings.map((finding) => [finding.details.trim(), finding])).values()];
}
