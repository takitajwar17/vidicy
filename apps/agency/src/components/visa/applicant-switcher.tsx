"use client"

import { useRouter } from "next/navigation"
import { UsersIcon } from "lucide-react"
import type { Applicant } from "@/db/schema"
import type { Route } from "next"
import Link from "next/link"
import { AddApplicantButton } from "@/components/applications/add-applicant-button"

const RELATIONSHIP_LABELS: Record<string, string> = {
  primary: "You",
  spouse: "Spouse",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  other: "Other",
}

const RELATIONSHIP_COLORS: Record<string, string> = {
  primary: "text-primary",
  spouse: "text-chart-1",
  child: "text-chart-2",
  parent: "text-chart-3",
  sibling: "text-chart-4",
  other: "text-muted-foreground",
}

/**
 * Uses shared semantic risk colors so score chips match the rest of dashboard UI.
 */
import { RISK_TEXT_COLORS } from "@/constants"

interface ApplicantSwitcherProps {
  applicants: Applicant[]
  selectedApplicantId: string
  applicationId: string
  currentStep?: string
  showLabel?: boolean
  canManageBilling?: boolean
  planInfo?: {
    plan: string | null
    paidApplicantCount: number
  }
}

export function ApplicantSwitcher({
  applicants,
  selectedApplicantId,
  applicationId,
  currentStep,
  showLabel = true,
  canManageBilling = false,
  planInfo,
}: ApplicantSwitcherProps) {
  const router = useRouter()

  /**
   * Preserves navigation context by carrying the current step when switching applicants.
   */
  function getApplicantHref({ applicantId }: { applicantId: string }): Route {
    const params = new URLSearchParams()
    params.set("applicant", applicantId)
    const base = currentStep === "evaluation"
      ? `/dashboard/${applicationId}/evaluation`
      : `/dashboard/${applicationId}/checklist`
    return `${base}?${params.toString()}` as Route
  }

  function selectApplicant(applicantId: string) {
    if (applicantId === selectedApplicantId) return
    router.push(getApplicantHref({ applicantId }))
  }

  return (
    <div className="space-y-3">
      {/* Compact list rows improve scanability for long legal names. */}
      <div className="space-y-2">
        {showLabel && <span className="text-sm text-muted-foreground font-medium">Applicants</span>}
        {planInfo && planInfo.paidApplicantCount > 0 && (() => {
          const planLabel = planInfo.plan === "family" ? "Family" : planInfo.plan === "custom" ? "Custom" : "Solo";
          // Primary applicant is already in the applicants array
          const currentCount = applicants.length;
          const remaining = Math.max(0, planInfo.paidApplicantCount - currentCount);
          return (
            <div className="text-xs text-muted-foreground rounded-md bg-muted/40 px-2.5 py-1.5">
              <span className="font-medium">{planLabel}</span>
              {" · "}
              {remaining > 0
                ? <span className="text-status-success">{remaining} free slot{remaining !== 1 ? "s" : ""} remaining</span>
                : <span>{currentCount}/{planInfo.paidApplicantCount} slots used</span>
              }
            </div>
          );
        })()}
        {applicants.map((applicant) => {
          const isSelected = applicant.id === selectedApplicantId
          return (
            <button
              key={applicant.id}
              onClick={() => selectApplicant(applicant.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-background hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium truncate ${RELATIONSHIP_COLORS[applicant.relationship]}`}>
                    {applicant.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {RELATIONSHIP_LABELS[applicant.relationship] ?? applicant.relationship}
                  </p>
                </div>
                {applicant.readinessScore !== null && applicant.readinessScore !== undefined && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums shrink-0 ${
                      applicant.riskLevel
                        ? `${RISK_TEXT_COLORS[applicant.riskLevel] ?? "text-muted-foreground"} border-current/20 bg-current/5`
                        : "text-muted-foreground border-border bg-muted/30"
                    }`}
                  >
                    {applicant.readinessScore}%
                  </span>
                )}
              </div>
            </button>
          )
        })}
        <div className="flex gap-1.5">
          <Link
            href={`/dashboard/${applicationId}/members` as Route}
            className="flex items-center justify-center rounded-lg border border-dashed px-2.5 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-colors shrink-0"
            aria-label="Manage applicants"
          >
            <UsersIcon className="h-3.5 w-3.5" />
          </Link>
          <div className="flex-1">
            <AddApplicantButton
              applicationId={applicationId}
              compact
              canManageBilling={canManageBilling}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
