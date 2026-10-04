"use client"

import { useServerAction } from "zsa-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CheckCircle2Icon, ImagePlusIcon, SendIcon, XIcon } from "lucide-react"
import { submitSupportTicketAction } from "@/actions/support.action"

const schema = z.object({
  category: z.enum(["bug", "feedback", "question", "feature_request", "other"], {
    required_error: "Please select a category",
  }),
  subject: z.string().min(1, "Subject is required").max(255, "Subject is too long"),
  description: z.string().min(10, "Please provide at least 10 characters").max(5000, "Too long"),
})

type FormValues = z.infer<typeof schema>

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Something broke",
  feedback: "Feedback",
  question: "Question",
  feature_request: "Request a change",
  other: "Other",
}

const MAX_SCREENSHOTS = 3
import { MAX_SUPPORT_FILE_SIZE } from "@/constants"

interface UploadedScreenshot {
  fileKey: string
  previewUrl: string
  name: string
}

interface SubmitTicketFormProps {
  onSuccess?: () => void
}

export function SubmitTicketForm({ onSuccess }: SubmitTicketFormProps = {}) {
  const [submittedId, setSubmittedId] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<UploadedScreenshot[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { subject: "", description: "" } as any,
  })

  const description = watch("description")

  const { execute, isPending } = useServerAction(submitSupportTicketAction, {
    onSuccess: ({ data }) => {
      setSubmittedId(data.id)
      // Revoke object URLs to free memory
      screenshots.forEach((s) => URL.revokeObjectURL(s.previewUrl))
      setScreenshots([])
      reset()
      router.refresh()
      // Notify parent after showing the success UI for 2 seconds
      setTimeout(() => onSuccess?.(), 2000)
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to submit ticket")
    },
  })

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return

    // Reset input so same file can be re-selected
    e.target.value = ""

    const available = MAX_SCREENSHOTS - screenshots.length
    const toUpload = files.slice(0, available)

    for (const file of toUpload) {
      if (file.size > MAX_SUPPORT_FILE_SIZE) {
        toast.error(`"${file.name}" is too large (max 5 MB)`)
        continue
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`"${file.name}" is not an image`)
        continue
      }

      setUploading(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/upload-support-screenshot", { method: "POST", body: fd })
        const json = await res.json() as { success?: boolean; fileKey?: string; error?: string }

        if (!res.ok || !json.fileKey) {
          toast.error(json.error || `Failed to upload "${file.name}"`)
          continue
        }

        setScreenshots((prev) => [
          ...prev,
          {
            fileKey: json.fileKey!,
            previewUrl: URL.createObjectURL(file),
            name: file.name,
          },
        ])
      } catch {
        toast.error(`Failed to upload "${file.name}"`)
      } finally {
        setUploading(false)
      }
    }
  }

  function removeScreenshot(index: number) {
    setScreenshots((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  if (submittedId) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <CheckCircle2Icon className="h-12 w-12 text-status-success" />
        <div>
          <p className="font-semibold text-lg">Ticket submitted!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your ticket ID is <span className="font-mono font-medium">{submittedId}</span>. We&apos;ll follow up in this thread.
          </p>
        </div>
        <Button variant="outline" onClick={() => setSubmittedId(null)}>
          Submit another ticket
        </Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit((values) =>
        execute({
          ...values,
          screenshotUrls: screenshots.map((s) => s.fileKey),
        })
      )}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="category">What do you need?</Label>
        <Select
          onValueChange={(v) => setValue("category", v as FormValues["category"])}
        >
          <SelectTrigger id="category">
            <SelectValue placeholder="Choose the closest match" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.category && <p className="text-destructive text-xs">{errors.category.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject">Subject</Label>
        <Input
          id="subject"
          placeholder="Example: PDF preview is blurry on a bank statement"
          maxLength={255}
          {...register("subject")}
        />
        {errors.subject && <p className="text-destructive text-xs">{errors.subject.message}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="description">Description</Label>
          <span className="text-xs text-muted-foreground">{description.length} / 5000</span>
        </div>
        <Textarea
          id="description"
          placeholder="Tell us where you were in the app, what case or file you were viewing, and what happened."
          rows={5}
          maxLength={5000}
          {...register("description")}
        />
        {errors.description && <p className="text-destructive text-xs">{errors.description.message}</p>}
      </div>

      {/* Screenshot upload */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Screenshots <span className="text-muted-foreground font-normal">(optional, up to {MAX_SCREENSHOTS})</span></Label>
          <span className="text-xs text-muted-foreground">{screenshots.length} / {MAX_SCREENSHOTS}</span>
        </div>

        {screenshots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {screenshots.map((s, i) => (
              <div key={s.fileKey} className="relative group rounded-md overflow-hidden border w-24 h-24 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- Local blob previews are not compatible with next/image optimization. */}
                <img src={s.previewUrl} alt={s.name} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeScreenshot(i)}
                  className="absolute top-1 right-1 rounded-full bg-foreground/60 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove screenshot ${s.name}`}
                >
                  <XIcon className="h-3 w-3 text-background" />
                </button>
              </div>
            ))}
          </div>
        )}

        {screenshots.length < MAX_SCREENSHOTS && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
              aria-label="Choose screenshot images"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlusIcon className="h-4 w-4 mr-2" />
              {uploading ? "Uploading…" : "Add Screenshot"}
            </Button>
          </>
        )}
      </div>

      <Button type="submit" disabled={isPending || uploading} className="w-full">
        <SendIcon className="h-4 w-4 mr-2" />
        {isPending ? "Submitting…" : "Submit Ticket"}
      </Button>
    </form>
  )
}
