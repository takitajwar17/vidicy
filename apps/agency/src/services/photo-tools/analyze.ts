import "server-only";

import OpenAI from "openai";
import { getOpenAIClient } from "@/lib/openai";
import type {
  GatedFullReport,
  PhotoAnalysisResult,
  PhotoToolProfile,
  TechnicalCheckResult,
  VisualCheckResult,
} from "./types";
import { sniffPhotoImageMetadata } from "./image-metadata";

const PHOTO_ANALYSIS_TIMEOUT_MS = 12_000;
const MAX_TECHNICAL_FIXES = 5;

function mimeLabel(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "image/webp":
      return "WebP";
    case "image/gif":
      return "GIF";
    default:
      return mimeType;
  }
}

function ratioDelta(actual: number, expected: number) {
  if (expected === 0) {
    return 1;
  }

  return Math.abs(actual - expected) / expected;
}

function toDataUrl(bytes: Uint8Array, mimeType: string) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function tryParseJson(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function buildTechnicalChecks({
  profile,
  declaredMimeType,
  bytes,
}: {
  profile: PhotoToolProfile;
  declaredMimeType: string;
  bytes: Uint8Array;
}): {
  checks: TechnicalCheckResult[];
  metadata: { mimeType: string; width: number; height: number } | null;
} {
  const metadata = sniffPhotoImageMetadata(bytes);
  const actualSizeMb = bytes.length / (1024 * 1024);

  const sizeStatus: TechnicalCheckResult["status"] =
    bytes.length <= profile.maxFileSizeBytes ? "pass" : "fail";
  const mimeMatches = profile.allowedMimeTypes.includes(declaredMimeType);
  const sniffedMatches = metadata ? profile.allowedMimeTypes.includes(metadata.mimeType) : false;
  const mimeStatus: TechnicalCheckResult["status"] =
    mimeMatches && sniffedMatches ? "pass" : "fail";

  const ratio = metadata ? metadata.width / metadata.height : 0;
  const aspectDelta = metadata ? ratioDelta(ratio, profile.expectedAspectRatio) : 1;
  const aspectStatus: TechnicalCheckResult["status"] =
    metadata && aspectDelta <= profile.aspectRatioTolerance ? "pass" : "fail";

  const dimensionsStatus: TechnicalCheckResult["status"] =
    metadata && metadata.width >= profile.minWidthPx && metadata.height >= profile.minHeightPx
      ? "pass"
      : "fail";

  const checks: TechnicalCheckResult[] = [
    {
      key: "file-type",
      label: "File type",
      status: mimeStatus,
      actual: `${mimeLabel(declaredMimeType)}${metadata ? ` (sniffed ${mimeLabel(metadata.mimeType)})` : ""}`,
      expected: `One of: ${profile.allowedMimeTypes.map(mimeLabel).join(", ")}`,
      detail: !mimeMatches
        ? "The file type is not supported for this photo checker."
        : !sniffedMatches
          ? "The file claims a supported type, but the image header does not match."
          : "The uploaded file declared a supported image type.",
      fix: "Upload a JPEG, PNG, or WebP photo exported directly from your camera or editing tool.",
    },
    {
      key: "file-size",
      label: "File size",
      status: sizeStatus,
      actual: `${actualSizeMb.toFixed(2)} MB`,
      expected: `At or below ${(profile.maxFileSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
      detail:
        bytes.length <= profile.maxFileSizeBytes
          ? "The file size is within the supported limit."
          : "The file is too large for a fast, reliable photo check.",
      fix: "Reduce the image size or export it at a lower quality before uploading again.",
    },
    {
      key: "dimensions",
      label: "Dimensions",
      status: dimensionsStatus,
      actual: metadata ? `${metadata.width} x ${metadata.height}px` : "Unreadable",
      expected: `At least ${profile.minWidthPx} x ${profile.minHeightPx}px`,
      detail: metadata
        ? "The pixel dimensions could be read successfully."
        : "The tool could not read image dimensions from the file.",
      fix: "Re-export the image as a standard JPEG, PNG, or WebP file and upload again.",
    },
    {
      key: "aspect-ratio",
      label: "Aspect ratio",
      status: aspectStatus,
      actual: metadata ? ratio.toFixed(3) : "Unreadable",
      expected: `About ${profile.expectedAspectRatio.toFixed(3)} ± ${(profile.aspectRatioTolerance * 100).toFixed(0)}%`,
      detail: metadata
        ? `The detected ratio is ${ratio.toFixed(3)}; the profile expects ${profile.expectedAspectRatio.toFixed(3)}.`
        : "The tool could not compute an aspect ratio.",
      fix:
        profile.slug === "us-visa-photo-requirements"
          ? "Crop or recapture as a square photo."
          : "Crop or recapture to the 35x45 photo ratio.",
    },
  ];

  return { checks, metadata };
}

function summarizeTechnicalResult(checks: TechnicalCheckResult[]) {
  if (checks.some((check) => check.status === "fail")) {
    return "fail" as const;
  }

  if (checks.some((check) => check.status === "warn")) {
    return "review" as const;
  }

  return "pass" as const;
}

function mapVisualStatus(status: unknown): VisualCheckResult["status"] {
  if (status === "pass" || status === "warn" || status === "fail" || status === "skipped") {
    return status;
  }

  return "warn";
}

async function analyzeWithOpenAI({
  profile,
  bytes,
  mimeType,
}: {
  profile: PhotoToolProfile;
  bytes: Uint8Array;
  mimeType: string;
}): Promise<{ checks: VisualCheckResult[]; source: "openai" | "fallback" }> {
  let client: OpenAI;
  try {
    client = getOpenAIClient();
  } catch {
    return {
      source: "fallback",
      checks: [
        {
          key: "vision-unavailable",
          label: "Visual review",
          status: "skipped",
          detail: "OpenAI visual analysis was unavailable, so only deterministic checks were run.",
          fix: "Re-run the checker once visual analysis is available for a deeper review.",
        },
      ],
    };
  }

  const dataUrl = toDataUrl(bytes, mimeType);
  const prompt = [
    `You are reviewing a visa application photo for ${profile.title}.`,
    "Return only valid JSON with this shape:",
    `{ "summary": string, "checks": [{ "key": string, "label": string, "status": "pass" | "warn" | "fail", "detail": string, "fix": string }] }`,
    "Focus on the following visual rules:",
    ...profile.visualFocus.map((item) => `- ${item}`),
    "Do not mention technical dimensions or file size. Only assess visual compliance visible in the image.",
    "Be concise but specific. If something cannot be verified visually, mark it as warn instead of fail.",
  ].join("\n");

  try {
    const response = await client.chat.completions.create(
      {
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this ${profile.countryCode} visa photo for compliance.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: dataUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
      },
      { signal: AbortSignal.timeout(PHOTO_ANALYSIS_TIMEOUT_MS) },
    );

    const content = response.choices[0]?.message?.content ?? "";
    const parsed = tryParseJson(content);
    const rawChecks =
      parsed && typeof parsed === "object" && Array.isArray((parsed as { checks?: unknown }).checks)
        ? ((parsed as { checks: unknown[] }).checks)
        : [];

    const checks: VisualCheckResult[] = rawChecks.length
      ? rawChecks
          .map((item, index) => {
            if (!item || typeof item !== "object") {
              return null;
            }

            const candidate = item as Record<string, unknown>;
            return {
              key: typeof candidate.key === "string" ? candidate.key : `visual-${index + 1}`,
              label: typeof candidate.label === "string" ? candidate.label : `Visual check ${index + 1}`,
              status: mapVisualStatus(candidate.status),
              detail: typeof candidate.detail === "string" ? candidate.detail : "No detail provided.",
              fix: typeof candidate.fix === "string" ? candidate.fix : "Review the photo and make a cleaner version.",
            } satisfies VisualCheckResult;
          })
          .filter((value): value is VisualCheckResult => Boolean(value))
      : [
          {
            key: "vision-response-empty",
            label: "Visual review",
            status: "skipped",
            detail: "OpenAI returned no structured visual findings.",
            fix: "Run the checker again or retake the photo for a cleaner analysis.",
          },
        ];

    return { source: "openai", checks };
  } catch {
    return {
      source: "fallback",
      checks: [
        {
          key: "vision-timeout",
          label: "Visual review",
          status: "skipped",
          detail: "OpenAI visual analysis timed out or failed, so the tool fell back to deterministic checks.",
          fix: "Re-run the checker after retaking or compressing the image.",
        },
      ],
    };
  }
}

function buildTopFixes({
  technicalChecks,
  visualChecks,
  profile,
}: {
  technicalChecks: TechnicalCheckResult[];
  visualChecks: VisualCheckResult[];
  profile: PhotoToolProfile;
}) {
  const fixes: string[] = [];

  for (const check of technicalChecks) {
    if (check.status === "fail") {
      fixes.push(check.fix);
    }
  }

  for (const check of visualChecks) {
    if (check.status === "fail" || check.status === "warn") {
      fixes.push(check.fix);
    }
  }

  if (!fixes.length) {
    fixes.push(
      profile.slug === "us-visa-photo-requirements"
        ? "Keep the image square, evenly lit, and centered before uploading to your visa application."
        : "Keep the image ratio close to 35x45 and make sure the face is centered with even lighting.",
    );
  }

  const uniqueFixes: string[] = [];
  const seenFixes = new Set<string>();

  for (const fix of fixes) {
    if (seenFixes.has(fix)) {
      continue;
    }

    seenFixes.add(fix);
    uniqueFixes.push(fix);

    if (uniqueFixes.length >= MAX_TECHNICAL_FIXES) {
      break;
    }
  }

  return uniqueFixes;
}

function buildGatedFullReport({
  profile,
  topFixes,
  technicalChecks,
  visualChecks,
}: {
  profile: PhotoToolProfile;
  topFixes: string[];
  technicalChecks: TechnicalCheckResult[];
  visualChecks: VisualCheckResult[];
}): GatedFullReport {
  const preview = [
    `Route: ${profile.title}`,
    `Technical checks: ${technicalChecks.filter((check) => check.status === "pass").length}/${technicalChecks.length} passed`,
    `Visual checks: ${visualChecks.filter((check) => check.status === "pass").length}/${visualChecks.length} passed`,
    `Top fix: ${topFixes[0] ?? "Review the photo carefully before uploading it."}`,
  ];

  return {
    state: "locked",
    preview,
    unlockLabel: "Unlock the full fix plan",
    unlockHref: profile.previewCTAPath,
  };
}

export async function analyzePhotoRequirements({
  profile,
  file,
}: {
  profile: PhotoToolProfile;
  file: File;
}): Promise<PhotoAnalysisResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { checks: technicalChecks, metadata } = buildTechnicalChecks({
    profile,
    declaredMimeType: file.type,
    bytes,
  });

  const technicalStatus = summarizeTechnicalResult(technicalChecks);
  const visual = await analyzeWithOpenAI({
    profile,
    bytes,
    mimeType: metadata?.mimeType ?? file.type,
  });

  const visualChecks = visual.checks;
  const hasVisualFailure = visualChecks.some((check) => check.status === "fail");
  const hasVisualWarnings = visualChecks.some((check) => check.status === "warn" || check.status === "skipped");

  const topFixes = buildTopFixes({
    technicalChecks,
    visualChecks,
    profile,
  });

  const gatedFullReport = buildGatedFullReport({
    profile,
    topFixes,
    technicalChecks,
    visualChecks,
  });

  const overallStatus =
    technicalStatus === "fail" || hasVisualFailure
      ? "fail"
      : hasVisualWarnings || visual.source === "fallback"
        ? "review"
        : "pass";

  return {
    slug: profile.slug,
    toolTitle: profile.title,
    overallStatus,
    technicalChecks,
    visualChecks,
    topFixes,
    gatedFullReport,
    analysisSource: visual.source,
  };
}
