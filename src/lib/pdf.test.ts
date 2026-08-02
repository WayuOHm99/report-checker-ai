import { beforeEach, describe, expect, it, vi } from 'vitest'

const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  destroy: vi.fn(),
  getPage: vi.fn(),
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'blob:pdf-worker' }))
vi.mock('pdfjs-dist', () => ({
  getDocument: pdfMocks.getDocument,
  GlobalWorkerOptions: { workerSrc: '' },
}))

import { MAX_PDF_PAGES } from './document'
import { extractPdfText } from './pdf'

/** A File whose bytes start with a valid PDF signature; page count comes from the mock. */
function fakePdfFile() {
  return new File([new TextEncoder().encode('%PDF-1.7 stub')], 'report.pdf', { type: 'application/pdf' })
}

function mockPdfWithPages(numPages: number) {
  pdfMocks.getPage.mockImplementation(() => Promise.resolve({
    getTextContent: () => Promise.resolve({ items: [{ str: 'เนื้อหา', transform: [1, 0, 0, 1, 48, 700] }] }),
    getViewport: () => ({ width: 595 }),
  }))
  pdfMocks.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages, getPage: pdfMocks.getPage }),
    destroy: pdfMocks.destroy,
  })
}

describe('extractPdfText page limit', () => {
  beforeEach(() => {
    pdfMocks.getDocument.mockReset()
    pdfMocks.destroy.mockReset()
    pdfMocks.getPage.mockReset()
  })

  it('rejects a PDF over the page limit before extracting any page', async () => {
    mockPdfWithPages(MAX_PDF_PAGES + 1)

    await expect(extractPdfText(fakePdfFile())).rejects.toThrow(new RegExp(`${MAX_PDF_PAGES.toLocaleString()} หน้า`))
    expect(pdfMocks.getPage).not.toHaveBeenCalled()
  })

  it('still releases the pdf.js loading task when the page limit stops extraction', async () => {
    mockPdfWithPages(MAX_PDF_PAGES + 500)

    await expect(extractPdfText(fakePdfFile())).rejects.toThrow()
    expect(pdfMocks.destroy).toHaveBeenCalledTimes(1)
  })

  it('extracts a document that sits exactly on the limit', async () => {
    mockPdfWithPages(MAX_PDF_PAGES)
    const progress = vi.fn()

    const extraction = await extractPdfText(fakePdfFile(), { onProgress: progress })

    expect(extraction.pageCount).toBe(MAX_PDF_PAGES)
    expect(pdfMocks.getPage).toHaveBeenCalledTimes(MAX_PDF_PAGES)
    expect(progress).toHaveBeenLastCalledWith(MAX_PDF_PAGES, MAX_PDF_PAGES)
  })

  it('rejects a file that is not a PDF before opening it', async () => {
    const notPdf = new File([new TextEncoder().encode('hello world')], 'notes.pdf', { type: 'application/pdf' })
    await expect(extractPdfText(notPdf)).rejects.toThrow('ไฟล์ไม่มีโครงสร้าง PDF ที่ถูกต้อง')
    expect(pdfMocks.getDocument).not.toHaveBeenCalled()
  })

  it('stops before opening the document when the caller already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(extractPdfText(fakePdfFile(), { signal: controller.signal })).rejects.toThrow('ยกเลิกการอ่าน PDF')
    expect(pdfMocks.getDocument).not.toHaveBeenCalled()
  })
})
