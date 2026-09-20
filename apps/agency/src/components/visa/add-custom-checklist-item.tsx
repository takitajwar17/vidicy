"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useServerAction } from "zsa-react"
import { PlusIcon, Loader2Icon, AlertCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { addCustomChecklistItemAction } from "@/actions/checklist.action"

interface AddCustomChecklistItemProps {
  applicationId: string
  applicantId: string
}

export function AddCustomChecklistItem({ applicationId, applicantId }: AddCustomChecklistItemProps) {
  const [open, setOpen] = useState(false)
  const [documentName, setDocumentName] = useState("")
  const [reasoning, setReasoning] = useState("")
  const [source, setSource] = useState("")
  const [isRequired, setIsRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const { execute, isPending } = useServerAction(addCustomChecklistItemAction)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const [, err] = await execute({
      applicationId,
      applicantId,
      documentName: documentName.trim(),
      reasoning: reasoning.trim(),
      source: source.trim() || undefined,
      isRequired,
    })

    if (err) {
      setError(err.message)
      return
    }

    setOpen(false)
    setDocumentName("")
    setReasoning("")
    setSource("")
    setIsRequired(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <PlusIcon className="h-3.5 w-3.5" />
          Add document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add custom document</DialogTitle>
          <DialogDescription>
            Propose a document not on the generated checklist. It will be cross-validated against official
            sources before being added.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="doc-name">Document name <span className="text-destructive">*</span></Label>
            <Input
              id="doc-name"
              placeholder="e.g. NOC from employer"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              disabled={isPending}
              required
              minLength={2}
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reasoning">Why is this document needed? <span className="text-destructive">*</span></Label>
            <Textarea
              id="reasoning"
              placeholder="Explain why you believe this document is required or will strengthen the application…"
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              disabled={isPending}
              required
              minLength={10}
              maxLength={800}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source">Source URL or reference <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="source"
              placeholder="https://embassy.gov/visa-requirements or MOM guidelines…"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={isPending}
              maxLength={500}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="is-required" className="text-sm font-medium">Mark as required</Label>
              <p className="text-xs text-muted-foreground">Required documents must be uploaded before evaluation.</p>
            </div>
            <Switch
              id="is-required"
              checked={isRequired}
              onCheckedChange={setIsRequired}
              disabled={isPending}
            />
          </div>

          {error && (
            <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircleIcon className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon className="h-3.5 w-3.5 text-primary animate-spin" />
              Validating against official sources…
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isPending || !documentName.trim() || !reasoning.trim()}
            >
              {isPending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <PlusIcon className="h-4 w-4" />}
              {isPending ? "Validating…" : "Add document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
