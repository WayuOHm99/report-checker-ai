import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export type PdfExtraction = {
  pageCount: number
  text: string
  warnings: string[]
}

export async function extractPdfText(file: File): Promise<PdfExtraction> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = getDocument({ data: bytes })

  try {
    const pdf = await loadingTask.promise
    const pages: string[] = []

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+\n/g, '\n')
        .trim()
      pages.push(pageText)
    }

    const text = pages.join('\n\n')
    const nonWhitespaceLength = text.replace(/\s/g, '').length
    const replacementCharacters = (text.match(/[\uFFFD]/g) ?? []).length
    const warnings: string[] = []

    if (nonWhitespaceLength === 0) {
      warnings.push('ไม่พบ text layer ใน PDF นี้ ซึ่งอาจเป็น PDF สแกน ระบบ MVP จะไม่ทำ OCR โปรดวางข้อความแทน')
    } else if (nonWhitespaceLength < Math.max(80, pdf.numPages * 20)) {
      warnings.push('ข้อความที่ดึงได้มีน้อยเมื่อเทียบกับจำนวนหน้า โปรดตรวจตัวอย่าง เพราะ PDF อาจเป็นภาพสแกนหรือดึงข้อความได้ไม่ครบ')
    }

    if (replacementCharacters > 0) {
      warnings.push('พบอักขระที่อ่านไม่ได้ในข้อความที่ดึงมา โปรดตรวจและแก้ไขก่อนยืนยัน')
    }

    return { pageCount: pdf.numPages, text, warnings }
  } finally {
    await loadingTask.destroy()
  }
}
