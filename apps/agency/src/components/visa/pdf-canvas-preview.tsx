"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircleIcon, FileTextIcon } from "lucide-react";

import { configurePdfJsWorker } from "@/lib/pdfjs-worker";
import { cn } from "@/lib/utils";

interface PdfCanvasPreviewProps {
  blobUrl: string;
  className?: string;
  errorClassName?: string;
  errorMessage?: string;
  minPageWidth?: number;
}

export function PdfCanvasPreview({
  blobUrl,
  className,
  errorClassName,
  errorMessage = "Could not render the PDF preview.",
  minPageWidth = 320,
}: PdfCanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let destroyLoadingTask: (() => void) | null = null;

    container.replaceChildren();
    setRenderError(null);

    import("pdfjs-dist")
      .then(async (pdfjsLib) => {
        configurePdfJsWorker(pdfjsLib);

        const loadingTask = pdfjsLib.getDocument(blobUrl);
        destroyLoadingTask = () => {
          void loadingTask.destroy();
        };

        const pdf = await loadingTask.promise;
        if (cancelled) return;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await pdf.getPage(pageNumber);
          const containerWidth = Math.max(container.clientWidth, minPageWidth);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = containerWidth / baseViewport.width;
          const viewport = page.getViewport({ scale });
          const outputScale = Math.min(window.devicePixelRatio || 1, 3);
          const canvas = document.createElement("canvas");

          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.style.maxWidth = "100%";
          canvas.style.display = "block";
          canvas.style.backgroundColor = "white";

          if (pageNumber > 1) {
            const spacer = document.createElement("div");
            spacer.style.height = "16px";
            container.appendChild(spacer);
          }

          container.appendChild(canvas);
          await page.render({
            canvas,
            viewport,
            transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
          }).promise;
        }
      })
      .catch(() => {
        if (!cancelled) setRenderError(errorMessage);
      });

    return () => {
      cancelled = true;
      container.replaceChildren();
      destroyLoadingTask?.();
    };
  }, [blobUrl, errorMessage, minPageWidth]);

  if (renderError) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground",
          errorClassName,
        )}
      >
        <AlertCircleIcon className="h-8 w-8 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Preview unavailable</p>
          <p className="text-xs">{renderError}</p>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className={cn("h-full w-full overflow-y-auto", className)} />;
}

interface PdfDocumentThumbnailProps {
  documentId: string;
  fileName: string;
  className?: string;
}

export function PdfDocumentThumbnail({
  documentId,
  fileName,
  className,
}: PdfDocumentThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const abortController = new AbortController();
    let cancelled = false;
    let destroyLoadingTask: (() => void) | null = null;

    container.replaceChildren();
    setFailed(false);

    fetch(`/api/document-preview/${documentId}`, { signal: abortController.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Thumbnail failed with status ${response.status}`);
        }

        return response.arrayBuffer();
      })
      .then(async (buffer) => {
        const pdfjsLib = await import("pdfjs-dist");
        configurePdfJsWorker(pdfjsLib);

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        destroyLoadingTask = () => {
          void loadingTask.destroy();
        };

        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        const containerWidth = Math.max(container.clientWidth, 1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = containerWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const outputScale = Math.min(window.devicePixelRatio || 1, 3);
        const canvas = document.createElement("canvas");

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.style.display = "block";
        canvas.style.backgroundColor = "white";

        container.appendChild(canvas);
        await page.render({
          canvas,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;
      })
      .catch(() => {
        if (!abortController.signal.aborted && !cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
      container.replaceChildren();
      destroyLoadingTask?.();
    };
  }, [documentId]);

  if (failed) {
    return (
      <span className="flex h-14 w-full items-center justify-center rounded bg-muted/40">
        <FileTextIcon className="h-5 w-5" />
      </span>
    );
  }

  return (
    <span
      ref={containerRef}
      aria-label={`${fileName} thumbnail`}
      className={cn("block h-14 w-full overflow-hidden rounded bg-white", className)}
    />
  );
}
