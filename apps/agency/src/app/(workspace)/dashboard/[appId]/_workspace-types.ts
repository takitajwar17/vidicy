import {
  LayoutListIcon,
  ScanTextIcon,
  ApertureIcon,
} from "lucide-react"

export const WORKFLOW_STEPS = ["checklist", "evaluation", "chat"] as const
export type WorkflowStep = (typeof WORKFLOW_STEPS)[number]
export type WorkflowStepState = "current" | "done" | "ready" | "blocked" | "locked"

export interface StepMeta {
  label: string
  compactLabel: string
}

export const STEP_META: Record<WorkflowStep, StepMeta> = {
  checklist: { label: "Checklist", compactLabel: "Checklist" },
  evaluation: { label: "Evaluation", compactLabel: "Evaluate" },
  chat: { label: "Atlas", compactLabel: "Atlas" },
}

export const STEP_CARDS = [
  { step: "checklist" as const, label: "Checklist", compactLabel: "Checklist", icon: LayoutListIcon },
  { step: "evaluation" as const, label: "Evaluation", compactLabel: "Evaluate", icon: ScanTextIcon },
  { step: "chat" as const, label: "Atlas", compactLabel: "Atlas", icon: ApertureIcon },
] as const

export interface NextActionContext {
  hasChecklist: boolean
  missingRequiredCount: number
  hasEvaluation: boolean
  applicantName: string
}

export interface NextAction {
  step: WorkflowStep
  title: string
  description: string
  cta: string
  href?: string
}

export interface ExpiringDoc {
  documentName: string
  expiryDate: string
  daysUntilExpiry: number
}

export interface WorkflowStepStateContext {
  currentStep?: WorkflowStep | null
  hasChecklist: boolean
  missingRequiredCount: number
  hasEvaluation: boolean
  isTrialLocked: boolean
}

export function getWorkflowStepStates({
  currentStep = null,
  hasChecklist,
  missingRequiredCount,
  hasEvaluation,
  isTrialLocked,
}: WorkflowStepStateContext): Record<WorkflowStep, WorkflowStepState> {
  const checklistComplete = hasChecklist && missingRequiredCount === 0

  const states: Record<WorkflowStep, WorkflowStepState> = {
    checklist: checklistComplete ? "done" : "ready",
    evaluation: hasEvaluation ? "done" : checklistComplete ? "ready" : "blocked",
    chat: isTrialLocked ? "locked" : hasEvaluation ? "ready" : "blocked",
  }

  if (currentStep && states[currentStep] !== "locked") {
    states[currentStep] = "current"
  }

  return states
}

export function getWorkflowStepStateLabel(state: WorkflowStepState) {
  if (state === "done") return "Done"
  if (state === "current") return "Now"
  if (state === "ready") return "Ready"
  if (state === "locked") return "Locked"
  return "Waiting"
}

/**
 * Chooses the next action that improves readiness with the least friction.
 */
export function getNextAction({
  hasChecklist,
  missingRequiredCount,
  hasEvaluation,
  applicantName,
  appId,
}: NextActionContext & { appId: string }): NextAction {
  if (!hasChecklist) {
    return {
      step: "checklist",
      title: "Generate the checklist",
      description: `Start by generating a tailored document list for ${applicantName}.`,
      cta: "Generate Checklist",
    }
  }

  if (missingRequiredCount > 0) {
    return {
      step: "checklist",
      title: "Upload missing required documents",
      description: `${missingRequiredCount} required document${missingRequiredCount !== 1 ? "s are" : " is"} still missing.`,
      cta: "Finish Required Docs",
    }
  }

  if (!hasEvaluation) {
    return {
      step: "evaluation",
      title: "Run AI evaluation",
      description: "Turn your documents into a score and concrete recommendations.",
      cta: "Run Evaluation",
    }
  }

  return {
    step: "evaluation",
    title: "Refine weak spots with Atlas",
    description: "Use the AI assistant to strengthen remaining risk areas.",
    cta: "Open Atlas",
    href: `/dashboard/${appId}/atlas`,
  }
}
