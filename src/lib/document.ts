export const MAX_ANALYSIS_CHARS = 200_000
export const MAX_RAW_CHARS = 300_000
export const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * A PDF can stay well under the size limit while still holding thousands of
 * pages, and extraction runs one `getTextContent()` per page on the main
 * thread. Capping pages bounds that work; 400 pages comfortably covers a thesis
 * while keeping a hostile file from freezing the tab.
 */
export const MAX_PDF_PAGES = 400

export const PDF_LIMITS_LABEL = `ไม่เกิน ${MAX_FILE_BYTES / (1024 * 1024)} MB และไม่เกิน ${MAX_PDF_PAGES.toLocaleString()} หน้า`

export function pdfPageLimitMessage(pageCount: number) {
  return `ไฟล์นี้มี ${pageCount.toLocaleString()} หน้า เกินขีดจำกัด ${MAX_PDF_PAGES.toLocaleString()} หน้า ระบบจึงหยุดอ่านก่อนดึงข้อความ และยังไม่ได้ส่งข้อมูลส่วนใดออกจากเครื่องคุณ โปรดแบ่งไฟล์หรือวางเฉพาะเนื้อหาที่ต้องการตรวจ`
}

export type PreparedDocument = {
  mainText: string
  appendixText: string
  appendixHeading: string | null
  excludedCharCount: number
}

const appendixHeadingPattern = /^\s*(ภาคผนวก(?:\s+[ก-ฮA-Z0-9]+)?|appendix(?:\s+[A-Z0-9]+)?)\s*:?\s*$/i

export function prepareDocument(reportText: string): PreparedDocument {
  const lines = reportText.split(/\r?\n/)
  const appendixIndex = lines.findIndex((line) => appendixHeadingPattern.test(line))

  if (appendixIndex === -1) {
    return { mainText: reportText.trim(), appendixText: '', appendixHeading: null, excludedCharCount: 0 }
  }

  const mainText = lines.slice(0, appendixIndex).join('\n').trim()
  const appendixText = lines.slice(appendixIndex).join('\n').trim()
  return {
    mainText,
    appendixText,
    appendixHeading: lines[appendixIndex].trim(),
    excludedCharCount: appendixText.length,
  }
}

export function isLikelyPdf(file: Pick<File, 'name' | 'type'>) {
  const normalizedType = file.type.toLowerCase()
  return file.name.toLowerCase().endsWith('.pdf') && (
    normalizedType === '' ||
    normalizedType === 'application/pdf' ||
    normalizedType === 'application/octet-stream'
  )
}
