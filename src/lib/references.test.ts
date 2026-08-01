import { describe, expect, it } from 'vitest'

import { analyzeReferences } from './references'

describe('analyzeReferences', () => {
  it('compares numeric citations against numbered bibliography entries', () => {
    const result = analyzeReferences(`บทนำอ้างอิง [1] และ [3]\n\nเอกสารอ้างอิง\n1. Somchai, A. (2024). ตัวอย่าง\n2. Suda, B. (2023). รายการที่ยังไม่ถูกอ้าง`)

    expect(result.bibliographyEntryCount).toBe(2)
    expect(result.numericCitationIds).toEqual([1, 3])
    expect(result.unmatchedNumericCitationIds).toEqual([3])
    expect(result.potentiallyUncitedEntries).toEqual(['2. Suda, B. (2023). รายการที่ยังไม่ถูกอ้าง'])
  })

  it('recognizes author-year citations and reports a missing bibliography heading', () => {
    const result = analyzeReferences('จากการศึกษาของ Somchai (2024) พบว่าแนวทางนี้ใช้ได้')

    expect(result.authorYearCitationCount).toBe(1)
    expect(result.warnings).toContain('ไม่พบหัวข้อ “เอกสารอ้างอิง” หรือ “บรรณานุกรม” ที่ตรวจจับได้')
  })
})
