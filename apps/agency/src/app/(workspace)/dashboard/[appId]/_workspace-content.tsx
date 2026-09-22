import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { getUserFromDB } from "@/utils/auth"
import { getDB } from "@/db"
import {
  visaApplicationTable,
  applicantTable,
  checklistItemTable,
  uploadedDocumentTable,
  documentEvaluationTable,
  APPLICATION_PERMISSIONS,
  CHECKLIST_ITEM_STATUS,
  APPLICANT_RELATIONSHIP,
  PAYMENT_STATUS,
} from "@/db/schema"
import { eq, and, asc, desc, count } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ApplicantSwitcher } from "@/components/visa/applicant-switcher"
import {
  Settings2Icon,
} from "lucide-react"
import { RISK_TEXT_COLORS } from "@/constants"
import {
  WORKFLOW_STEPS,
  STEP_META,
  STEP_CARDS,
  getNextAction,
  getWorkflowStepStates,
  getWorkflowStepStateLabel,
  type WorkflowStep,
  type WorkflowStepState,
  type ExpiringDoc,
} from "./_workspace-types"
import { buildPrimaryApplicantRepairValues } from "./_workspace-applicant-repair"
import { ChecklistStep } from "./_step-checklist"
import { EvaluationStep } from "./_step-evaluation"
import { isEvalLocked } from "@/utils/application-auth"
import { requireApplicationPagePermission } from "@/utils/application-page-auth"

type WorkspaceUploadedDocument = {
  id: string
  checklistItemId: string | null
  fileName: string
  fileSize: number
  mimeType: string
  extractionStatus: string
  indexingStatus: string
  extractionMethod: string | null
  extractedAt: Date | null
  indexingAttemptedAt: Date | null
  pageCount: number | null
  imageDescription: string | null
  uploadedAt: Date
}

function getWorkflowStateClasses(state: WorkflowStepState) {
  if (state === "done") {
    return "border-status-success/35 bg-status-success/12 text-status-success"
  }
  if (state === "current") {
    return "border-primary/45 bg-primary/12 text-primary shadow-xs ring-1 ring-primary/15"
  }
  if (state === "ready") {
    return "border-primary/30 bg-primary/7 text-foreground"
  }
  if (state === "locked") {
    return "border-border bg-muted/50 text-muted-foreground opacity-80"
  }
  return "border-border bg-muted/35 text-muted-foreground"
}

export async function WorkspaceContent({
  appId,
  step: stepParam,
  applicantId: applicantParam,
}: {
  appId: string
  step?: string
  applicantId?: string
}) {
  const db = getDB()
  const session = await requireApplicationPagePermission(appId, APPLICATION_PERMISSIONS.ACCESS_APPLICATION)

  const [app] = await db
    .select()
    .from(visaApplicationTable)
    .where(eq(visaApplicationTable.id, appId))

  if (!app || app.trashedAt) notFound()

  // Payment gate — redirect to checkout if the application hasn't been paid for
  // Free trial apps skip this gate (they get free checklist + one evaluation)
  if (app.paymentStatus !== PAYMENT_STATUS.PAID && !app.isFreeTrialApp) {
    redirect(`/dashboard/${appId}/checkout`)
  }

  // Parse checklist research metadata from application settings
  let checklistSettings: { checklistResearchSource?: string; checklistGeneratedAt?: number; checklistCitations?: string[] } = {}
  if (app.settings) {
    try { checklistSettings = JSON.parse(app.settings) as typeof checklistSettings } catch { /* ignore */ }
  }
  const researchSource = checklistSettings.checklistResearchSource
  const researchGeneratedAt = checklistSettings.checklistGeneratedAt
  const researchCitations = checklistSettings.checklistCitations ?? []

  // Fetch all applicants for the switcher
  const applicants = await db
    .select()
    .from(applicantTable)
    .where(eq(applicantTable.applicationId, appId))
    .orderBy(asc(applicantTable.createdAt))

  // Resolve selected applicant — default to primary (first created).
  // If the application has no applicants at all (can happen if the applicant insert
  // failed at creation time due to D1 not supporting transactions), auto-create the
  // primary applicant from the application owner so the workspace is never permanently broken.
  let resolvedApplicants = applicants
  if (resolvedApplicants.length === 0) {
    const ownerUser = app.userId === session.userId
      ? session.user
      : await getUserFromDB(app.userId)
    const [created] = await db
      .insert(applicantTable)
      .values(buildPrimaryApplicantRepairValues({
        applicationId: appId,
        nationality: app.homeCountry,
        ownerUser,
        ownerUserId: app.userId,
      }))
      .returning()
    if (created) resolvedApplicants = [created]
  }

  const primaryApplicant = resolvedApplicants.find((a) => a.relationship === APPLICANT_RELATIONSHIP.PRIMARY) ?? resolvedApplicants[0]
  const selectedApplicant = applicantParam
    ? (resolvedApplicants.find((a) => a.id === applicantParam) ?? primaryApplicant)
    : primaryApplicant

  if (!selectedApplicant) notFound()

  // Fetch lightweight baseline data first; defer heavy step-specific reads until we
  // know which route step is being rendered.
  const [checklistItems, latestEvalSummaryArr] = await Promise.all([
    db
      .select()
      .from(checklistItemTable)
      .where(and(
        eq(checklistItemTable.applicationId, appId),
        eq(checklistItemTable.applicantId, selectedApplicant.id),
      ))
      .orderBy(asc(checklistItemTable.sortOrder)),
    db
      .select({
        id: documentEvaluationTable.id,
        overallScore: documentEvaluationTable.overallScore,
        createdAt: documentEvaluationTable.createdAt,
      })
      .from(documentEvaluationTable)
      .where(and(
        eq(documentEvaluationTable.applicationId, appId),
        eq(documentEvaluationTable.applicantId, selectedApplicant.id),
      ))
      .orderBy(desc(documentEvaluationTable.createdAt))
      .limit(1),
  ])

  const latestEvalSummary = latestEvalSummaryArr[0] ?? null

  const uploadedCount = checklistItems.filter(
    (i) => i.status === CHECKLIST_ITEM_STATUS.UPLOADED || i.status === CHECKLIST_ITEM_STATUS.APPROVED
  ).length
  const requiredCount = checklistItems.filter((i) => i.isRequired).length
  const missingRequiredCount = Math.max(requiredCount - uploadedCount, 0)
  const completionPercent = requiredCount > 0 ? Math.round((uploadedCount / requiredCount) * 100) : 0
  const requiredItems = checklistItems.filter((item) => item.isRequired)
  const optionalItems = checklistItems.filter((item) => !item.isRequired)
  const hasChecklist = checklistItems.length > 0
  const hasEvaluation = Boolean(latestEvalSummary)

  const allRequiredUploaded = requiredCount > 0 && missingRequiredCount === 0
  // Free trial apps cannot access Atlas — cap at evaluation step
  const isTrialLocked = app.isFreeTrialApp && app.paymentStatus !== PAYMENT_STATUS.PAID
  const defaultStep: WorkflowStep = !hasChecklist
    ? "checklist"
    : !allRequiredUploaded
    ? "checklist"
    : !hasEvaluation
    ? "evaluation"
    : isTrialLocked
    ? "evaluation"
    : "chat"
  const requestedStep = WORKFLOW_STEPS.includes(stepParam as WorkflowStep)
    ? (stepParam as WorkflowStep)
    : defaultStep
  const currentStep = requestedStep
  const currentStepMeta = STEP_META[currentStep]
  const currentStepIndex = WORKFLOW_STEPS.indexOf(currentStep)
  const previousStep = currentStepIndex > 0 ? WORKFLOW_STEPS[currentStepIndex - 1] : null
  const nextStep = currentStepIndex < WORKFLOW_STEPS.length - 1 ? WORKFLOW_STEPS[currentStepIndex + 1] : null
  const nextAction = getNextAction({
    hasChecklist,
    missingRequiredCount,
    hasEvaluation,
    applicantName: selectedApplicant.name,
    appId,
  })
  const workflowStates = getWorkflowStepStates({
    currentStep,
    hasChecklist,
    missingRequiredCount,
    hasEvaluation,
    isTrialLocked,
  })

  let uploadedDocs: WorkspaceUploadedDocument[] = []
  let uploadedDocsCount = 0

  if (currentStep === "checklist") {
    uploadedDocs = await db
      .select({
        id: uploadedDocumentTable.id,
        checklistItemId: uploadedDocumentTable.checklistItemId,
        fileName: uploadedDocumentTable.fileName,
        fileSize: uploadedDocumentTable.fileSize,
        mimeType: uploadedDocumentTable.mimeType,
        extractionStatus: uploadedDocumentTable.extractionStatus,
        indexingStatus: uploadedDocumentTable.indexingStatus,
        extractionMethod: uploadedDocumentTable.extractionMethod,
        extractedAt: uploadedDocumentTable.extractedAt,
        indexingAttemptedAt: uploadedDocumentTable.indexingAttemptedAt,
        pageCount: uploadedDocumentTable.pageCount,
        imageDescription: uploadedDocumentTable.imageDescription,
        uploadedAt: uploadedDocumentTable.uploadedAt,
      })
      .from(uploadedDocumentTable)
      .where(and(
        eq(uploadedDocumentTable.applicationId, appId),
        eq(uploadedDocumentTable.applicantId, selectedApplicant.id),
      ))
      .orderBy(desc(uploadedDocumentTable.uploadedAt))

    uploadedDocsCount = uploadedDocs.length
  } else {
    const [docCount] = await db
      .select({ total: count() })
      .from(uploadedDocumentTable)
      .where(and(
        eq(uploadedDocumentTable.applicationId, appId),
        eq(uploadedDocumentTable.applicantId, selectedApplicant.id),
      ))

    uploadedDocsCount = docCount?.total ?? 0
  }

  // Pull full evaluation payload only for the evaluation step.
  const latestEval =
    currentStep === "evaluation" && hasEvaluation
      ? (await db.query.documentEvaluationTable.findFirst({
          where: and(
            eq(documentEvaluationTable.applicationId, appId),
            eq(documentEvaluationTable.applicantId, selectedApplicant.id),
          ),
          orderBy: [desc(documentEvaluationTable.createdAt)],
        })) ?? null
      : null

  // Compute expiring documents from the latest evaluation's extractedFields
  // Flag any document whose expiryDate is within 90 days of today
  const EXPIRY_WARNING_DAYS = 90
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiringDocs: ExpiringDoc[] = []
  if (latestEval?.itemFeedback) {
    const itemFeedback = latestEval.itemFeedback as Record<string, { extractedFields?: { expiryDate?: string | null } }>
    for (const item of checklistItems) {
      const expiryDateStr = itemFeedback[item.id]?.extractedFields?.expiryDate
      if (!expiryDateStr) continue
      const expiry = new Date(expiryDateStr)
      if (isNaN(expiry.getTime())) continue
      expiry.setHours(0, 0, 0, 0)
      const daysUntilExpiry = Math.round((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
        expiringDocs.push({ documentName: item.documentName, expiryDate: expiryDateStr, daysUntilExpiry })
      }
    }
  }

  // Pre-index docs by checklist item — O(1) lookup inside render instead of O(n) filter per item
  const docsByChecklistItem = new Map<string, WorkspaceUploadedDocument[]>()
  for (const doc of uploadedDocs) {
    if (!doc.checklistItemId) continue
    const bucket = docsByChecklistItem.get(doc.checklistItemId)
    if (bucket) bucket.push(doc)
    else docsByChecklistItem.set(doc.checklistItemId, [doc])
  }

  function getStepHref(step: WorkflowStep): string {
    if (step === "chat") return `/dashboard/${appId}/atlas`
    const base = step === "checklist"
      ? `/dashboard/${appId}/checklist`
      : `/dashboard/${appId}/evaluation`
    const params = new URLSearchParams()
    if (selectedApplicant.id) params.set("applicant", selectedApplicant.id)
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }

  // Per-applicant readiness from the applicant row itself
  const score = selectedApplicant.readinessScore

  return (
    <>
      <PageHeader
        items={[
          { href: `/dashboard/${appId}`, label: "Application" },
          { href: getStepHref(currentStep), label: currentStepMeta.label },
        ]}
      />
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-4 px-4 py-4 pb-28 md:gap-5 md:py-5 md:pb-5 lg:px-6">
          {/* Native-like compact header with a single "next action" cue. */}
          <Card>
            <CardContent className="pt-4 pb-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-0.5 min-w-0">
                  <h1 className="text-xl md:text-2xl font-semibold capitalize tracking-tight leading-snug">
                    {app.destinationCountry} — {app.visaType} Visa
                  </h1>
                  <p className="text-xs md:text-sm text-muted-foreground truncate max-w-full">
                    {app.homeCountry} → {app.currentCountry} · {app.embassy}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {score !== null && score !== undefined && (
                    <Badge
                      variant="outline"
                      className={`px-3 py-1 text-sm font-semibold tabular-nums ${
                        selectedApplicant.riskLevel
                          ? `${RISK_TEXT_COLORS[selectedApplicant.riskLevel]} border-current/20 bg-current/5`
                          : "text-muted-foreground border-border"
                      }`}
                    >
                      {score}/100
                    </Badge>
                  )}
                  <Badge variant="outline" className="capitalize px-3 py-1">
                    {app.status.replace("_", " ")}
                  </Badge>
                  <Link
                    href={`/dashboard/${appId}/settings` as never}
                    className="ui-feedback inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/70 hover:text-foreground"
                    title="Application settings"
                  >
                    <Settings2Icon className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="rounded-xl border border-primary/28 bg-gradient-to-r from-primary/10 via-primary/6 to-transparent p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Do this next</p>
                    <p className="mt-1 text-sm font-semibold tracking-tight">{nextAction.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{nextAction.description}</p>
                  </div>
                  <Button asChild size="sm" className="gap-2 self-start">
                    <Link href={(nextAction.href ?? getStepHref(nextAction.step)) as never}>
                      {nextAction.cta}
                    </Link>
                  </Button>
                </div>
              </div>

              {requiredCount > 0 && (
                <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      {uploadedCount}/{requiredCount} required uploaded
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {missingRequiredCount} missing
                    </p>
                  </div>
                  <Progress value={completionPercent} className="h-1.5 mt-2.5" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {/* Keeps guidance concise instead of duplicating multiple metric cards. */}
                    {missingRequiredCount > 0
                      ? `Next: upload ${missingRequiredCount} required document${missingRequiredCount !== 1 ? "s" : ""} for ${selectedApplicant.name}.`
                      : `All required documents uploaded for ${selectedApplicant.name}.`}
                  </p>
                </div>
              )}

              {/* Compact segmented control mirrors native tab bars and saves vertical space. */}
              <div className="rounded-xl border border-border/70 bg-muted/45 p-1">
                <div className="grid grid-cols-3 gap-1">
                  {STEP_CARDS.map(({ step, label, compactLabel, icon: StepIcon }) => {
                    const state = workflowStates[step]
                    const isLocked = state === "locked"
                    return (
                      <Link
                        key={step}
                        href={isLocked ? "#" : (getStepHref(step) as never)}
                        aria-disabled={isLocked}
                        title={isLocked ? "Run an evaluation first to unlock Atlas" : undefined}
                        className={`ui-feedback rounded-lg border px-2.5 py-2 text-xs md:text-sm transition-[background-color,color,border-color,box-shadow] ${getWorkflowStateClasses(state)} ${isLocked ? "cursor-not-allowed pointer-events-none" : "hover:bg-background/90 hover:shadow-2xs"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <StepIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="md:hidden font-medium">{compactLabel}</span>
                            <span className="hidden md:inline font-medium">{label}</span>
                          </div>
                          <span className="hidden md:inline text-2xs font-semibold uppercase tracking-[0.08em] opacity-80">
                            {getWorkflowStepStateLabel(state)}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedApplicant.name} is on {currentStepMeta.label}. Finish required documents, review the evaluation, then use Atlas to iterate.
              </p>
            </CardContent>
          </Card>

          {/* On small/medium screens, keep context controls near the top for native-like ergonomics. */}
          <Card className="xl:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Current Applicant</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <ApplicantSwitcher
                applicants={resolvedApplicants}
                selectedApplicantId={selectedApplicant.id}
                applicationId={appId}
                currentStep={currentStep}
                showLabel={false}
                canManageBilling={session.userId === app.userId}
                planInfo={{ plan: app.plan, paidApplicantCount: app.paidApplicantCount }}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Viewing {selectedApplicant.name}. Switch applicants anytime to update all steps.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              {/* Step content — delegated to focused sub-components */}
              <div className="space-y-4">
                {currentStep === "checklist" && (
                  <ChecklistStep
                    appId={appId}
                    selectedApplicant={selectedApplicant}
                    requiredItems={requiredItems}
                    optionalItems={optionalItems}
                    docsByChecklistItem={docsByChecklistItem}
                    hasChecklist={hasChecklist}
                    researchSource={researchSource}
                    researchGeneratedAt={researchGeneratedAt}
                    researchCitations={researchCitations}
                  />
                )}

                {currentStep === "evaluation" && (
                  <EvaluationStep
                    appId={appId}
                    selectedApplicant={selectedApplicant}
                    checklistItems={checklistItems}
                    uploadedDocsCount={uploadedDocsCount}
                    latestEval={latestEval ?? null}
                    expiringDocs={expiringDocs}
                    isEvalLocked={isEvalLocked(app)}
                  />
                )}

              </div>
            </div>

            {/* Secondary context rail keeps applicant state and key actions stable on desktop only. */}
            <div className="hidden xl:block space-y-4 xl:sticky xl:top-4 h-fit">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Workspace</CardTitle>
                  <CardDescription>
                    Stay in context while moving through each step.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Current step</p>
                    <p className="text-sm font-semibold tracking-tight">{currentStepMeta.label}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">Completion</p>
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      {uploadedCount} / {requiredCount} required
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {previousStep ? (
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link href={getStepHref(previousStep) as never}>Previous</Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" className="w-full" disabled>
                        Previous
                      </Button>
                    )}
                    {nextStep ? (
                      <Button asChild size="sm" className="w-full">
                        <Link href={getStepHref(nextStep) as never}>Next</Link>
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" className="w-full" disabled>
                        Done
                      </Button>
                    )}
                  </div>
                  <ApplicantSwitcher
                    applicants={resolvedApplicants}
                    selectedApplicantId={selectedApplicant.id}
                    applicationId={appId}
                    currentStep={currentStep}
                    showLabel={false}
                    canManageBilling={session.userId === app.userId}
                    planInfo={{ plan: app.plan, paidApplicantCount: app.paidApplicantCount }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Principle: stay simple and sequential - complete required docs, evaluate, then iterate in chat.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Sticky mobile dock keeps navigation/actions reachable with thumb ergonomics. */}
          <div className="xl:hidden fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-4 right-4 z-40">
            <div className="rounded-2xl border border-border/80 bg-background/95 p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
              <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                {previousStep ? (
                  <Button asChild variant="outline">
                    <Link href={getStepHref(previousStep) as never}>Prev</Link>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Prev
                  </Button>
                )}

                <div className="flex items-center justify-center">
                  {/*
                   * Never duplicate the EvaluationTrigger here — it now lives contextually
                   * inside the evaluation tab's content area for both mobile and desktop.
                   * The dock center only handles step-navigation shortcuts.
                   */}
                  {currentStep !== nextAction.step ? (
                    <Button asChild variant="secondary">
                      <Link href={(nextAction.href ?? getStepHref(nextAction.step)) as never}>{nextAction.cta}</Link>
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      Focused on next action
                    </p>
                  )}
                </div>

                {nextStep ? (
                  <Button asChild>
                    <Link href={getStepHref(nextStep) as never}>Next</Link>
                  </Button>
                ) : (
                  <Button variant="secondary" disabled>
                    Done
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
