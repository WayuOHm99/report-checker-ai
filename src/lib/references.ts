export type ReferenceCheckSummary = {
  bibliographyHeading: string | null
  bibliographyEntryCount: number
  numericCitationIds: number[]
  authorYearCitationCount: number
  unmatchedNumericCitationIds: number[]
  potentiallyUncitedEntries: string[]
  warnings: string[]
  aiSummary: {
    bibliographyDetected: boolean
    bibliographyEntryCount: number
    numericCitationCount: number
    authorYearCitationCount: number
    unmatchedNumericCitationCount: number
    potentiallyUncitedEntryCount: number
  }
}

const bibliographyHeadingPattern = /^\s*(เอกสารอ้างอิง|บรรณานุกรม|references|bibliography)\s*:?[\s]*$/i
const numberedEntryPattern = /^\s*(\d+)\s*[.)]\s*(.+)$/
const yearPattern = /\b(?:19|20|24|25)\d{2}[a-z]?\b/i
const numericCitationPattern = /\[(\d+(?:\s*[,;–-]\s*\d+)*)\]/g
const authorYearCitationPattern = /\(([^()\n]{2,80}),\s*(?:19|20|24|25)\d{2}[a-z]?\)/gi
const narrativeAuthorYearPattern = /\b[A-Za-zก-๙][A-Za-zก-๙ .'-]{1,60}\s*\((?:19|20|24|25)\d{2}[a-z]?\)/gi

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right)
}

function getNumericCitations(text: string) {
  const citationIds: number[] = []
  for (const match of text.matchAll(numericCitationPattern)) {
    for (const group of match[1].split(/[,;]/)) {
      const range = group.trim().match(/^(\d+)\s*[–-]\s*(\d+)$/)
      if (range) {
        const start = Number(range[1])
        const end = Number(range[2])
        if (start > 0 && end >= start && end - start <= 100) {
          for (let id = start; id <= end; id += 1) citationIds.push(id)
        }
        continue
      }
      const id = Number(group.trim())
      if (Number.isSafeInteger(id) && id > 0) citationIds.push(id)
    }
  }
  return uniqueSorted(citationIds)
}

export function analyzeReferences(reportText: string): ReferenceCheckSummary {
  const lines = reportText.split(/\r?\n/)
  const bibliographyIndex = lines.findIndex((line) => bibliographyHeadingPattern.test(line))
  const mainText = bibliographyIndex === -1 ? reportText : lines.slice(0, bibliographyIndex).join('\n')
  const bibliographyLines = bibliographyIndex === -1 ? [] : lines.slice(bibliographyIndex + 1).map((line) => line.trim()).filter(Boolean)
  const numericCitationIds = getNumericCitations(mainText)
  const authorYearCitationCount = [...mainText.matchAll(authorYearCitationPattern)].length + [...mainText.matchAll(narrativeAuthorYearPattern)].length

  const numberedEntries = bibliographyLines.flatMap((line) => {
    const match = line.match(numberedEntryPattern)
    return match ? [{ id: Number(match[1]), label: match[2] }] : []
  })
  const referenceEntries = bibliographyLines.filter((line) => numberedEntryPattern.test(line) || yearPattern.test(line))
  const numberedEntryIds = new Set(numberedEntries.map((entry) => entry.id))
  const unmatchedNumericCitationIds = numericCitationIds.filter((id) => !numberedEntryIds.has(id))
  const potentiallyUncitedEntries = numberedEntries
    .filter((entry) => !numericCitationIds.includes(entry.id))
    .map((entry) => `${entry.id}. ${entry.label}`)

  const warnings: string[] = []
  if (bibliographyIndex === -1) warnings.push('ไม่พบหัวข้อ “เอกสารอ้างอิง” หรือ “บรรณานุกรม” ที่ตรวจจับได้')
  if (bibliographyIndex !== -1 && referenceEntries.length === 0) warnings.push('พบหัวข้อบรรณานุกรม แต่ยังไม่พบรายการที่มีรูปแบบปีหรือเลขลำดับ')
  if (numericCitationIds.length > 0 && numberedEntries.length === 0) warnings.push('พบการอ้างอิงแบบตัวเลขในเนื้อหา แต่ไม่พบรายการท้ายเล่มแบบมีเลขลำดับ')
  if (unmatchedNumericCitationIds.length > 0) warnings.push(`เลขอ้างอิงที่อาจไม่มีรายการท้ายเล่ม: ${unmatchedNumericCitationIds.join(', ')}`)
  if (potentiallyUncitedEntries.length > 0) warnings.push(`มีรายการท้ายเล่มที่อาจไม่ได้ถูกอ้างในเนื้อหา ${potentiallyUncitedEntries.length} รายการ`)

  return {
    bibliographyHeading: bibliographyIndex === -1 ? null : lines[bibliographyIndex].trim(),
    bibliographyEntryCount: referenceEntries.length,
    numericCitationIds,
    authorYearCitationCount,
    unmatchedNumericCitationIds,
    potentiallyUncitedEntries,
    warnings,
    aiSummary: {
      bibliographyDetected: bibliographyIndex !== -1,
      bibliographyEntryCount: referenceEntries.length,
      numericCitationCount: numericCitationIds.length,
      authorYearCitationCount,
      unmatchedNumericCitationCount: unmatchedNumericCitationIds.length,
      potentiallyUncitedEntryCount: potentiallyUncitedEntries.length,
    },
  }
}
