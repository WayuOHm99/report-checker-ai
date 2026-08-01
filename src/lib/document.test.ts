import { describe, expect, it } from 'vitest'

import { isLikelyPdf, prepareDocument } from './document'

describe('document preparation', () => {
  it('separates a Thai appendix without silently changing the main report', () => {
    const prepared = prepareDocument('บทนำ\nเนื้อหาหลัก\n\nภาคผนวก ก\nแบบสอบถาม')

    expect(prepared.mainText).toBe('บทนำ\nเนื้อหาหลัก')
    expect(prepared.appendixHeading).toBe('ภาคผนวก ก')
    expect(prepared.appendixText).toContain('แบบสอบถาม')
    expect(prepared.excludedCharCount).toBeGreaterThan(0)
  })

  it('recognizes English appendix headings', () => {
    expect(prepareDocument('Main report\nAppendix A:\nRaw data').appendixHeading).toBe('Appendix A:')
  })

  it('accepts PDF files with browser-safe fallback MIME values', () => {
    expect(isLikelyPdf({ name: 'report.pdf', type: '' })).toBe(true)
    expect(isLikelyPdf({ name: 'report.pdf', type: 'application/octet-stream' })).toBe(true)
    expect(isLikelyPdf({ name: 'report.txt', type: 'application/pdf' })).toBe(false)
  })
})
