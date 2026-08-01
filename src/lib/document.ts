export const MAX_ANALYSIS_CHARS = 200_000
export const MAX_RAW_CHARS = 300_000

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
