import { describe, expect, it } from 'vitest'

import {
  analysisResultSchema, createMockAnalysis, formatAnalysisResult, formatOverallScore,
  INCOMPATIBLE_VERSION_MESSAGE, LEGACY_RESPONSE_WARNING, NO_APPLICABLE_SECTIONS_LABEL, NOT_APPLICABLE_BADGE, parseAnalysisResponse,
} from './analysis'
import { analyzeReferences } from './references'
import { cloneRubricTemplate, DEFAULT_RUBRIC_TEMPLATE_ID } from './rubric'
import { API_VERSION } from '../../shared/api-contract'
import { calculateOverallScore } from '../../shared/scoring'

function buildResult(overrides: Record<string, unknown> = {}) {
  const rubric = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
  return { ...createMockAnalysis(rubric.sections, analyzeReferences('บทนำ'), rubric.version, rubric.documentType), ...overrides }
}

describe('analysis result handling', () => {
  it('formats a complete result for copying or download', () => {
    const rubric = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
    const result = createMockAnalysis(rubric.sections, analyzeReferences('บทนำ'), rubric.version, rubric.documentType)
    const text = formatAnalysisResult(result)
    expect(text).toContain('คะแนนรวม:')
    expect(text).toContain('ผลตรวจรายงานทั่วไป จาก RubricLens AI')
    expect(text).toContain('ประเภทงาน: รายงานทั่วไป')
    expect(text).toContain('ความสอดคล้องของเอกสาร (วัตถุประสงค์ · เนื้อหา · การวิเคราะห์ · สรุปผล):')
    expect(text).toContain('ข้อมูลหรือหลักฐานที่อาจยังขาด:')
    expect(text).toContain('ใช้ช่วยทบทวนเท่านั้น')
  })

  it('names the project document type and its own consistency dimensions in the export', () => {
    const rubric = cloneRubricTemplate('project-th-v1')
    const text = formatAnalysisResult(createMockAnalysis(rubric.sections, analyzeReferences('บทนำ'), rubric.version, rubric.documentType))
    expect(text).toContain('ผลตรวจโครงงาน จาก RubricLens AI')
    expect(text).toContain('ประเภทงาน: โครงงาน')
    expect(text).toContain('ความสอดคล้องของเอกสาร (ปัญหา · วัตถุประสงค์ · วิธีทำ · ผลงาน · การทดสอบ · สรุปผล):')
  })

  it('rejects blank AI strings instead of rendering empty result rows', () => {
    const rubric = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
    const result = createMockAnalysis(rubric.sections, analyzeReferences('บทนำ'), rubric.version, rubric.documentType)
    const invalid = { ...result, sections: [{ ...result.sections[0], missing: ['   '] }] }
    expect(analysisResultSchema.safeParse(invalid).success).toBe(false)
  })
})

describe('weighted scoring with not-applicable sections', () => {
  it('excludes a not-applicable section from both sides of the fraction', () => {
    const score = calculateOverallScore([
      { score: 3, weight: 2, applicability: 'applicable' },
      { score: 0, weight: 8, applicability: 'not_applicable' },
    ])
    expect(score).toEqual({ overallScore: 100, applicableSectionCount: 1, notApplicableSectionCount: 1, scoredWeight: 2 })
  })

  it('reports no score rather than 0% when nothing applies', () => {
    const score = calculateOverallScore([
      { score: 0, weight: 3, applicability: 'not_applicable' },
      { score: 0, weight: 1, applicability: 'not_applicable' },
    ])
    expect(score.overallScore).toBeNull()
    expect(score.applicableSectionCount).toBe(0)
    expect(formatOverallScore({ overallScore: score.overallScore })).toBe(NO_APPLICABLE_SECTIONS_LABEL)
  })

  it('still scores 0% when applicable sections genuinely scored zero', () => {
    expect(calculateOverallScore([{ score: 0, weight: 2, applicability: 'applicable' }]).overallScore).toBe(0)
  })

  it('marks a not-applicable section in the exported text instead of a score', () => {
    const result = buildResult()
    const withNotApplicable = {
      ...result,
      overallScore: null,
      scoreSummary: { applicableSectionCount: 0, notApplicableSectionCount: 1, scoredWeight: 0 },
      sections: [{ ...result.sections[0], applicability: 'not_applicable' as const, score: 0, evidence: [], missing: [] }],
    }
    const text = formatAnalysisResult(withNotApplicable)

    expect(text).toContain(`คะแนนรวม: ${NO_APPLICABLE_SECTIONS_LABEL}`)
    expect(text).toContain(`— ${NOT_APPLICABLE_BADGE}`)
    expect(text).toContain('หัวข้อที่ไม่เกี่ยวข้อง: 1')
    expect(text).not.toContain('หลักฐานที่พบ:')
  })
})

describe('API version contract', () => {
  it('accepts a response stamped with the version this bundle speaks', () => {
    const parsed = parseAnalysisResponse(buildResult())
    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.result.apiVersion).toBe(API_VERSION)
  })

  it('refuses a newer API version instead of rendering it partially', () => {
    const parsed = parseAnalysisResponse(buildResult({ apiVersion: API_VERSION + 1 }))
    expect(parsed).toMatchObject({ ok: false, code: 'INCOMPATIBLE_VERSION', message: INCOMPATIBLE_VERSION_MESSAGE, retryable: false })
  })

  it('refuses a non-numeric API version', () => {
    expect(parseAnalysisResponse(buildResult({ apiVersion: 'one' }))).toMatchObject({ ok: false, code: 'INCOMPATIBLE_VERSION' })
  })

  it('reads a pre-version response during a rolling deployment and says so', () => {
    const current = buildResult()
    const legacy = {
      overallScore: current.overallScore,
      sections: current.sections.map(({ applicability: _applicability, ...section }) => section),
      qualityWarnings: [], consistencyNotes: current.consistencyNotes, referenceComment: current.referenceComment,
      model: current.model, rubricVersion: current.rubricVersion,
    }
    const parsed = parseAnalysisResponse(legacy)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.result.apiVersion).toBe(0)
    expect(parsed.result.documentType).toBe('project')
    expect(parsed.result.overallScore).toBe(current.overallScore)
    expect(parsed.result.sections.every((section) => section.applicability === 'applicable')).toBe(true)
    expect(parsed.result.scoreSummary.notApplicableSectionCount).toBe(0)
    expect(parsed.result.qualityWarnings).toContain(LEGACY_RESPONSE_WARNING)
  })

  it('rejects a versioned response whose body does not match the contract', () => {
    expect(parseAnalysisResponse({ apiVersion: API_VERSION, overallScore: 90, sections: [] })).toMatchObject({ ok: false, code: 'INVALID_RESPONSE', retryable: true })
  })

  it('rejects a legacy-looking response that is missing required fields', () => {
    expect(parseAnalysisResponse({ overallScore: 90, sections: [] })).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' })
  })

  it('rejects a versioned response whose overall score contradicts its sections', () => {
    const current = buildResult()
    expect(parseAnalysisResponse({ ...current, overallScore: current.overallScore === 100 ? 99 : 100 })).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' })
  })

  it('rejects a versioned response whose score summary contradicts its sections', () => {
    const current = buildResult()
    expect(parseAnalysisResponse({
      ...current,
      scoreSummary: { ...current.scoreSummary, scoredWeight: current.scoreSummary.scoredWeight + 1 },
    })).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' })
  })

  it('rejects fabricated scoring details on a not-applicable section', () => {
    const current = buildResult()
    const sections = current.sections.map((section, index) => index === 0
      ? { ...section, applicability: 'not_applicable' as const, score: 1, evidence: ['fabricated'], missing: [] }
      : section)
    const { overallScore, ...scoreSummary } = calculateOverallScore(sections)
    expect(parseAnalysisResponse({ ...current, overallScore, scoreSummary, sections })).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' })
  })

  it('rejects a legacy response whose overall score contradicts its sections', () => {
    const current = buildResult()
    const legacy = {
      overallScore: current.overallScore === 100 ? 99 : 100,
      sections: current.sections.map(({ applicability: _applicability, ...section }) => section),
      qualityWarnings: [], consistencyNotes: current.consistencyNotes, referenceComment: current.referenceComment,
      model: current.model, rubricVersion: current.rubricVersion,
    }
    expect(parseAnalysisResponse(legacy)).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' })
  })

  it('rejects duplicate section ids even when the score is internally consistent', () => {
    const current = buildResult()
    const sections = current.sections.length > 1
      ? current.sections.map((section, index) => index === 1 ? { ...section, id: current.sections[0].id } : section)
      : [current.sections[0], current.sections[0]]
    const { overallScore, ...scoreSummary } = calculateOverallScore(sections)
    expect(parseAnalysisResponse({ ...current, overallScore, scoreSummary, sections })).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' })
  })

  it('rejects a valid-looking response that belongs to a different request', () => {
    const current = buildResult()
    const rubric = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
    const expected = { documentType: rubric.documentType, rubricVersion: rubric.version, sections: rubric.sections }
    expect(parseAnalysisResponse({ ...current, rubricVersion: 'different-rubric' }, expected)).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' })
    expect(parseAnalysisResponse({
      ...current,
      sections: current.sections.map((section, index) => index === 0 ? { ...section, criteria: 'mutated criteria' } : section),
    }, expected)).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' })
  })
})
