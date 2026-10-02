type PdfJsModule = typeof import("pdfjs-dist")

const pdfWorkerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()

export function configurePdfJsWorker(pdfjsLib: PdfJsModule) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc
}
