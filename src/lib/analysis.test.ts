import { describe, expect, it } from 'vitest'

import { analysisResultSchema, createMockAnalysis, formatAnalysisResult } from './analysis'
import { analyzeReferences } from './references'
import { cloneRubricTemplate, DEFAULT_RUBRIC_TEMPLATE_ID } from './rubric'

describe('analysis result handling', () => {
  it('formats a complete result for copying or download', () => {
    const rubric = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
    const result = createMockAnalysis(rubric.sections, analyzeReferences('บทนำ'), rubric.version)
    const text = formatAnalysisResult(result)
    expect(text).toContain('คะแนนรวม:')
    expect(text).toContain('ข้อมูลหรือหลักฐานที่อาจยังขาด:')
    expect(text).toContain('ใช้ช่วยทบทวนเท่านั้น')
  })

  it('rejects blank AI strings instead of rendering empty result rows', () => {
    const rubric = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
    const result = createMockAnalysis(rubric.sections, analyzeReferences('บทนำ'), rubric.version)
    const invalid = { ...result, sections: [{ ...result.sections[0], missing: ['   '] }] }
    expect(analysisResultSchema.safeParse(invalid).success).toBe(false)
  })
})
