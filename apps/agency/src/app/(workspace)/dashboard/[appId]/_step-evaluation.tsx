import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EvaluationTrigger } from "@/components/visa/evaluation-trigger";
import {
  CheckCircle2Icon,
  AlertTriangleIcon,
  AlertCircleIcon,
  LayoutListIcon,
  ShieldCheckIcon,
  LockIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { RISK_BG_COLORS } from "@/constants";
import type {
  ChecklistItem,
  DocumentEvaluation,
} from "@/db/schema";
import type { ExpiringDoc } from "./_workspace-types";

function getRiskBadgeClass({
  riskLevel,
}: {
  riskLevel?: string | null;
}): string {
  if (riskLevel === "low")
    return "bg-status-success/10 text-status-success border-status-success/20";
  if (riskLevel === "medium")
    return "bg-status-warning/10 text-status-warning border-status-warning/20";
  return "bg-destructive/10 text-destructive border-destructive/20";
}

interface EvaluationStepProps {
  appId: string;
  selectedApplicant: { id: string; name: string };
  checklistItems: ChecklistItem[];
  uploadedDocsCount: number;
  latestEval: DocumentEvaluation | null;
  expiringDocs: ExpiringDoc[];
  isEvalLocked?: boolean;
}

export function EvaluationStep({
  appId,
  selectedApplicant,
  checklistItems,
  uploadedDocsCount,
  latestEval,
  expiringDocs,
  isEvalLocked,
}: EvaluationStepProps) {
  if (checklistItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 py-16 px-4 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/25 bg-primary/10">
          <div className="absolute inset-0 bg-primary blur-2xl rounded-full opacity-15 scale-150" />
          <LayoutListIcon className="h-10 w-10 text-primary relative z-10" />
        </div>
        <div className="space-y-2 max-w-sm">
          <p className="text-lg font-semibold">Generate your checklist first</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Before running an evaluation, you need a document checklist tailored
            to your visa type and embassy.
          </p>
        </div>
        <Button
          asChild
          className="shadow-sm"
        >
          <Link href={`/dashboard/${appId}/checklist` as Route}>
            <LayoutListIcon className="h-4 w-4" />
            Go to Checklist
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {expiringDocs.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-status-warning/35 bg-status-warning/12 px-4 py-3">
          <AlertTriangleIcon className="h-4 w-4 text-status-warning mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-status-warning">
              {expiringDocs.length === 1
                ? "Document expiring soon"
                : `${expiringDocs.length} documents expiring soon`}
            </p>
            <ul className="space-y-0.5">
              {expiringDocs.map((d) => (
                <li
                  key={d.documentName}
                  className="text-xs text-muted-foreground"
                >
                  <span className="font-medium text-foreground">
                    {d.documentName}
                  </span>
                  {d.daysUntilExpiry < 0 ? (
                    <span className="text-destructive font-medium">
                      {" "}
                      — expired {Math.abs(d.daysUntilExpiry)} day
                      {Math.abs(d.daysUntilExpiry) !== 1 ? "s" : ""} ago
                    </span>
                  ) : d.daysUntilExpiry === 0 ? (
                    <span className="text-destructive font-medium">
                      {" "}
                      — expires today
                    </span>
                  ) : (
                    <span>
                      {" "}
                      — expires in{" "}
                      <span className="font-medium">
                        {d.daysUntilExpiry} day
                        {d.daysUntilExpiry !== 1 ? "s" : ""}
                      </span>{" "}
                      ({d.expiryDate})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!latestEval ? (
        <Card className="relative overflow-hidden border-dashed">
          <div
            className="absolute inset-0 opacity-[0.02] pointer-events-none"
            aria-hidden="true"
          >
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <pattern
                id="eval-dots"
                width="30"
                height="30"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="15" cy="15" r="1" fill="currentColor" />
              </pattern>
              <rect width="100%" height="100%" fill="url(#eval-dots)" />
            </svg>
          </div>
          <CardContent className="py-16 flex flex-col items-center text-center gap-5 relative z-10">
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
              <div className="absolute inset-0 rounded-2xl border border-primary/25" />
              <div className="absolute inset-0 bg-primary blur-2xl rounded-full opacity-15 scale-150" />
              <ShieldCheckIcon className="h-10 w-10 text-primary relative z-10" />
            </div>
            <div className="space-y-2 max-w-sm">
              <p className="text-lg font-semibold">
                {uploadedDocsCount > 0
                  ? `No evaluation for ${selectedApplicant.name} yet`
                  : `No documents uploaded for ${selectedApplicant.name} yet`}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {uploadedDocsCount > 0
                  ? "Run the first AI evaluation to get a readiness score, risk factors, and concrete recommendations."
                  : "Upload at least one document first. As soon as the file has something to review, you can run the first AI evaluation."}
              </p>
            </div>
            <EvaluationTrigger
              applicationId={appId}
              applicantId={selectedApplicant.id}
              hasDocuments={uploadedDocsCount > 0}
              checklistHref={`/dashboard/${appId}/checklist` as Route}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card
            className={`relative overflow-hidden border ${RISK_BG_COLORS[latestEval.riskLevel] ?? RISK_BG_COLORS.high}`}
          >
            <div
              className={`absolute left-0 top-0 h-full w-1 ${
                latestEval.riskLevel === "low"
                  ? "bg-status-success/70"
                  : latestEval.riskLevel === "medium"
                    ? "bg-status-warning/70"
                    : "bg-destructive/70"
              }`}
            />
            <CardContent className="pt-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div>
                  <p className="text-3xl sm:text-4xl font-semibold tabular-nums">
                    {latestEval.overallScore}/100
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedApplicant.name} — Readiness Score
                  </p>
                  {latestEval.scoreConfidence && (
                    <div className="mt-2">
                      {latestEval.scoreConfidence === "high" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
                          <CheckCircle2Icon className="h-3.5 w-3.5" />
                          Score confirmed by second evaluation
                        </span>
                      )}
                      {latestEval.scoreConfidence === "moderate" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-status-warning">
                          <AlertTriangleIcon className="h-3.5 w-3.5" />
                          Borderline — treat score with some caution
                        </span>
                      )}
                      {latestEval.scoreConfidence === "low" && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                          <AlertCircleIcon className="h-3.5 w-3.5" />
                          Conflicting evaluations — score is uncertain
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`self-start px-3 py-1 text-sm capitalize normal-case tracking-normal ${getRiskBadgeClass({ riskLevel: latestEval.riskLevel })}`}
                >
                  {latestEval.riskLevel} risk
                </Badge>
              </div>
              <Progress value={latestEval.overallScore} className="h-2 mb-4" />
              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    State
                  </p>
                  <p className="mt-1 text-sm font-medium capitalize">
                    {latestEval.riskLevel} risk
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Last run
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {new Date(latestEval.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Re-runs
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {isEvalLocked ? "Locked" : "Available"}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {latestEval.summary}
              </p>
              <div className="mt-4 pt-4 border-t flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Last evaluated{" "}
                  {new Date(latestEval.createdAt).toLocaleString()}
                </p>
                {isEvalLocked ? (
                  <Button variant="outline" size="sm" disabled className="gap-2 opacity-60">
                    <LockIcon className="h-4 w-4" />
                    Re-run Locked
                  </Button>
                ) : (
                  <EvaluationTrigger
                    applicationId={appId}
                    applicantId={selectedApplicant.id}
                    hasDocuments={uploadedDocsCount > 0}
                    rerun
                  />
                )}
              </div>
            </CardContent>
          </Card>

          {isEvalLocked && (
            <Card className="border-primary/30 bg-primary/8">
              <CardContent className="py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <SparklesIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold">Unlock full analysis</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Get unlimited re-evaluations, iterate on your documents, and chat with Atlas AI to strengthen your application.
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" className="shrink-0">
                    <Link href={`/dashboard/${appId}/checkout` as Route}>
                      Upgrade Now
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {latestEval.redFlags.length > 0 && (
              <Card>
                {/* pb-3 for consistent CardHeader rhythm */}
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-destructive flex items-center gap-2">
                    <AlertCircleIcon className="h-4 w-4" />
                    Risk Factors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Bullet style matches Strengths — both use the same dash marker */}
                  <ul className="space-y-2">
                    {latestEval.redFlags.map((flag, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-destructive shrink-0 mt-0.5">
                          –
                        </span>
                        <span className="leading-6">{flag}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {latestEval.strengths.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-primary flex items-center gap-2">
                    <CheckCircle2Icon className="h-4 w-4" />
                    Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Consistent dash marker with Risk Factors — avoids mixed ✓ vs • symbols */}
                  <ul className="space-y-2">
                    {latestEval.strengths.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-primary shrink-0 mt-0.5">–</span>
                        <span className="leading-6">{s}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>

          {latestEval.recommendations.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recommendations</CardTitle>
                <CardDescription>
                  Action items to improve {selectedApplicant.name}&apos;s
                  application
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/*
                 * Numbered list retains order semantics (priority matters here)
                 * but uses flex layout to match Risk Factors and Strengths item alignment
                 */}
                <ol className="space-y-2">
                  {latestEval.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-muted-foreground shrink-0 tabular-nums mt-0.5">
                        {i + 1}.
                      </span>
                      <span className="leading-6">{rec}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          {/* Foreign language documents — shown when the AI detected non-English text.
              On next re-run the document will be pre-translated before evaluation. */}
          {latestEval.itemFeedback &&
            Object.values(latestEval.itemFeedback).some(
              (fb) =>
                fb.extractedFields?.language &&
                fb.extractedFields.language !== "en" &&
                fb.extractedFields.language !== "unknown",
            ) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertCircleIcon className="h-4 w-4 text-muted-foreground" />
                    Foreign Language Documents
                  </CardTitle>
                  <CardDescription>
                    These documents were not in English. The AI evaluated them
                    directly; re-running will pre-translate them for higher
                    accuracy.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {Object.entries(latestEval.itemFeedback)
                      .filter(
                        ([, fb]) =>
                          fb.extractedFields?.language &&
                          fb.extractedFields.language !== "en" &&
                          fb.extractedFields.language !== "unknown",
                      )
                      .map(([id, fb]) => {
                        const item = checklistItems.find((i) => i.id === id);
                        return (
                          <li
                            key={id}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="text-muted-foreground shrink-0 mt-0.5">
                              –
                            </span>
                            <span className="font-medium">
                              {item?.documentName ?? id}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-xs font-mono uppercase"
                            >
                              {fb.extractedFields?.language}
                            </Badge>
                          </li>
                        );
                      })}
                  </ul>
                </CardContent>
              </Card>
            )}

          {/* Limited visibility warning — shown when any document had low AI confidence,
              typically because it was a scanned image or encrypted PDF with no text. */}
          {latestEval.itemFeedback &&
            Object.values(latestEval.itemFeedback).some(
              (fb) => (fb.confidence ?? 100) < 50,
            ) && (
              <Card className="border-status-warning/35 bg-status-warning/12">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-status-warning flex items-center gap-2">
                    <AlertTriangleIcon className="h-4 w-4" />
                    Limited AI Visibility
                  </CardTitle>
                  <CardDescription>
                    The AI could not fully read the documents below. Scores for
                    these items may be less accurate. Re-uploading as
                    machine-readable PDFs will improve evaluation quality.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {Object.entries(latestEval.itemFeedback)
                      .filter(([, fb]) => (fb.confidence ?? 100) < 50)
                      .map(([id, fb]) => {
                        const item = checklistItems.find((i) => i.id === id);
                        return (
                          <li key={id} className="flex gap-2 text-sm">
                            <span className="text-status-warning shrink-0 mt-0.5">
                              –
                            </span>
                            <span>
                              <span className="font-medium">
                                {item?.documentName ?? id}
                              </span>
                              {fb.confidenceReason && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  — {fb.confidenceReason}
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                  </ul>
                </CardContent>
              </Card>
            )}
        </>
      )}
    </div>
  );
}
