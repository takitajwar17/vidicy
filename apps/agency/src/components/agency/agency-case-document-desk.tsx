"use client";

import { NativeSelect } from "@/components/ui/native-select";

import { useEffect, useState } from "react";
import { AlertCircleIcon, DownloadIcon, FileTextIcon, Loader2Icon } from "lucide-react";
import { DocumentUpload } from "@/components/visa/document-upload";
import { PdfCanvasPreview } from "@/components/visa/pdf-canvas-preview";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/components/agency/agency-ui";
import styles from "./agency-case-workspace.module.css";

export interface AgencyCaseDocument {
  id: string;
  applicantId: string | null;
  checklistItemId: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  pageCount: number | null;
  extractionStatus: string;
}

interface AgencyCaseDocumentDeskProps {
  applicationId: string;
  document: AgencyCaseDocument | null;
  documents: AgencyCaseDocument[];
  onSelectDocument: (id: string) => void;
  noSource: boolean;
}

export function AgencyCaseDocumentDesk({
  applicationId,
  document,
  documents,
  onSelectDocument,
  noSource,
}: AgencyCaseDocumentDeskProps) {
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const documentId = document?.id;
  const isPdf = document?.mimeType === "application/pdf";

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!documentId || !isPdf) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch(`/api/document-preview/${documentId}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load this document. Try selecting it again.");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ id: documentId, url: objectUrl });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("The document preview could not be loaded.");
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId, isPdf, retry]);

  return (
    <section className={styles.evidence} aria-label="Supporting evidence">
      <div className={styles.evidenceHeading}>
        <h2>Evidence</h2>
        <NativeSelect
          aria-label="Select evidence document"
          value={document?.id ?? ""}
          onChange={(event) => onSelectDocument(event.target.value)}
        >
          <option value="" disabled>
            {noSource ? "No linked file" : "Select a document"}
          </option>
          {documents.map((file) => (
            <option key={file.id} value={file.id}>
              {file.fileName}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className={styles.viewer}>
        {document ? (
          <div className={styles.viewerToolbar}>
            <span className="min-w-0 truncate" title={document.fileName}>
              {document.fileName} · {formatBytes(document.fileSize)}
            </span>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <a
                  href={`/api/document-preview/${document.id}?download=1`}
                  download={document.fileName}
                  aria-label={`Download ${document.fileName}`}
                >
                  <DownloadIcon />
                  Download
                </a>
              </Button>
              {document.checklistItemId && document.applicantId ? (
                <DocumentUpload
                  key={document.id}
                  applicationId={applicationId}
                  applicantId={document.applicantId}
                  checklistItemId={document.checklistItemId}
                  label="Replace file"
                />
              ) : null}
            </div>
          </div>
        ) : null}
        <div className={styles.viewerCanvas}>
          {!document ? (
            <div className={styles.previewState}>
              <FileTextIcon />
              <p>{noSource ? "This finding has no linked file." : "No documents uploaded yet."}</p>
              <p>Select a file above, or use the checklist to upload the required evidence.</p>
            </div>
          ) : document.mimeType.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- Private previews must use the authenticated API without image caching.
            <img
              src={`/api/document-preview/${document.id}`}
              alt={document.fileName}
              className="mx-auto max-w-full bg-white"
            />
          ) : isPdf ? (
            error ? (
              <div className={styles.previewState} role="alert">
                <AlertCircleIcon />
                <p>{error}</p>
                <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
                  Retry preview
                </Button>
                <a href={`/api/document-preview/${document.id}?download=1`} className="underline">
                  Download the file
                </a>
              </div>
            ) : preview?.id === document.id ? (
              <PdfCanvasPreview key={preview.url} blobUrl={preview.url} controls minPageWidth={1} />
            ) : (
              <div className={styles.previewState} role="status">
                <Loader2Icon className="animate-spin" />
                <p>Loading PDF preview</p>
              </div>
            )
          ) : (
            <div className={styles.previewState}>
              <FileTextIcon />
              <p>Preview is not available for this file type.</p>
              <a href={`/api/document-preview/${document.id}?download=1`} className="underline">
                Download the file
              </a>
            </div>
          )}
        </div>
      </div>
      <section className={styles.documents} aria-label="Case documents">
        <h3 className="font-semibold">Documents ({documents.length})</h3>
        <div className={styles.documentList}>
          {documents.map((file) => (
            <button
              key={file.id}
              type="button"
              aria-pressed={document?.id === file.id}
              onClick={() => onSelectDocument(file.id)}
            >
              <span className="min-w-0 truncate">{file.fileName}</span>
              <small>
                {file.extractionStatus === "completed"
                  ? "Text extracted"
                  : file.extractionStatus === "failed"
                    ? "Extraction failed"
                    : "Extraction pending"}
              </small>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
