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

  it('recognizes Buddhist Era years used in Thai reports', () => {
    const result = analyzeReferences('แนวคิดนี้ได้รับการศึกษาแล้ว (สมชาย ใจดี, 2566)\n\nบรรณานุกรม\nสมชาย ใจดี. (2566). งานวิจัยตัวอย่าง')

    expect(result.authorYearCitationCount).toBe(1)
    expect(result.bibliographyEntryCount).toBe(1)
  })

  it('expands numeric citation ranges', () => {
    const result = analyzeReferences('เนื้อหาอ้างอิง [1-3]\n\nเอกสารอ้างอิง\n1. หนึ่ง 2024\n2. สอง 2024\n3. สาม 2024')

    expect(result.numericCitationIds).toEqual([1, 2, 3])
    expect(result.unmatchedNumericCitationIds).toEqual([])
  })

  it('recognizes an inline bibliography heading after a sentence', () => {
    const result = analyzeReferences('สรุปผลการศึกษาเรียบร้อยแล้ว. เอกสารอ้างอิง กรมทรัพยากรน้ำ. (2567). แนวทางการใช้น้ำอย่างประหยัด')

    expect(result.bibliographyHeading).toBe('เอกสารอ้างอิง')
    expect(result.bibliographyEntryCount).toBe(1)
    expect(result.aiSummary.bibliographyDetected).toBe(true)
    expect(result.warnings).not.toContain('ไม่พบหัวข้อ “เอกสารอ้างอิง” หรือ “บรรณานุกรม” ที่ตรวจจับได้')
  })
})
