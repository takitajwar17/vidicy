"use client"

import type { Route } from "next"
import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Loader2Icon, RefreshCwIcon, BrainCircuitIcon, UploadIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { evaluateDocumentsAction } from "@/actions/evaluation.action"

interface EvaluationTriggerProps {
  applicationId: string
  applicantId: string
  hasDocuments: boolean
  /** When true, renders as a re-run (refresh icon + "Re-run" label). */
  rerun?: boolean
  checklistHref?: string
}

export function EvaluationTrigger({
  applicationId,
  applicantId,
  hasDocuments,
  rerun = false,
  checklistHref,
}: EvaluationTriggerProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleEvaluate() {
    setLoading(true)
    const [, err] = await evaluateDocumentsAction({ applicationId, applicantId })
    if (err) {
      // Use Sonner toast for consistency with the rest of the app — never native alert()
      toast.error("Evaluation failed. Please try again.")
    } else {
      router.refresh()
    }
    setLoading(false)
  }

  const IdleIcon = !hasDocuments ? UploadIcon : rerun ? RefreshCwIcon : BrainCircuitIcon
  const idleLabel = hasDocuments
    ? rerun
      ? "Re-run Review"
      : "Run Review"
    : "Upload Documents First"

  if (!hasDocuments && checklistHref) {
    return (
      <Button asChild variant="outline" className="gap-2">
        <Link href={checklistHref as Route}>
          <UploadIcon className="h-4 w-4" />
          {idleLabel}
        </Link>
      </Button>
    )
  }

  return (
    <Button
      onClick={handleEvaluate}
      disabled={loading || !hasDocuments}
      variant={rerun ? "outline" : "default"}
      size={rerun ? "sm" : "default"}
      className="gap-2"
    >
      {loading ? (
        <>
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Evaluating...
        </>
      ) : (
        <>
          <IdleIcon className="h-4 w-4" />
          {idleLabel}
        </>
      )}
    </Button>
  )
}
