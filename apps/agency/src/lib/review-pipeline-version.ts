// Bump these versions when prompt text, extraction, retrieval, or result
// processing changes without a model change. Saved reviews must then be run again.
export const REVIEW_PIPELINE_VERSION = "review-pipeline-v2";
export const REVIEW_PROMPT_VERSION = "route-evidence-prompts-v2";
export const EXTRACTION_PIPELINE_VERSION = "document-extraction-v1";
export const RETRIEVAL_PIPELINE_VERSION = "document-retrieval-v1";
export const GEMINI_DOCUMENT_EXTRACTION_MODEL = "gemini-3.8-flash";
export const GEMINI_DOCUMENT_EVALUATION_MODEL = "gemini-3.8-flash";
export const EVALUATION_TRANSLATION_MODEL = "gpt-4.1-mini";
export const DOCUMENT_EMBEDDING_MODEL = "text-embedding-3-small";
export const OPENAI_DOC_EXTRACT_PRIMARY_MODEL = "gpt-4.1";
export const OPENAI_DOC_EXTRACT_FALLBACK_MODEL = "gpt-4.1-mini";

export function getReviewPipelineIdentity() {
  return {
    pipeline: REVIEW_PIPELINE_VERSION,
    prompts: REVIEW_PROMPT_VERSION,
    extraction: EXTRACTION_PIPELINE_VERSION,
    retrieval: RETRIEVAL_PIPELINE_VERSION,
    extractionModel: GEMINI_DOCUMENT_EXTRACTION_MODEL,
    evaluationModel: GEMINI_DOCUMENT_EVALUATION_MODEL,
    translationModel: EVALUATION_TRANSLATION_MODEL,
    embeddingModel: DOCUMENT_EMBEDDING_MODEL,
    extractionPrimaryFallback: OPENAI_DOC_EXTRACT_PRIMARY_MODEL,
    extractionSecondaryFallback: OPENAI_DOC_EXTRACT_FALLBACK_MODEL,
  };
}
