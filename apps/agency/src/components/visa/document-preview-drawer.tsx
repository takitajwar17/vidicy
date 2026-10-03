"use client"

import { useState, useEffect } from "react"
import { FileIcon, DownloadIcon, Loader2Icon, AlertCircleIcon, EyeIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { PdfCanvasPreview } from "@/components/visa/pdf-canvas-preview"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface DocumentPreviewDrawerProps {
  documentId: string
  fileName: string
  fileSize: number
  mimeType: string
  uploadedAt: Date
  isActive: boolean
  hasMultipleVersions: boolean
  sectionLabel: string
  children?: React.ReactNode
  side?: "left" | "right"
  triggerLabel?: string
  triggerVariant?: "button" | "document-row"
}

export function DocumentPreviewDrawer({
  documentId,
  fileName,
  fileSize,
  mimeType,
  uploadedAt,
  isActive,
  hasMultipleVersions,
  sectionLabel,
  children,
  side = "right",
  triggerLabel = "View",
  triggerVariant = "document-row",
}: DocumentPreviewDrawerProps) {
  const [open, setOpen] = useState<boolean>(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const downloadUrl = `/api/document-preview/${documentId}?download=1`
  const isPDF = mimeType === "application/pdf"
  const isImage = mimeType.startsWith("image/")
  const isWord =
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

  // Fetch PDF as a blob when the drawer opens.
  // The blob URL is then handed to PdfViewer which renders it page-by-page via PDF.js.
  useEffect(() => {
    if (!open || !isPDF) return

    setPdfLoading(true)
    setPdfError(null)
    let cancelled = false

    fetch(`/api/document-preview/${documentId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load PDF (${res.status})`)
        return res.blob()
      })
      .then((blob) => {
        if (cancelled) return
        setPdfBlobUrl(URL.createObjectURL(blob))
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setPdfError(err instanceof Error ? err.message : "Failed to load PDF")
      })
      .finally(() => {
        if (!cancelled) setPdfLoading(false)
      })

    return () => {
      cancelled = true
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [open, isPDF, documentId])

  return (
    <>
      {triggerVariant === "button" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg px-3 text-xs font-bold"
          onClick={() => setOpen(true)}
          aria-label={`Preview document: ${fileName}`}
        >
          <EyeIcon className="mr-1.5 h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      ) : (
        /* Using div[role=button] instead of <button> to allow nested interactive elements
            (e.g. delete button) without violating HTML spec / causing hydration errors. */
        <div
          role="button"
          tabIndex={0}
          className={`group rounded-lg border px-3 py-2.5 cursor-pointer transition-colors w-full text-left ${
            isActive ? "border-primary/20 bg-primary/5" : "bg-muted/20 hover:bg-muted/35"
          }`}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } }}
          aria-label={`Preview document: ${fileName}`}
        >
          <div className="flex items-center gap-3">
            <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{fileName}</p>
                {isActive && hasMultipleVersions && (
                  <Badge className="text-2xs h-4 px-1.5 font-normal bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 shrink-0">
                    In use
                  </Badge>
                )}
                {!isActive && (
                  <Badge variant="outline" className="text-2xs h-4 px-1.5 font-normal text-muted-foreground shrink-0">
                    Older
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatBytes(fileSize)} · {uploadedAt.toLocaleDateString()}
              </p>
            </div>
            <div onClick={(e) => e.stopPropagation()} className="flex items-center shrink-0">
              {children}
            </div>
          </div>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={side} className="flex w-[min(92vw,44rem)] flex-col gap-0 p-0 sm:max-w-2xl">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{sectionLabel}</p>
            <SheetTitle className="truncate text-base">{fileName}</SheetTitle>
            <div className="flex items-center gap-2">
              <SheetDescription>
                {formatBytes(fileSize)} · {uploadedAt.toLocaleDateString()}
              </SheetDescription>
              {isActive && (
                <Badge className="text-2xs h-4 px-1.5 font-normal bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 shrink-0">
                  In use
                </Badge>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-hidden bg-muted/20 min-h-0 relative">
            {isPDF && (
              <>
                {pdfLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                {pdfError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center">
                    <AlertCircleIcon className="h-8 w-8 text-destructive" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Preview unavailable</p>
                      <p className="text-xs text-muted-foreground">{pdfError}</p>
                    </div>
                  </div>
                )}
                {pdfBlobUrl && (
                  <PdfCanvasPreview
                    blobUrl={pdfBlobUrl}
                    errorMessage="Failed to render PDF pages."
                  />
                )}
              </>
            )}
            {isImage && (
              <div className="w-full h-full flex items-center justify-center p-6 overflow-auto">
                {/* eslint-disable-next-line @next/next/no-img-element -- Authenticated document previews are served from an API route and should not be optimized/cached. */}
                <img
                  src={`/api/document-preview/${documentId}`}
                  alt={fileName}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-sm"
                />
              </div>
            )}
            {isWord && (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-8 text-center">
                <FileIcon className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="font-medium">Word documents can&apos;t be previewed</p>
                  <p className="text-sm text-muted-foreground">Download the file to view its contents.</p>
                </div>
              </div>
            )}
          </div>

          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <Button asChild variant="outline" size="sm">
              <a href={downloadUrl} download={fileName}>
                <DownloadIcon className="h-4 w-4 mr-2" />
                Download
              </a>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
