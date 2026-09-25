/**
 * Core types for the LLM evaluation framework.
 */

// ---------------------------------------------------------------------------
// Test case
// ---------------------------------------------------------------------------

export interface EvalTestCase<TInput = unknown, TExpected = unknown> {
  /** Unique identifier for this test case */
  id: string;
  /** Human-readable description */
  description: string;
  /** Input to the LLM feature under test */
  input: TInput;
  /** Expected / reference output (for comparison metrics) */
  expected?: TExpected;
  /** Additional context injected into the prompt (e.g. document text) */
  context?: string;
  /** Arbitrary metadata for filtering / reporting */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/** Score returned by a single metric for a single test case */
export interface MetricScore {
  /** Metric name */
  name: string;
  /** Numeric score – convention: 0.0 (worst) → 1.0 (best) */
  score: number;
  /** Pass / fail relative to the metric's threshold */
  passed: boolean;
  /** Optional human-readable detail */
  detail?: string;
}

/** A metric function that scores an LLM output */
export interface EvalMetric<TOutput = unknown, TExpected = unknown> {
  /** Metric name (used in reports) */
  name: string;
  /** Minimum score to pass (0–1) */
  threshold: number;
  /** Scoring function */
  score(params: {
    output: TOutput;
    expected?: TExpected;
    input?: unknown;
    context?: string;
  }): MetricScore | Promise<MetricScore>;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Result for a single test case */
export interface CaseResult {
  caseId: string;
  description: string;
  scores: MetricScore[];
  passed: boolean;
  /** Wall-clock time for the LLM call (ms) */
  latencyMs?: number;
}

/** Aggregated stats for one metric across all cases */
export interface MetricAggregate {
  name: string;
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  passRate: number;
}

/** Full evaluation run result */
export interface EvalRunResult {
  suiteName: string;
  timestamp: string;
  caseResults: CaseResult[];
  aggregates: MetricAggregate[];
  overallPassed: boolean;
}

// ---------------------------------------------------------------------------
// Baseline / regression
// ---------------------------------------------------------------------------

export interface BaselineEntry {
  suiteName: string;
  timestamp: string;
  aggregates: MetricAggregate[];
}

export interface RegressionFlag {
  metric: string;
  baselineScore: number;
  currentScore: number;
  delta: number;
  thresholdPct: number;
}

// ---------------------------------------------------------------------------
// LLM-as-judge
// ---------------------------------------------------------------------------

export type JudgeDimension = "accuracy" | "helpfulness" | "relevance" | "specificity" | "safety" | "actionability" | "completeness" | "groundedness";

export interface JudgeScore {
  dimension: JudgeDimension;
  score: number; // 1–10
  reasoning: string;
}

export interface JudgeResult {
  scores: JudgeScore[];
  overallScore: number;
}

// ---------------------------------------------------------------------------
// Checklist-specific types (mirroring LLM output shape)
// ---------------------------------------------------------------------------

export interface ChecklistItemOutput {
  documentName: string;
  description: string;
  commonMistakes: string;
  isRequired: boolean;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Evaluation-specific types (mirroring LLM output shape)
// ---------------------------------------------------------------------------

export interface ExtractedFields {
  holderName: string | null;
  expiryDate: string | null;
  documentNumber: string | null;
  issuingAuthority: string | null;
  language: string;
  dateRange: { from: string; to: string } | null;
}

export interface PerDocEvalOutput {
  status: "ok" | "needs_review" | "missing_content" | "wrong_document";
  score: number;
  issues: string[];
  strengths: string[];
  feedback: string;
  confidence: number;
  confidenceReason: string;
  extractedFields: ExtractedFields;
}

export interface ItemFeedback {
  status: "ok" | "missing" | "needs_review";
  feedback: string;
  score?: number;
  issues?: string[];
  strengths?: string[];
  hasDocument?: boolean;
  hasContent?: boolean;
  confidence?: number;
  confidenceReason?: string;
  extractedFields?: ExtractedFields;
}

export interface OrchestratorEvalOutput {
  overallScore: number;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  redFlags: string[];
  strengths: string[];
  recommendations: string[];
  itemFeedback: Record<string, ItemFeedback>;
}

// ---------------------------------------------------------------------------
// Chat-specific types
// ---------------------------------------------------------------------------

export interface ChatTestInput {
  message: string;
  systemPrompt: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ChatExpected {
  shouldRefuse?: boolean;
  mustContainKeywords?: string[];
  mustCiteSources?: boolean;
  referenceAnswer?: string;
}
