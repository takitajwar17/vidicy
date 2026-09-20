import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { LayoutListIcon, ScanTextIcon, ApertureIcon } from "lucide-react"
import type { Route } from "next"

import { RISK_TEXT_COLORS } from "@/constants"
import {
  getWorkflowStepStateLabel,
  type WorkflowStep,
  type WorkflowStepState,
} from "@/app/(workspace)/dashboard/[appId]/_workspace-types"

const STEP_CARDS = [
  { step: "checklist" as const, label: "Checklist", compactLabel: "Checklist", icon: LayoutListIcon },
  { step: "evaluation" as const, label: "Evaluation", compactLabel: "Evaluate", icon: ScanTextIcon },
  { step: "chat" as const, label: "Atlas", compactLabel: "Atlas", icon: ApertureIcon },
]

function getStepHref(appId: string, step: WorkflowStep): string {
  if (step === "chat") return `/dashboard/${appId}/atlas`
  return `/dashboard/${appId}/${step}`
}

interface WorkspaceStepBarProps {
  appId: string
  currentStep: WorkflowStep
  hasEvaluation: boolean
  destinationCountry: string
  visaType: string
  status: string
  homeCountry: string
  currentCountry: string
  embassy: string
  score?: number | null
  riskLevel?: string | null
  stepStates?: Partial<Record<WorkflowStep, WorkflowStepState>>
}

function getStateClasses(state: WorkflowStepState) {
  if (state === "done") return "border-status-success/35 bg-status-success/12 text-status-success"
  if (state === "current") return "border-primary/45 bg-primary/12 text-primary shadow-xs ring-1 ring-primary/15"
  if (state === "ready") return "border-primary/30 bg-primary/7 text-foreground"
  if (state === "locked") return "border-border bg-muted/50 text-muted-foreground opacity-75"
  return "border-border bg-muted/35 text-muted-foreground"
}

export function WorkspaceStepBar({
  appId,
  currentStep,
  hasEvaluation,
  destinationCountry,
  visaType,
  status,
  homeCountry,
  currentCountry,
  embassy,
  score,
  riskLevel,
  stepStates,
}: WorkspaceStepBarProps) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5 min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold capitalize tracking-tight leading-snug">
              {destinationCountry} — {visaType} Visa
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground truncate max-w-full">
              {homeCountry} → {currentCountry} · {embassy}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {score !== null && score !== undefined && (
              <Badge
                variant="outline"
                className={`px-3 py-1 text-sm font-semibold tabular-nums ${
                  riskLevel
                    ? `${RISK_TEXT_COLORS[riskLevel] ?? "text-muted-foreground"} border-current/20 bg-current/5`
                    : "text-muted-foreground border-border"
                }`}
              >
                {score}/100
              </Badge>
            )}
            <Badge variant="outline" className="capitalize px-3 py-1">
              {status.replace("_", " ")}
            </Badge>
          </div>
        </div>

        {/* Compact segmented step control */}
        <div className="rounded-xl border border-border/70 bg-muted/45 p-1">
          <div className="grid grid-cols-3 gap-1">
            {STEP_CARDS.map(({ step, label, compactLabel, icon: StepIcon }) => {
              const state =
                stepStates?.[step] ??
                (step === currentStep ? "current" : step === "chat" && !hasEvaluation ? "blocked" : "done")
              const isLocked = state === "locked" || state === "blocked"
              return (
                <Link
                  key={step}
                  href={isLocked ? "#" : (getStepHref(appId, step) as Route)}
                  aria-disabled={isLocked}
                  title={isLocked ? "Complete the earlier workflow step first" : undefined}
                  className={`ui-feedback rounded-lg border px-2.5 py-2 text-xs md:text-sm transition-[background-color,color,border-color,box-shadow] ${getStateClasses(state)} ${isLocked ? "pointer-events-none cursor-not-allowed" : "hover:bg-background/90 hover:shadow-2xs"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <StepIcon className="h-3.5 w-3.5 shrink-0" />
                      <span className="md:hidden font-medium">{compactLabel}</span>
                      <span className="hidden md:inline font-medium">{label}</span>
                    </div>
                    <span className="hidden md:inline text-2xs font-medium uppercase tracking-wide opacity-80">
                      {getWorkflowStepStateLabel(state)}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
