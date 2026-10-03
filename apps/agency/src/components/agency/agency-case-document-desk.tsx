"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleAlertIcon,
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  Loader2Icon,
  MoreVerticalIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { DocumentUpload } from "@/components/visa/document-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  PdfCanvasPreview,
  PdfDocumentThumbnail,
} from "@/components/visa/pdf-canvas-preview";
import { cn } from "@/lib/utils";

const UPLOADED_CHECKLIST_STATUSES = new Set(["uploaded", "approved"]);

interface AgencyCaseDocument {
  id: string;
  checklistItemId: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  pageCount: number | null;
  extractionStatus: string;
}

interface AgencyCaseChecklistItem {
  id: string;
  documentName: string;
  status: string;
}

interface AgencyCaseDocumentDeskProps {
  applicationId: string;
  applicantId: string | null;
  firstChecklistItemId: string | null;
  documents: AgencyCaseDocument[];
  checklistItems: AgencyCaseChecklistItem[];
  totalStorage: number;
}

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getDocumentCategory({
  fileName,
  checklistName,
}: {
  fileName: string;
  checklistName?: string | null;
}) {
  const value = `${fileName} ${checklistName ?? ""}`.toLowerCase();
  if (/(passport|national id|identity|photo)/.test(value)) return "Identity Documents";
  if (/(bank|salary|fund|financial|statement)/.test(value)) return "Financial Documents";
  if (/(form|application|itinerary|flight|hotel|accommodation|appointment)/.test(value)) {
    return "Application Documents";
  }
  return "Supporting Documents";
}

function getDocumentMeta(mimeType: string) {
  if (mimeType.startsWith("image/")) return "Image file";
  if (mimeType === "application/pdf") return "PDF file";
  return "Document";
}

function isPdfDocument(document: AgencyCaseDocument | null) {
  return document?.mimeType === "application/pdf";
}

function getInitialDocumentId(documents: AgencyCaseDocument[]) {
  const passportDocument = documents.find((document) => /passport/i.test(document.fileName) && document.mimeType.startsWith("image/"));
  if (passportDocument) return passportDocument.id;

  const imageDocument = documents.find((document) => document.mimeType.startsWith("image/"));
  if (imageDocument) return imageDocument.id;

  return documents[0]?.id ?? null;
}

export function AgencyCaseDocumentDesk({
  applicationId,
  applicantId,
  firstChecklistItemId,
  documents,
  checklistItems,
  totalStorage,
}: AgencyCaseDocumentDeskProps) {
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(() => getInitialDocumentId(documents));
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const checklistById = useMemo(() => new Map(checklistItems.map((item) => [item.id, item])), [checklistItems]);

  useEffect(() => {
    if (activeDocumentId && documents.some((document) => document.id === activeDocumentId)) return;
    setActiveDocumentId(getInitialDocumentId(documents));
  }, [activeDocumentId, documents]);

  const selectedDocument = activeDocumentId
    ? documents.find((document) => document.id === activeDocumentId)
    : undefined;
  const activeDocument = selectedDocument || documents[0] || null;
  const activeIndex = activeDocument ? documents.findIndex((document) => document.id === activeDocument.id) : -1;
  const previewDocuments = activeDocument
    ? [activeDocument, ...documents.filter((document) => document.id !== activeDocument.id)].slice(0, 8)
    : documents.slice(0, 8);

  useEffect(() => {
    if (!isPdfDocument(activeDocument)) {
      setPdfPreviewLoading(false);
      setPdfPreviewError(null);
      setPdfPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        return null;
      });
      return;
    }

    const abortController = new AbortController();
    let objectUrl: string | null = null;

    setPdfPreviewLoading(true);
    setPdfPreviewError(null);
    setPdfPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return null;
    });

    fetch(`/api/document-preview/${activeDocument.id}`, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Preview failed with status ${response.status}`);
        }

        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setPdfPreviewUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        setPdfPreviewError(error instanceof Error ? error.message : "Could not load the PDF preview.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setPdfPreviewLoading(false);
        }
      });

    return () => {
      abortController.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [activeDocument]);

  const groupedDocuments = useMemo(() => {
    return documents.reduce<Record<string, AgencyCaseDocument[]>>((groups, document) => {
      const checklistItem = document.checklistItemId ? checklistById.get(document.checklistItemId) : null;
      const category = getDocumentCategory({
        fileName: document.fileName,
        checklistName: checklistItem?.documentName,
      });
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(document);
      return groups;
    }, {});
  }, [checklistById, documents]);

  function selectPreviousDocument() {
    if (documents.length === 0) return;
    const nextIndex = activeIndex <= 0 ? documents.length - 1 : activeIndex - 1;
    setActiveDocumentId(documents[nextIndex]?.id ?? null);
  }

  function selectNextDocument() {
    if (documents.length === 0) return;
    const nextIndex = activeIndex < 0 || activeIndex >= documents.length - 1 ? 0 : activeIndex + 1;
    setActiveDocumentId(documents[nextIndex]?.id ?? null);
  }

  return (
    <>
      <aside className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-[var(--shadow-dashboard)] xl:min-h-0">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-4">
          <div>
            <h2 className="text-base font-bold">Documents ({documents.length})</h2>
            <p className="text-xs text-muted-foreground">{formatBytes(totalStorage)} uploaded</p>
          </div>
          {applicantId && firstChecklistItemId ? (
            <DocumentUpload
              applicationId={applicationId}
              applicantId={applicantId}
              checklistItemId={firstChecklistItemId}
              label="Upload More"
            />
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {["Identity Documents", "Financial Documents", "Application Documents", "Supporting Documents"].map((group) => {
            const groupDocuments = groupedDocuments[group] ?? [];
            if (groupDocuments.length === 0) return null;

            return (
              <div key={group} className="mb-5 last:mb-0">
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-bold text-foreground">
                  <span>{group}</span>
                  <span className="text-muted-foreground">{groupDocuments.length}</span>
                </div>
                <div className="space-y-1.5">
                  {groupDocuments.map((document) => {
                    const checklistItem = document.checklistItemId ? checklistById.get(document.checklistItemId) : null;
                    const isActive = document.id === activeDocument?.id;

                    return (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => setActiveDocumentId(document.id)}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          isActive
                            ? "border-primary/30 bg-primary/8 text-primary"
                            : "border-transparent bg-muted/25 hover:border-border hover:bg-muted/45",
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background ring-1 ring-border/70">
                          <FileTextIcon className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{document.fileName}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {document.pageCount ?? 1} page{document.pageCount === 1 ? "" : "s"} · {getDocumentMeta(document.mimeType)}
                          </span>
                        </span>
                        {checklistItem && UPLOADED_CHECKLIST_STATUSES.has(checklistItem.status) ? (
                          <CheckCircle2Icon className="h-4 w-4 shrink-0 text-status-success" />
                        ) : (
                          <CircleAlertIcon className="h-4 w-4 shrink-0 text-status-warning" />
                        )}
                        <MoreVerticalIcon className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border/70 px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Storage Used</span>
            <span>{formatBytes(totalStorage)} / 5 GB</span>
          </div>
          <Progress value={Math.min((totalStorage / (5 * 1024 * 1024 * 1024)) * 100, 100)} className="h-1.5" />
        </div>
      </aside>

      <section className="flex min-h-[620px] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-[var(--shadow-dashboard)] xl:min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">{activeDocument?.fileName ?? "No document selected"}</h2>
            <p className="text-xs text-muted-foreground">
              {activeDocument ? `${getDocumentMeta(activeDocument.mimeType)} · ${formatBytes(activeDocument.fileSize)}` : "Upload a document to preview it here."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-full border-status-success/25 bg-status-success/10 text-status-success">
              <ShieldCheckIcon className="mr-1 h-3.5 w-3.5" />
              {activeDocument?.extractionStatus === "completed" ? "Readable" : "Queued"}
            </Badge>
            {activeDocument ? (
              <Button asChild variant="outline" size="icon" className="h-9 w-9 rounded-xl">
                <a href={`/api/document-preview/${activeDocument.id}?download=1`} download={activeDocument.fileName}>
                  <DownloadIcon className="h-4 w-4" />
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 items-center justify-center bg-muted/20",
            isPdfDocument(activeDocument) ? "p-0" : "p-4",
          )}
        >
          {activeDocument ? (
            activeDocument.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- Authenticated document previews are served from an API route and should not be optimized/cached.
              <img
                src={`/api/document-preview/${activeDocument.id}`}
                alt={activeDocument.fileName}
                className="max-h-full max-w-full rounded-lg border border-border/70 bg-background object-contain shadow-sm"
              />
            ) : isPdfDocument(activeDocument) ? (
              <>
                {pdfPreviewLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 text-sm font-semibold text-muted-foreground">
                    <Loader2Icon className="h-8 w-8 animate-spin" />
                    Loading PDF preview
                  </div>
                ) : null}
                {pdfPreviewError ? (
                  <div className="flex max-w-sm flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                    <AlertCircleIcon className="h-9 w-9 text-destructive" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Preview unavailable</p>
                      <p className="mt-1 text-xs">{pdfPreviewError}</p>
                    </div>
                  </div>
                ) : null}
                {pdfPreviewUrl ? (
                  <PdfCanvasPreview
                    blobUrl={pdfPreviewUrl}
                    errorClassName="max-w-sm"
                  />
                ) : null}
              </>
            ) : (
              <iframe
                title={activeDocument.fileName}
                src={`/api/document-preview/${activeDocument.id}`}
                className="h-full min-h-[520px] w-full rounded-lg border border-border/70 bg-background"
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <FileIcon className="h-10 w-10" />
              <p className="text-sm font-semibold">No documents uploaded yet.</p>
            </div>
          )}
        </div>

        {previewDocuments.length > 0 ? (
          <div className="flex items-center gap-2 border-t border-border/70 bg-card px-4 py-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl"
              onClick={selectPreviousDocument}
            >
              <ChevronRightIcon className="h-4 w-4 rotate-180" />
            </Button>
            <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
              {previewDocuments.map((document, index) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => setActiveDocumentId(document.id)}
                  className={cn(
                    "flex h-24 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border bg-background p-1 text-xs font-bold transition-colors",
                    document.id === activeDocument?.id ? "border-primary text-primary" : "border-border/80 text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {document.mimeType.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Authenticated document thumbnails are served from an API route and should not be optimized/cached.
                    <img src={`/api/document-preview/${document.id}`} alt="" className="h-14 w-full rounded object-cover" />
                  ) : isPdfDocument(document) ? (
                    <PdfDocumentThumbnail documentId={document.id} fileName={document.fileName} />
                  ) : (
                    <span className="flex h-14 w-full items-center justify-center rounded bg-muted/40">
                      <FileTextIcon className="h-5 w-5" />
                    </span>
                  )}
                  <span>{index + 1}</span>
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl"
              onClick={selectNextDocument}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </section>
    </>
  );
}
