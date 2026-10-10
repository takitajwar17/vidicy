"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  MinusIcon,
  PlusIcon,
  RotateCwIcon,
} from "lucide-react";

import { configurePdfJsWorker } from "@/lib/pdfjs-worker";
import { cn } from "@/lib/utils";

interface PdfCanvasPreviewProps {
  blobUrl: string;
  className?: string;
  errorClassName?: string;
  errorMessage?: string;
  minPageWidth?: number;
  controls?: boolean;
}

export function PdfCanvasPreview({
  blobUrl,
  className,
  errorClassName,
  errorMessage = "Could not render the PDF preview.",
  minPageWidth = 320,
  controls = false,
}: PdfCanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

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
        setPageCount(pdf.numPages);

        const firstPage = controls ? Math.min(pageNumber, pdf.numPages) : 1;
        const lastPage = controls ? firstPage : pdf.numPages;
        for (let currentPage = firstPage; currentPage <= lastPage; currentPage += 1) {
          if (cancelled) return;

          const page = await pdf.getPage(currentPage);
          if (cancelled) return;
          const containerWidth = Math.max(container.clientWidth, minPageWidth);
          const pageRotation = (page.rotate + rotation) % 360;
          const baseViewport = page.getViewport({ scale: 1, rotation: pageRotation });
          const scale = (containerWidth / baseViewport.width) * zoom;
          const viewport = page.getViewport({ scale, rotation: pageRotation });
          const outputScale = Math.min(window.devicePixelRatio || 1, 3);
          const canvas = document.createElement("canvas");

          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.style.maxWidth = zoom > 1 ? "none" : "100%";
          canvas.style.display = "block";
          canvas.style.backgroundColor = "white";

          if (currentPage > firstPage) {
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
  }, [blobUrl, errorMessage, minPageWidth, controls, pageNumber, zoom, rotation, width]);

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

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col", className)}>
      {controls ? (
        <div
          className="mb-3 flex flex-wrap items-center justify-center gap-2 text-xs"
          aria-label="PDF controls"
        >
          <button
            type="button"
            aria-label="Previous page"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((value) => value - 1)}
            className="rounded p-1.5 hover:bg-card disabled:opacity-30"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <span>
            Page {pageNumber} of {pageCount || "…"}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={pageNumber >= pageCount}
            onClick={() => setPageNumber((value) => value + 1)}
            className="rounded p-1.5 hover:bg-card disabled:opacity-30"
          >
            <ChevronRightIcon className="size-4" />
          </button>
          <span className="mx-1 h-4 border-l border-border" />
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
            className="rounded p-1.5 hover:bg-card disabled:opacity-30"
          >
            <MinusIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Fit to width"
            onClick={() => setZoom(1)}
            className="min-w-12 rounded px-1 py-1.5 hover:bg-card"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= 2}
            onClick={() => setZoom((value) => Math.min(2, value + 0.25))}
            className="rounded p-1.5 hover:bg-card disabled:opacity-30"
          >
            <PlusIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Rotate page"
            onClick={() => setRotation((value) => (value + 90) % 360)}
            className="rounded p-1.5 hover:bg-card"
          >
            <RotateCwIcon className="size-4" />
          </button>
        </div>
      ) : null}
      <div ref={containerRef} className="min-h-0 w-full flex-1 overflow-auto" />
    </div>
  );
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
