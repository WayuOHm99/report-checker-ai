import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

import { MAX_PDF_PAGES, pdfPageLimitMessage } from './document'

export type PdfExtraction = {
  pageCount: number
  text: string
  warnings: string[]
}

export type PdfExtractionOptions = {
  signal?: AbortSignal
  onProgress?: (completedPages: number, totalPages: number) => void
}

type PositionedText = {
  text: string
  x: number
  y: number
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('ยกเลิกการอ่าน PDF', 'AbortError')
}

function removeHiddenControlCharacters(value: string) {
  let removed = 0
  const text = [...value].filter((character) => {
    const code = character.codePointAt(0) ?? 0
    const hiddenControl = code < 32 && code !== 9 && code !== 10 && code !== 13
    if (hiddenControl) removed += 1
    return !hiddenControl
  }).join('')
  return { text, removed }
}

function rebuildPageText(items: PositionedText[]) {
  const lines: Array<{ y: number; items: PositionedText[] }> = []
  for (const item of items) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3)
    if (line) line.items.push(item)
    else lines.push({ y: item.y, items: [item] })
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(' '))
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim()
}

function looksMultiColumn(items: PositionedText[], pageWidth: number) {
  const lines = new Map<number, number[]>()
  for (const item of items) {
    const key = Math.round(item.y / 3) * 3
    lines.set(key, [...(lines.get(key) ?? []), item.x].sort((left, right) => left - right))
  }

  let linesWithWideGap = 0
  for (const positions of lines.values()) {
    if (positions.some((position, index) => index > 0 && position - positions[index - 1] > pageWidth * 0.22)) linesWithWideGap += 1
  }
  return linesWithWideGap >= 3
}

export async function extractPdfText(file: File, options: PdfExtractionOptions = {}): Promise<PdfExtraction> {
  throwIfAborted(options.signal)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const signature = new TextDecoder('ascii').decode(bytes.slice(0, 5))
  if (signature !== '%PDF-') throw new Error('ไฟล์ไม่มีโครงสร้าง PDF ที่ถูกต้อง')

  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const loadingTask = getDocument({ data: bytes })

  try {
    const pdf = await loadingTask.promise
    // Checked before the extraction loop starts, so an oversized document costs
    // one document open rather than thousands of page renders. The `finally`
    // block below still destroys the loading task.
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(pdfPageLimitMessage(pdf.numPages))
    const pages: string[] = []
    let multiColumnPages = 0

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      throwIfAborted(options.signal)
      const page = await pdf.getPage(pageNumber)
      const [content, viewport] = await Promise.all([page.getTextContent(), Promise.resolve(page.getViewport({ scale: 1 }))])
      const positionedItems = content.items.flatMap((item): PositionedText[] => {
        if (!('str' in item) || !item.str.trim()) return []
        return [{ text: item.str, x: item.transform[4], y: item.transform[5] }]
      })
      if (looksMultiColumn(positionedItems, viewport.width)) multiColumnPages += 1
      pages.push(rebuildPageText(positionedItems))
      options.onProgress?.(pageNumber, pdf.numPages)
    }

    const rawText = pages.join('\n\n')
    const cleanedText = removeHiddenControlCharacters(rawText)
    const controlCharacterCount = cleanedText.removed
    const text = cleanedText.text
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
    if (controlCharacterCount > 0) {
      warnings.push('พบและนำอักขระควบคุมที่มองไม่เห็นออกจากข้อความ โปรดตรวจคำภาษาไทยและสระวรรณยุกต์ก่อนยืนยัน')
    }
    if (multiColumnPages > 0) {
      warnings.push(`ตรวจพบรูปแบบที่อาจมีหลายคอลัมน์ ${multiColumnPages} หน้า ลำดับข้อความอาจคลาดเคลื่อน โปรดตรวจตัวอย่างก่อนส่ง`)
    }

    return { pageCount: pdf.numPages, text, warnings }
  } finally {
    await loadingTask.destroy()
  }
}
