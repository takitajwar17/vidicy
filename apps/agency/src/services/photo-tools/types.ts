import "server-only";

export type PhotoToolSlug =
  | "us-visa-photo-requirements"
  | "schengen-visa-photo-requirements";

export type PhotoCheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface PhotoToolSourceLink {
  label: string;
  href: string;
}

export interface PhotoToolProfile {
  slug: PhotoToolSlug;
  enabled: boolean;
  countryCode: "US" | "EU";
  title: string;
  summary: string;
  expectedAspectRatio: number;
  aspectRatioTolerance: number;
  minWidthPx: number;
  minHeightPx: number;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  technicalRules: string[];
  visualFocus: string[];
  officialSources: PhotoToolSourceLink[];
  previewCTAPath: string;
}

export interface TechnicalCheckResult {
  key: string;
  label: string;
  status: PhotoCheckStatus;
  actual: string;
  expected: string;
  detail: string;
  fix: string;
}

export interface VisualCheckResult {
  key: string;
  label: string;
  status: PhotoCheckStatus;
  detail: string;
  fix: string;
}

export interface GatedFullReport {
  state: "locked" | "preview";
  preview: string[];
  unlockLabel: string;
  unlockHref: string;
}

export interface PhotoAnalysisResult {
  slug: PhotoToolSlug;
  toolTitle: string;
  overallStatus: "pass" | "review" | "fail";
  technicalChecks: TechnicalCheckResult[];
  visualChecks: VisualCheckResult[];
  topFixes: string[];
  gatedFullReport: GatedFullReport;
  analysisSource: "openai" | "fallback";
}

export type PhotoAnalysisResponse = PhotoAnalysisResult;
