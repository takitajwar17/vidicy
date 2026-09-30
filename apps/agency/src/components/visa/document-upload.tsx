"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { UploadIcon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface DocumentUploadProps {
  applicationId: string
  applicantId?: string
  checklistItemId: string
  onSuccess?: (result: { documentId: string; fileName: string; fileSize: number }) => void
  label?: string
}

import { MAX_DOCUMENT_FILE_SIZE } from "@/constants"
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
])

export function DocumentUpload({ applicationId, applicantId, checklistItemId, onSuccess, label = "Upload" }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Fast client-side validation reduces failed round trips.
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      toast.error("File too large. Maximum allowed size is 10 MB.")
      if (fileRef.current) fileRef.current.value = ""
      return
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("Unsupported file type. Allowed: PDF, JPEG, PNG.")
      if (fileRef.current) fileRef.current.value = ""
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("applicationId", applicationId)
      if (applicantId) formData.append("applicantId", applicantId)
      formData.append("checklistItemId", checklistItemId)

      const uploadRoute =
        file.type === "application/pdf"
          ? "/api/documents/upload/pdf"
          : "/api/documents/upload/image"

      const res = await fetch(uploadRoute, {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string })) as { error?: string }
        toast.error(err?.error ?? "Upload failed. Please try again.")
        return
      }

      const result = await res.json() as { documentId: string; fileName: string; fileSize: number }
      toast.success("Document uploaded.")
      onSuccess?.(result)
      router.refresh()
    } catch {
      toast.error("Upload failed. Please try again.")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={handleFile}
        disabled={uploading}
        aria-label="Choose document to upload"
      />
      <Button
        variant="default"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="h-10 gap-2 min-w-[44px]"
      >
        {uploading ? (
          <>
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <UploadIcon className="h-4 w-4" />
            {label}
          </>
        )}
      </Button>
    </div>
  )
}
