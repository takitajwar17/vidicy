import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { type InferSelectModel } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { visaApplicationTable, riskLevelTuple, scoreConfidenceTuple } from "./visa-application";
import { applicantTable } from "./applicant";
import { checklistItemTable } from "./checklist";

export const DOCUMENT_EXTRACTION_STATUS = {
  QUEUED: "queued",
  EXTRACTING: "extracting",
  COMPLETED: "completed",
  FAILED: "failed",
  PARTIAL: "partial",
  SKIPPED: "skipped",
  UNSUPPORTED: "unsupported",
} as const;

export type DocumentExtractionStatus =
  (typeof DOCUMENT_EXTRACTION_STATUS)[keyof typeof DOCUMENT_EXTRACTION_STATUS];

export const documentExtractionStatusTuple = Object.values(DOCUMENT_EXTRACTION_STATUS) as [
  DocumentExtractionStatus,
  ...DocumentExtractionStatus[],
];

export const DOCUMENT_INDEXING_STATUS = {
  QUEUED: "queued",
  INDEXING: "indexing",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
} as const;

export type DocumentIndexingStatus =
  (typeof DOCUMENT_INDEXING_STATUS)[keyof typeof DOCUMENT_INDEXING_STATUS];

export const documentIndexingStatusTuple = Object.values(DOCUMENT_INDEXING_STATUS) as [
  DocumentIndexingStatus,
  ...DocumentIndexingStatus[],
];

export interface DocumentExtractionPayload {
  [key: string]: unknown;
}

export const SUPPORTED_DOCUMENT_MIME_TYPES = {
  PDF: "application/pdf",
  JPEG: "image/jpeg",
  JPG: "image/jpg",
  PNG: "image/png",
} as const;

const supportedDocumentMimeTypes: ReadonlySet<string> = new Set(
  Object.values(SUPPORTED_DOCUMENT_MIME_TYPES),
);

export function isSupportedDocumentMimeType(mimeType: string): boolean {
  return supportedDocumentMimeTypes.has(mimeType.toLowerCase());
}

// Uploaded document table
export const uploadedDocumentTable = sqliteTable(
  "uploaded_document",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => `udoc_${createId()}`)
      .notNull(),
    applicationId: text()
      .notNull()
      .references(() => visaApplicationTable.id, { onDelete: "cascade" }),
    applicantId: text().references(() => applicantTable.id, { onDelete: "cascade" }),
    checklistItemId: text().references(() => checklistItemTable.id, { onDelete: "set null" }),
    fileName: text({ length: 255 }).notNull(),
    fileKey: text({ length: 500 }).notNull(),
    fileSize: integer().notNull(),
    mimeType: text({ length: 100 }).notNull(),
    uploadedAt: integer({ mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    chunkCount: integer().default(0).notNull(),
    extractionStatus: text({ enum: documentExtractionStatusTuple })
      .default(DOCUMENT_EXTRACTION_STATUS.QUEUED)
      .notNull(),
    indexingStatus: text({ enum: documentIndexingStatusTuple })
      .default(DOCUMENT_INDEXING_STATUS.QUEUED)
      .notNull(),
    extractionMethod: text({ length: 100 }),
    extractedAt: integer({ mode: "timestamp" }),
    indexingAttemptedAt: integer({ mode: "timestamp" }),
    pageCount: integer(),
    imageDescription: text({ length: 2000 }),
    extractionPayload: text({ mode: "json" }).$type<DocumentExtractionPayload | null>(),
    // Normalized extracted text from the file (truncated to ~50k chars).
    textContent: text({ length: 50000 }),
  },
  (table) => [
    index("uploaded_doc_app_id_idx").on(table.applicationId),
    index("uploaded_doc_applicant_id_idx").on(table.applicantId),
    index("uploaded_doc_checklist_item_idx").on(table.checklistItemId),
    index("uploaded_doc_extraction_status_idx").on(table.extractionStatus),
    index("uploaded_doc_indexing_status_idx").on(table.indexingStatus),
    index("uploaded_doc_uploaded_at_idx").on(table.uploadedAt),
    // Composite: evaluation and workspace pages filter by (applicationId, applicantId)
    index("uploaded_doc_app_applicant_idx").on(table.applicationId, table.applicantId),
    // Composite: document deletion checks whether another file exists for the checklist item
    index("uploaded_doc_app_checklist_item_idx").on(table.applicationId, table.checklistItemId),
    // Composite: app-wide document reads ordered by newest upload within an application
    index("uploaded_doc_app_uploaded_idx").on(table.applicationId, table.uploadedAt),
    index("uploaded_doc_app_applicant_uploaded_idx").on(
      table.applicationId,
      table.applicantId,
      table.uploadedAt,
    ),
  ],
);

// Document evaluation table
export const documentEvaluationTable = sqliteTable(
  "document_evaluation",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => `deval_${createId()}`)
      .notNull(),
    applicationId: text()
      .notNull()
      .references(() => visaApplicationTable.id, { onDelete: "cascade" }),
    applicantId: text().references(() => applicantTable.id, { onDelete: "cascade" }),
    overallScore: integer().notNull(),
    riskLevel: text({ enum: riskLevelTuple }).notNull(),
    summary: text({ length: 2000 }).notNull(),
    redFlags: text({ mode: "json" }).notNull().$type<string[]>(),
    strengths: text({ mode: "json" }).notNull().$type<string[]>(),
    recommendations: text({ mode: "json" }).notNull().$type<string[]>(),
    itemFeedback: text({ mode: "json" }).$type<
      Record<
        string,
        {
          status: string;
          feedback: string;
          /** Per-document AI evaluation score (0-100) */
          score?: number;
          /** Specific issues found in the document content */
          issues?: string[];
          /** Positive aspects found in the document content */
          strengths?: string[];
          /** Whether a document file was uploaded for this checklist item */
          hasDocument?: boolean;
          /** Whether readable text was extracted from the uploaded PDF */
          hasContent?: boolean;
          /** AI confidence in this evaluation (0-100). Low for scanned/image-only documents. */
          confidence?: number;
          /** Human-readable explanation of the confidence level */
          confidenceReason?: string;
          /** Structured fields extracted from the document content for cross-doc consistency */
          extractedFields?: {
            holderName: string | null;
            expiryDate: string | null;
            documentNumber: string | null;
            issuingAuthority: string | null;
            language: string;
            dateRange: { from: string; to: string } | null;
          };
        }
      >
    >(),
    /**
     * Snapshot of document version keys at the time of evaluation.
     * Maps checklistItemId → versionKey (e.g. "udoc_abc:1").
     * Used by incremental evaluation to skip re-evaluating unchanged documents on re-runs.
     * Null on evaluations created before this column was added.
     */
    docSnapshots: text({ mode: "json" }).$type<Record<string, string>>(),
    /**
     * Ensemble scoring confidence level — only set for borderline scores (within ±12 of
     * the visa-type threshold). A second adversarial AI pass is run and the two scores are
     * compared. Null means the score was not borderline and ensemble was not triggered.
     */
    scoreConfidence: text({ enum: scoreConfidenceTuple }).$type<"high" | "moderate" | "low">(),
    /**
     * Absolute divergence (|score1 - score2|) between the primary and adversarial AI passes.
     * Only set when scoreConfidence is set. Null otherwise.
     */
    ensembleDivergence: integer(),
    /**
     * Legacy AI-generated preview Q&A retained for older evaluations.
     * JSON: { question: string, answer: string }
     */
    atlasPreview: text({ mode: "json" }).$type<{ question: string; answer: string }>(),
    createdAt: integer({ mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("doc_eval_app_id_idx").on(table.applicationId),
    index("doc_eval_applicant_id_idx").on(table.applicantId),
    index("doc_eval_created_at_idx").on(table.createdAt),
    // Composite: evaluation queries filter by (applicationId, applicantId) ordered by createdAt
    index("doc_eval_app_applicant_idx").on(table.applicationId, table.applicantId),
    // Composite: app-wide reads ordered by the newest evaluation for an application
    index("doc_eval_app_created_idx").on(table.applicationId, table.createdAt),
    index("doc_eval_app_applicant_created_idx").on(
      table.applicationId,
      table.applicantId,
      table.createdAt,
    ),
  ],
);

export type UploadedDocument = InferSelectModel<typeof uploadedDocumentTable>;
export type DocumentEvaluation = InferSelectModel<typeof documentEvaluationTable>;

export interface DocumentPipelineStateInput {
  extractionStatus: DocumentExtractionStatus;
  indexingStatus: DocumentIndexingStatus;
}

export interface DocumentPipelineState {
  isReadableByAI: boolean;
  isIndexedForSearch: boolean;
}

export function getDocumentPipelineState({
  extractionStatus,
  indexingStatus,
}: DocumentPipelineStateInput): DocumentPipelineState {
  return {
    isReadableByAI:
      extractionStatus === DOCUMENT_EXTRACTION_STATUS.COMPLETED ||
      extractionStatus === DOCUMENT_EXTRACTION_STATUS.PARTIAL,
    isIndexedForSearch: indexingStatus === DOCUMENT_INDEXING_STATUS.COMPLETED,
  };
}
