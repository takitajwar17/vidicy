import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildDocumentExtractionPrompt,
  extractTextFromPdf,
  getPdfPageCount,
  renderPdfPagesForExtraction,
} from '@/services/pdf-parser'

// ---------------------------------------------------------------------------
// Mock unpdf so tests don't depend on a real PDF renderer
// ---------------------------------------------------------------------------
vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
  getResolvedPDFJS: vi.fn(),
}))

async function getUnpdfMocks() {
  const unpdf = await import('unpdf')
  return {
    getDocumentProxy: vi.mocked(unpdf.getDocumentProxy),
    extractText: vi.mocked(unpdf.extractText),
    getResolvedPDFJS: vi.mocked(unpdf.getResolvedPDFJS),
  }
}

const originalOffscreenCanvas = globalThis.OffscreenCanvas

function createPdfRenderMocks({ totalPages }: { totalPages: number }) {
  const getPage = vi.fn(async (pageNumber: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: vi.fn(() => ({
      promise: Promise.resolve(),
    })),
    pageNumber,
  }))

  const getDocument = vi.fn(() => ({
    promise: Promise.resolve({
      numPages: totalPages,
      getPage,
    }),
  }))

  return {
    getDocument,
    getPage,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  globalThis.OffscreenCanvas = originalOffscreenCanvas
})

describe('extractTextFromPdf', () => {
  describe('buildDocumentExtractionPrompt', () => {
    it('asks image extraction to describe the image alongside readable text', () => {
      const prompt = buildDocumentExtractionPrompt({ mimeType: 'image/png' })

      expect(prompt).toContain('Describe exactly everything visible in the image')
      expect(prompt).toContain('without guessing intent, purpose, document type, or context')
      expect(prompt).toContain('IMAGE_DESCRIPTION:')
      expect(prompt).toContain('READABLE_TEXT:')
      expect(prompt).not.toContain('passport')
      expect(prompt).not.toContain('visa document')
      expect(prompt).not.toContain('overall scene, layout, objects, people')
      expect(prompt).toContain('NO_EXTRACTABLE_TEXT')
    })
  })

  describe('page-aware PDF helpers', () => {
    it('returns the detected PDF page count', async () => {
      const { getResolvedPDFJS } = await getUnpdfMocks()
      const { getDocument } = createPdfRenderMocks({ totalPages: 3 })

      getResolvedPDFJS.mockResolvedValue({ getDocument } as never)

      await expect(getPdfPageCount(new Uint8Array([1, 2, 3]))).resolves.toBe(3)
    })

    it('renders page images with stable ascending page numbers', async () => {
      const { getResolvedPDFJS } = await getUnpdfMocks()
      const { getDocument, getPage } = createPdfRenderMocks({ totalPages: 3 })

      getResolvedPDFJS.mockResolvedValue({ getDocument } as never)
      globalThis.OffscreenCanvas = class {
        getContext() {
          return {}
        }

        async convertToBlob() {
          return {
            arrayBuffer: async () => new Uint8Array([65, 66, 67]).buffer,
          } as Blob
        }
      } as unknown as typeof OffscreenCanvas

      const result = await renderPdfPagesForExtraction({
        bytes: new Uint8Array([1, 2, 3]),
        maxPages: 2,
      })

      expect(result.success).toBe(true)
      expect(result.pageCount).toBe(3)
      expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2])
      expect(result.pages.every((page) => page.imageDataUrl.startsWith('data:image/jpeg;base64,'))).toBe(true)
      expect(getPage).toHaveBeenCalledTimes(2)
    })
  })

  describe('successful extraction', () => {
    it('returns success=true and trimmed text for a normal PDF', async () => {
      const { getDocumentProxy, extractText } = await getUnpdfMocks()
      const fakeProxy = {}
      getDocumentProxy.mockResolvedValue(fakeProxy as never)
      extractText.mockResolvedValue({ text: '  Hello, world!  ' } as never)

      const result = await extractTextFromPdf(new Uint8Array([1, 2, 3]))

      expect(result.success).toBe(true)
      expect(result.text).toBe('Hello, world!')
      expect(result.error).toBeUndefined()
    })

    it('accepts short text (< 20 chars) — short legitimate PDFs must not be rejected', async () => {
      const { getDocumentProxy, extractText } = await getUnpdfMocks()
      getDocumentProxy.mockResolvedValue({} as never)
      extractText.mockResolvedValue({ text: 'OK' } as never)

      const result = await extractTextFromPdf(new Uint8Array([1]))

      expect(result.success).toBe(true)
      expect(result.text).toBe('OK')
    })

    it('accepts a single-character text', async () => {
      const { getDocumentProxy, extractText } = await getUnpdfMocks()
      getDocumentProxy.mockResolvedValue({} as never)
      extractText.mockResolvedValue({ text: 'X' } as never)

      const result = await extractTextFromPdf(new Uint8Array([1]))

      expect(result.success).toBe(true)
      expect(result.text).toBe('X')
    })

    it('trims leading and trailing whitespace from extracted text', async () => {
      const { getDocumentProxy, extractText } = await getUnpdfMocks()
      getDocumentProxy.mockResolvedValue({} as never)
      extractText.mockResolvedValue({ text: '\n\n  Invoice #1234\n\n' } as never)

      const result = await extractTextFromPdf(new Uint8Array([1]))

      expect(result.success).toBe(true)
      expect(result.text).toBe('Invoice #1234')
    })
  })

  describe('scanned / image-only PDFs', () => {
    it('returns success=false when extracted text is empty string', async () => {
      const { getDocumentProxy, extractText } = await getUnpdfMocks()
      getDocumentProxy.mockResolvedValue({} as never)
      extractText.mockResolvedValue({ text: '' } as never)

      const result = await extractTextFromPdf(new Uint8Array([1]))

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toMatch(/scanned or image-only/i)
    })

    it('returns success=false when extracted text is only whitespace', async () => {
      const { getDocumentProxy, extractText } = await getUnpdfMocks()
      getDocumentProxy.mockResolvedValue({} as never)
      extractText.mockResolvedValue({ text: '   \n\t  ' } as never)

      const result = await extractTextFromPdf(new Uint8Array([1]))

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
    })

    it('returns success=false when extractText returns null text', async () => {
      const { getDocumentProxy, extractText } = await getUnpdfMocks()
      getDocumentProxy.mockResolvedValue({} as never)
      extractText.mockResolvedValue({ text: null } as never)

      const result = await extractTextFromPdf(new Uint8Array([1]))

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
    })
  })

  describe('corrupt / encrypted PDFs', () => {
    it('returns success=false with the error message when getDocumentProxy throws', async () => {
      const { getDocumentProxy } = await getUnpdfMocks()
      getDocumentProxy.mockRejectedValue(new Error('Invalid PDF structure') as never)

      const result = await extractTextFromPdf(new Uint8Array([0xff, 0xfe]))

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toBe('Invalid PDF structure')
    })

    it('returns success=false with the error message when extractText throws', async () => {
      const { getDocumentProxy, extractText } = await getUnpdfMocks()
      getDocumentProxy.mockResolvedValue({} as never)
      extractText.mockRejectedValue(new Error('PasswordException: Encrypted') as never)

      const result = await extractTextFromPdf(new Uint8Array([1]))

      expect(result.success).toBe(false)
      expect(result.text).toBe('')
      expect(result.error).toBe('PasswordException: Encrypted')
    })

    it('handles non-Error thrown values gracefully', async () => {
      const { getDocumentProxy } = await getUnpdfMocks()
      getDocumentProxy.mockRejectedValue('something went wrong' as never)

      const result = await extractTextFromPdf(new Uint8Array([1]))

      expect(result.success).toBe(false)
      expect(result.error).toBe('something went wrong')
    })
  })
})
