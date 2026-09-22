import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  ApertureIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  Clock3Icon,
  CreditCardIcon,
  FileTextIcon,
  GiftIcon,
  LayoutListIcon,
  LockIcon,
  ScanTextIcon,
  UsersIcon,
  SendIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ReactCountryFlag from "react-country-flag";

import { getDB } from "@/db";
import {
  applicantTable,
  checklistItemTable,
  documentEvaluationTable,
  visaApplicationTable,
  CHECKLIST_ITEM_STATUS,
  PAYMENT_STATUS,
  VISA_APPLICATION_STATUS,
} from "@/db/schema";
import { PageHeader } from "@/components/page-header";
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
import { requireApplicationPagePermission } from "@/utils/application-page-auth";
import { getNextAction } from "./_workspace-types";
import { RISK_BADGE_COLORS } from "@/constants";
import {
  getWorkflowStepStates,
  getWorkflowStepStateLabel,
  type WorkflowStep,
  type WorkflowStepState,
} from "./_workspace-types";

const COUNTRY_CODES: Record<string, string> = {
  "United States": "US",
  "United Kingdom": "GB",
  Canada: "CA",
  Australia: "AU",
  Germany: "DE",
  France: "FR",
  Netherlands: "NL",
  Sweden: "SE",
  Denmark: "DK",
  Norway: "NO",
  Finland: "FI",
  Switzerland: "CH",
  Austria: "AT",
  Belgium: "BE",
  Ireland: "IE",
  "New Zealand": "NZ",
  Japan: "JP",
  Singapore: "SG",
  "South Korea": "KR",
  "EU / Schengen Area": "EU",
  Albania: "AL",
};

function CountryFlag({ country }: { country: string }) {
  const code = COUNTRY_CODES[country];
  if (!code) return <span className="text-sm">📄</span>;
  return (
    <ReactCountryFlag
      countryCode={code}
      svg
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "0",
        objectFit: "cover",
        display: "block",
      }}
      title={country}
    />
  );
}

function isUploadedStatus(status: string) {
  return (
    status === CHECKLIST_ITEM_STATUS.UPLOADED ||
    status === CHECKLIST_ITEM_STATUS.APPROVED
  );
}

function getStateClasses(state: WorkflowStepState) {
  if (state === "done") return "border-status-success/35 bg-status-success/12 text-status-success";
  if (state === "current") return "border-primary/45 bg-primary/12 text-primary ring-1 ring-primary/15";
  if (state === "ready") return "border-primary/30 bg-primary/7 text-foreground";
  if (state === "locked") return "border-border bg-muted/45 text-muted-foreground";
  return "border-border bg-muted/35 text-muted-foreground";
}

function getWorkflowIcon({
  step,
}: {
  step: WorkflowStep
}): LucideIcon {
  if (step === "checklist") return LayoutListIcon;
  if (step === "evaluation") return ScanTextIcon;
  return ApertureIcon;
}

interface OverviewMetaState {
  icon: LucideIcon
  label: string
  className: string
}

function getApplicationStatusMeta({
  status,
}: {
  status: string
}): OverviewMetaState {
  if (status === VISA_APPLICATION_STATUS.DRAFT) {
    return {
      icon: FileTextIcon,
      label: "Draft",
      className: "text-muted-foreground",
    };
  }
  if (status === VISA_APPLICATION_STATUS.IN_PROGRESS) {
    return {
      icon: Clock3Icon,
      label: "In progress",
      className: "text-muted-foreground",
    };
  }
  if (status === VISA_APPLICATION_STATUS.READY) {
    return {
      icon: CheckCircle2Icon,
      label: "Ready",
      className: "text-muted-foreground",
    };
  }
  if (status === VISA_APPLICATION_STATUS.SUBMITTED) {
    return {
      icon: SendIcon,
      label: "Submitted",
      className: "text-muted-foreground",
    };
  }
  return {
    icon: LayoutListIcon,
    label: status.replace("_", " "),
    className: "text-muted-foreground",
  };
}

function getBillingMeta({
  isFreeTrialApp,
}: {
  isFreeTrialApp: boolean
}): OverviewMetaState | null {
  if (isFreeTrialApp) {
    return {
      icon: GiftIcon,
      label: "Free trial",
      className: "text-muted-foreground",
    };
  }
  return null;
}

export async function ApplicationOverviewContent({
  appId,
}: {
  appId: string;
}) {
  await requireApplicationPagePermission(appId, "access_application");

  const db = getDB();

  const [app, applicants, checklistItems, latestEvaluation] = await Promise.all([
    db.query.visaApplicationTable.findFirst({
      where: eq(visaApplicationTable.id, appId),
    }),
    db.query.applicantTable.findMany({
      where: eq(applicantTable.applicationId, appId),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    }),
    db.query.checklistItemTable.findMany({
      where: eq(checklistItemTable.applicationId, appId),
      orderBy: (table, { asc }) => [asc(table.sortOrder)],
    }),
    db.query.documentEvaluationTable.findFirst({
      where: eq(documentEvaluationTable.applicationId, appId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    }),
  ]);

  if (!app || app.trashedAt) {
    notFound();
  }

  const requiredItems = checklistItems.filter((item) => item.isRequired);
  const uploadedRequired = requiredItems.filter((item) =>
    isUploadedStatus(item.status),
  ).length;
  const requiredCount = requiredItems.length;
  const missingRequiredCount = Math.max(requiredCount - uploadedRequired, 0);
  const completionPercent =
    requiredCount > 0 ? Math.round((uploadedRequired / requiredCount) * 100) : 0;

  const hasChecklist = checklistItems.length > 0;
  const hasEvaluation = Boolean(latestEvaluation);
  const isPaid = app.paymentStatus === PAYMENT_STATUS.PAID;
  const isTrialLocked = app.isFreeTrialApp && !isPaid;
  const primaryApplicant = applicants[0] ?? null;
  const statusMeta = getApplicationStatusMeta({ status: app.status });
  const billingMeta = getBillingMeta({
    isFreeTrialApp: app.isFreeTrialApp,
  });

  const nextAction = getNextAction({
    hasChecklist,
    missingRequiredCount,
    hasEvaluation,
    applicantName: primaryApplicant?.name ?? "this application",
    appId,
  });
  const nextActionCompactLabel = !hasChecklist
    ? "Generate Checklist"
    : missingRequiredCount > 0
      ? missingRequiredCount === 1
        ? "Upload 1 Doc"
        : `Upload ${missingRequiredCount} Docs`
      : !hasEvaluation
        ? "Run Evaluation"
        : isTrialLocked
          ? "Unlock Atlas"
          : "Open Atlas";
  const nextActionHint = !hasChecklist
    ? "Start here"
    : missingRequiredCount > 0
      ? `${missingRequiredCount} left`
      : !hasEvaluation
        ? "Ready to score"
        : isTrialLocked
          ? "Payment required"
          : "Ready";
  const workflowStates = getWorkflowStepStates({
    hasChecklist,
    missingRequiredCount,
    hasEvaluation,
    isTrialLocked,
  });

  const workflowSteps: Array<{
    step: WorkflowStep;
    label: string;
    href: string;
    summary: string;
  }> = [
    {
      step: "checklist",
      label: "Checklist",
      href: `/dashboard/${appId}/checklist`,
      summary: hasChecklist
        ? `${uploadedRequired}/${requiredCount} required uploaded`
        : "Set up your document list",
    },
    {
      step: "evaluation",
      label: "Evaluation",
      href: `/dashboard/${appId}/evaluation`,
      summary: hasEvaluation
        ? "Latest score available"
        : workflowStates.evaluation === "ready"
          ? "Ready to run"
          : "Waiting on required docs",
    },
    {
      step: "chat",
      label: "Atlas",
      href: `/dashboard/${appId}/atlas`,
      summary:
        workflowStates.chat === "locked"
          ? "Unlock after payment"
          : workflowStates.chat === "ready"
            ? "Ready for questions"
            : "Available after evaluation",
    },
  ];

  const evaluationLabel = latestEvaluation ? `${latestEvaluation.overallScore}/100 score` : "Not evaluated";
  const snapshotCards = [
    {
      label: "Completion",
      value: `${completionPercent}%`,
      detail: `${uploadedRequired}/${requiredCount} required uploaded`,
      icon: LayoutListIcon,
    },
    {
      label: "Missing required",
      value: `${missingRequiredCount}`,
      detail: missingRequiredCount === 0 ? "All required docs uploaded" : "Needs upload before evaluation",
      icon: LockIcon,
    },
    {
      label: "Evaluation",
      value: evaluationLabel,
      detail: latestEvaluation ? "Latest AI review available" : "Run first review when ready",
      icon: ScanTextIcon,
    },
    {
      label: "Applicants",
      value: `${applicants.length}`,
      detail: primaryApplicant ? `Primary: ${primaryApplicant.name}` : "No applicants yet",
      icon: UsersIcon,
    },
  ] as const;

  return (
    <>
      <PageHeader
        items={[
          { href: `/dashboard/${appId}`, label: "Application" },
          { href: `/dashboard/${appId}`, label: "Overview" },
        ]}
      />

      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
          <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-muted/35 p-5 md:p-6">
            <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
            <div className="pointer-events-none absolute -left-16 bottom-0 h-40 w-40 rounded-full bg-primary/5 blur-3xl" />
            <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Overview
                </p>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-none border bg-muted/20 md:h-11 md:w-[4.5rem]">
                    <CountryFlag country={app.destinationCountry} />
                  </span>
                  <h1 className="text-2xl font-semibold leading-[1.08] tracking-tight md:text-3xl">
                    {app.destinationCountry} {app.visaType} Application
                  </h1>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {app.homeCountry} → {app.currentCountry}
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className={`inline-flex items-center gap-1.5 px-1 py-1 ${statusMeta.className}`}>
                    <statusMeta.icon className="h-3.5 w-3.5" />
                    {statusMeta.label}
                  </span>
                  {billingMeta && (
                    <span className={`inline-flex items-center gap-1.5 px-1 py-1 ${billingMeta.className}`}>
                      <billingMeta.icon className="h-3.5 w-3.5" />
                      {billingMeta.label}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 px-1 py-1 text-muted-foreground">
                    <UsersIcon className="h-3.5 w-3.5" />
                    {applicants.length} applicant{applicants.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border bg-background/85 p-3 shadow-2xs">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Next step
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold tracking-tight">{nextActionCompactLabel}</p>
                  <Badge variant="outline" className="h-5 px-2 text-2xs font-medium capitalize">
                    {nextActionHint}
                  </Badge>
                </div>
                <div className="mt-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Required</span>
                    <span className="tabular-nums text-muted-foreground">{uploadedRequired}/{requiredCount}</span>
                  </div>
                  <Progress value={completionPercent} className="h-1.5" />
                </div>
                <Button asChild size="sm" className="mt-2.5 h-9 w-full gap-1.5">
                  <Link href={(nextAction.href ?? `/dashboard/${appId}/${nextAction.step}`) as never}>
                    {nextActionCompactLabel}
                    <ArrowRightIcon className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {snapshotCards.map(({ label, value, detail, icon: Icon }) => (
              <Card key={label} className="shadow-2xs">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-base font-semibold tracking-tight">{value}</p>
                    </div>
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-muted/35">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <div className="grid gap-3 xl:grid-cols-4">
            <Card className="shadow-xs xl:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle>Applicants</CardTitle>
                <CardDescription>
                  Everyone included in this visa application.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {applicants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No applicants yet.</p>
                ) : (
                  applicants.map((applicant) => (
                    <div
                      key={applicant.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{applicant.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {applicant.relationship}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {applicant.riskLevel && applicant.readinessScore !== null ? (
                          <Badge
                            variant="outline"
                            className={`tabular-nums ${RISK_BADGE_COLORS[applicant.riskLevel] ?? ""}`}
                          >
                            {applicant.readinessScore}/100
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            No score
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}

                <Button asChild variant="outline" className="w-full">
                  <Link href={`/dashboard/${appId}/members` as never}>
                    Manage Applicants
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="shadow-xs xl:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle>Workflow map</CardTitle>
                <CardDescription>
                  Follow the sequence and open the exact step you need.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workflowSteps.map(({ step, label, href, summary }) => {
                  const Icon = getWorkflowIcon({ step });
                  return (
                    <Link
                      key={step}
                      href={href as never}
                      className={`ui-feedback flex items-start gap-3 rounded-lg border p-4 transition-[background-color,color,border-color,box-shadow] hover:bg-muted/40 hover:shadow-2xs ${getStateClasses(workflowStates[step])}`}
                    >
                      <div className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-md border border-current/20 bg-background/70">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold tracking-tight">{label}</p>
                          <span className="text-xs font-semibold uppercase tracking-[0.08em]">
                            {getWorkflowStepStateLabel(workflowStates[step])}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">{summary}</p>
                      </div>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {!isPaid && (
            <Card className="shadow-xs border-primary/30 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  {app.isFreeTrialApp ? (
                    <LockIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <CreditCardIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  )}
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">
                      {app.isFreeTrialApp
                        ? "Free trial limits apply"
                        : "Complete checkout to unlock the workspace"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {app.isFreeTrialApp
                        ? "You can generate the checklist and use one evaluation. Atlas and repeat evaluations unlock after payment."
                        : "This application is still unpaid. Checkout unlocks the full checklist, evaluations, and Atlas workflow."}
                    </p>
                    <Button asChild size="sm">
                      <Link href={`/dashboard/${appId}/checkout` as never}>
                        {app.isFreeTrialApp ? "Unlock Full Analysis" : "Go to Checkout"}
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
