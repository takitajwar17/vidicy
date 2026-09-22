"use client";

import type { Route } from "next";
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertTriangle, CircleCheckBig, FileImage, Lock } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { REDIRECT_AFTER_SIGN_IN } from "@/constants";
import { cn } from "@/lib/utils";
import { getAuthRouteHref } from "@/utils/auth-redirect";
import type { ToolDefinition } from "../_content";

interface PhotoCheckItem {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail" | "skipped";
  detail: string;
  fix: string;
}

interface PhotoAnalysisResponse {
  overallStatus?: "pass" | "review" | "fail" | string;
  technicalChecks?: PhotoCheckItem[];
  visualChecks?: PhotoCheckItem[];
  topFixes?: string[];
  gatedFullReport?:
    | {
        state?: "locked" | "preview";
        preview?: string[];
        unlockHref?: string;
        unlockLabel?: string;
      }
    | null;
  analysisSource?: "openai" | "fallback" | string;
  error?: string;
}

function getOverallLabel(status: string | undefined) {
  switch (status) {
    case "pass":
      return "Ready";
    case "review":
      return "Needs review";
    case "fail":
      return "Not ready";
    default:
      return "Pending";
  }
}

function getOverallTone(status: string | undefined) {
  switch (status) {
    case "pass":
      return "text-status-success";
    case "review":
      return "text-status-warning";
    case "fail":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function getOverallSurfaceTone(status: string | undefined) {
  switch (status) {
    case "pass":
      return "border-status-success/30 bg-status-success/5";
    case "review":
      return "border-status-warning/30 bg-status-warning/5";
    case "fail":
      return "border-destructive/30 bg-destructive/5";
    default:
      return "border-border bg-muted/20";
  }
}

function getCheckIconTone(status: PhotoCheckItem["status"]) {
  if (status === "pass") {
    return "text-status-success";
  }

  if (status === "fail") {
    return "text-destructive";
  }

  return "text-status-warning";
}

function CheckRow({ item }: { item: PhotoCheckItem }) {
  const Icon = item.status === "pass" ? CircleCheckBig : AlertTriangle;

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", getCheckIconTone(item.status))} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{item.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
        </div>
      </div>
    </div>
  );
}

function countByStatus(checks: PhotoCheckItem[]) {
  return {
    pass: checks.filter((check) => check.status === "pass").length,
    needsFix: checks.filter((check) => check.status === "fail" || check.status === "warn").length,
    skipped: checks.filter((check) => check.status === "skipped").length,
  };
}

export function PhotoToolClient({ tool }: { tool: ToolDefinition }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [response, setResponse] = useState<PhotoAnalysisResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const technicalChecks = response?.technicalChecks ?? [];
  const visualChecks = response?.visualChecks ?? [];
  const allChecks = [...technicalChecks, ...visualChecks];
  const checkCounts = countByStatus(allChecks);

  const totalChecks = allChecks.length;
  const completedChecks = checkCounts.pass + checkCounts.needsFix;
  const hasResponse = Boolean(response);

  const technicalPassed = technicalChecks.filter((item) => item.status === "pass").length;
  const visualPassed = visualChecks.filter((item) => item.status === "pass").length;
  const failedOrWarnChecks = allChecks.filter(
    (item) => item.status === "fail" || item.status === "warn",
  );

  const defaultUnlockHref = getAuthRouteHref("/sign-up", REDIRECT_AFTER_SIGN_IN) as Route;
  const unlockHref = (response?.gatedFullReport?.unlockHref ?? defaultUnlockHref) as Route;
  const unlockLabel = response?.gatedFullReport?.unlockLabel ?? tool.secondaryCta;

  const previewLabel = useMemo(() => {
    if (!selectedFile) {
      return "No file selected";
    }

    return selectedFile.name;
  }, [selectedFile]);

  const priorityFixes = useMemo(() => {
    const fixCandidates = response?.topFixes?.length
      ? response.topFixes
      : failedOrWarnChecks.map((item) => item.fix);
    return Array.from(new Set(fixCandidates.filter(Boolean))).slice(0, 4);
  }, [failedOrWarnChecks, response?.topFixes]);

  function resetState() {
    setErrorMessage(null);
    setResponse(null);
    setShowDetails(false);
  }

  function clearSelection() {
    setSelectedFile(null);
    resetState();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    resetState();

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!file) {
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setResponse(null);

    if (!selectedFile) {
      setErrorMessage("Choose a photo first.");
      return;
    }

    if (selectedFile.size > tool.maxFileSizeMb * 1024 * 1024) {
      setErrorMessage(`The photo must be under ${tool.maxFileSizeMb} MB.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("slug", tool.slug);
      formData.append("file", selectedFile);

      const res = await fetch("/api/tools/photo-requirements/analyze", {
        method: "POST",
        body: formData,
      });

      const data = (await res.json()) as PhotoAnalysisResponse;

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong while checking the photo.");
      }

      setResponse(data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unable to analyze the photo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="shadow-xs lg:min-h-0">
      <CardHeader className="pb-2">
        <CardTitle>{hasResponse ? "Result Summary" : "Photo Checker"}</CardTitle>
        <CardDescription>
          {hasResponse
            ? "Your latest analysis is ready. Fix the highlighted items first."
            : "Upload once and get a clear pass or fix result."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {!hasResponse ? (
          <div className="flex flex-wrap gap-2">
            {tool.quickFacts.map((fact) => (
              <div key={fact.label} className="rounded-full border bg-background px-3 py-1.5 text-xs">
                <span className="text-muted-foreground">{fact.label}: </span>
                <span className="font-medium text-foreground">{fact.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-3">
            {hasResponse ? (
              <>
                <div className={cn("rounded-xl border p-4", getOverallSurfaceTone(response?.overallStatus))}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={cn("text-base font-semibold", getOverallTone(response?.overallStatus))}>
                      {getOverallLabel(response?.overallStatus)}
                    </p>
                    <span className="text-xs text-muted-foreground">Result ready</span>
                  </div>

                  <div className="mt-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Checks completed</span>
                      <span className="tabular-nums text-muted-foreground">
                        {completedChecks}/{totalChecks || 0}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-lg border bg-background p-2.5">
                      <p className="text-xs text-muted-foreground">Pass</p>
                      <p className="mt-1 text-sm font-medium">{checkCounts.pass}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-2.5">
                      <p className="text-xs text-muted-foreground">Needs fix</p>
                      <p className="mt-1 text-sm font-medium">{checkCounts.needsFix}</p>
                    </div>
                    <div className="rounded-lg border bg-background p-2.5">
                      <p className="text-xs text-muted-foreground">Skipped</p>
                      <p className="mt-1 text-sm font-medium">{checkCounts.skipped}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-background p-4">
                  <p className="text-sm font-medium text-foreground">Fix these first</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    {priorityFixes.length ? (
                      priorityFixes.map((fix) => (
                        <li key={fix} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{fix}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-status-success">No critical fixes detected in this run.</li>
                    )}
                  </ul>
                </div>

                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <Lock className="h-4 w-4" />
                    Full report
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground">{tool.gateCopy}</p>
                  <Button asChild size="lg" className="mt-3 w-full sm:w-auto">
                    <Link href={unlockHref}>{unlockLabel}</Link>
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setShowDetails((prev) => !prev)}
                >
                  {showDetails ? "Hide details" : "View details"}
                </Button>
              </>
            ) : (
              <div className="rounded-xl border bg-background/75 px-4 py-3">
                <p className="text-sm font-medium text-foreground">Quick check</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a photo to get instant readiness feedback.
                </p>
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-dashed border-primary/30 bg-background/85 p-4"
          >
            <p className="text-sm text-muted-foreground">Drop a photo here or choose a file.</p>
            <input
              id={`photo-${tool.slug}`}
              ref={fileInputRef}
              type="file"
              accept={tool.supportedFileTypes.join(",")}
              onChange={handleFileChange}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              className="mt-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileImage className="h-4 w-4" />
              {hasResponse ? "Choose Another Photo" : "Choose Photo"}
            </Button>
            <p className="mt-1.5 truncate text-xs text-muted-foreground">{previewLabel}</p>

            {previewUrl ? (
              <div className="mt-2 overflow-hidden rounded-lg border bg-muted/20 p-2">
                <Image
                  src={previewUrl}
                  alt="Uploaded photo"
                  width={768}
                  height={512}
                  unoptimized
                  className="mx-auto h-auto max-h-[140px] w-auto max-w-full object-contain"
                />
              </div>
            ) : (
              <div className="mt-2 rounded-lg border bg-muted/20 p-2.5 text-xs text-muted-foreground">
                Photo preview appears here.
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? "Checking..." : hasResponse ? "Check Again" : tool.primaryCta}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Photo is processed for this check and not kept as a saved upload.
            </p>
          </form>
        </div>

        {response && showDetails ? (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="more-details" className="rounded-lg border px-3">
              <AccordionTrigger className="py-3 text-sm font-medium hover:no-underline">
                More details
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pb-2">
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Format checks</p>
                      <p className="text-xs text-muted-foreground">
                        {technicalPassed}/{technicalChecks.length} passed
                      </p>
                    </div>
                    {technicalChecks.length ? (
                      technicalChecks.map((item) => <CheckRow key={item.key} item={item} />)
                    ) : (
                      <p className="text-sm text-muted-foreground">No checks returned yet.</p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Photo quality checks</p>
                      <p className="text-xs text-muted-foreground">
                        {visualPassed}/{visualChecks.length} passed
                      </p>
                    </div>
                    {visualChecks.length ? (
                      visualChecks.map((item) => <CheckRow key={item.key} item={item} />)
                    ) : (
                      <p className="text-sm text-muted-foreground">No checks returned yet.</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-sm font-medium text-foreground">Required format</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                      {tool.fileRequirements.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-sm font-medium text-foreground">Official sources</p>
                    <ul className="mt-2 space-y-2">
                      {tool.officialSources.map((src) => (
                        <li key={src.href}>
                          <a
                            href={src.href}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                          >
                            {src.label}
                          </a>
                          <p className="text-xs text-muted-foreground">{src.note}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="text-sm font-medium text-foreground">Needs attention</p>
                  {failedOrWarnChecks.length ? (
                    <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                      {failedOrWarnChecks.map((item) => (
                        <li key={`${item.key}-fix`} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span>{item.fix}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-sm text-status-success">No failed checks in this run.</p>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
      </CardContent>
    </Card>
  );
}
