import { z } from 'zod'

import type { ReferenceCheckSummary } from './references'
import type { RubricSection } from './rubric'
import { API_VERSION, DEFAULT_APPLICABILITY, isSupportedApiVersion, LEGACY_API_VERSION, SECTION_APPLICABILITY } from '../../shared/api-contract'
import { DOCUMENT_TYPES, getDocumentTypeDefinition, LEGACY_DOCUMENT_TYPE, type DocumentType } from '../../shared/document-types'
import { calculateOverallScore } from '../../shared/scoring'

export const NOT_APPLICABLE_BADGE = 'ไม่เกี่ยวข้อง'
export const NO_APPLICABLE_SECTIONS_LABEL = 'ไม่มีหัวข้อที่ใช้ประเมิน'

const sectionCoreShape = {
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  criteria: z.string().trim().min(1).max(2_000),
  weight: z.number().finite().positive().max(100),
  score: z.number().int().min(0).max(3),
  reason: z.string().trim().min(1).max(2_000),
  evidence: z.array(z.string().trim().min(1).max(1_000)).max(3),
  missing: z.array(z.string().trim().min(1).max(1_000)).max(3),
  recommendation: z.string().trim().min(1).max(2_000),
  confidence: z.number().min(0).max(1),
}

export const analysisSectionResultSchema = z.object({
  ...sectionCoreShape,
  applicability: z.enum(SECTION_APPLICABILITY),
}).strict()

const scoreSummarySchema = z.object({
  applicableSectionCount: z.number().int().nonnegative(),
  notApplicableSectionCount: z.number().int().nonnegative(),
  scoredWeight: z.number().finite().nonnegative(),
}).strict()

const documentInfoSchema = z.object({
  appendixExcluded: z.boolean(),
  excludedCharCount: z.number().int().nonnegative(),
  analyzedChunkCount: z.number().int().positive().optional(),
}).strict().optional()

export const analysisResultSchema = z.object({
  apiVersion: z.number().int().nonnegative(),
  documentType: z.enum(DOCUMENT_TYPES),
  /** `null` when every rubric section was judged not applicable to the document. */
  overallScore: z.number().int().min(0).max(100).nullable(),
  scoreSummary: scoreSummarySchema,
  sections: z.array(analysisSectionResultSchema).min(1).max(30),
  qualityWarnings: z.array(z.string().trim().min(1).max(1_000)).max(6),
  consistencyNotes: z.array(z.string().trim().min(1).max(1_000)).max(5),
  referenceComment: z.string().trim().min(1).max(2_000),
  model: z.string().trim().min(1).max(100),
  rubricVersion: z.string().trim().min(1).max(100),
  documentInfo: documentInfoSchema,
}).strict().superRefine((result, context) => {
  const calculated = calculateOverallScore(result.sections)
  const sectionIds = new Set<string>()
  const summaryMatches = result.scoreSummary.applicableSectionCount === calculated.applicableSectionCount
    && result.scoreSummary.notApplicableSectionCount === calculated.notApplicableSectionCount
    && Math.abs(result.scoreSummary.scoredWeight - calculated.scoredWeight) < 1e-9
  if (result.overallScore !== calculated.overallScore) {
    context.addIssue({ code: 'custom', path: ['overallScore'], message: 'คะแนนรวมไม่ตรงกับคะแนนรายหัวข้อ' })
  }
  if (!summaryMatches) {
    context.addIssue({ code: 'custom', path: ['scoreSummary'], message: 'สรุปหัวข้อที่ใช้ประเมินไม่ตรงกับผลรายหัวข้อ' })
  }
  result.sections.forEach((section, index) => {
    if (sectionIds.has(section.id)) {
      context.addIssue({ code: 'custom', path: ['sections', index, 'id'], message: 'ผลตอบกลับมีหัวข้อซ้ำ' })
    }
    sectionIds.add(section.id)
    if (section.applicability === 'not_applicable' && (section.score !== 0 || section.evidence.length > 0 || section.missing.length > 0)) {
      context.addIssue({ code: 'custom', path: ['sections', index], message: 'หัวข้อที่ไม่เกี่ยวข้องต้องไม่มีคะแนน หลักฐาน หรือข้อมูลที่ขาด' })
    }
  })
})

/**
 * Shape served before `apiVersion`, applicability and `scoreSummary` existed.
 * Parsed separately so a rolling deployment (new Pages bundle, old Worker) still
 * renders a result instead of failing, and so the upgrade is explicit rather
 * than a silently permissive schema.
 */
const legacyAnalysisResultSchema = z.object({
  // The deployed pre-version Worker did not include documentType. Its only
  // rubric was the legacy project rubric, so defaulting is exact behavior.
  documentType: z.enum(DOCUMENT_TYPES).optional().default(LEGACY_DOCUMENT_TYPE),
  overallScore: z.number().int().min(0).max(100),
  sections: z.array(z.object(sectionCoreShape).strict()).min(1).max(30),
  qualityWarnings: z.array(z.string().trim().min(1).max(1_000)).max(5),
  consistencyNotes: z.array(z.string().trim().min(1).max(1_000)).max(5),
  referenceComment: z.string().trim().min(1).max(2_000),
  model: z.string().trim().min(1).max(100),
  rubricVersion: z.string().trim().min(1).max(100),
  documentInfo: z.object({
    appendixExcluded: z.boolean(),
    excludedCharCount: z.number().int().nonnegative(),
  }).strict().optional(),
}).strict().superRefine((result, context) => {
  const calculated = calculateOverallScore(result.sections.map((section) => ({ ...section, applicability: DEFAULT_APPLICABILITY })))
  const sectionIds = new Set<string>()
  if (result.overallScore !== calculated.overallScore) {
    context.addIssue({ code: 'custom', path: ['overallScore'], message: 'คะแนนรวมจากเซิร์ฟเวอร์รุ่นก่อนไม่ตรงกับคะแนนรายหัวข้อ' })
  }
  result.sections.forEach((section, index) => {
    if (sectionIds.has(section.id)) context.addIssue({ code: 'custom', path: ['sections', index, 'id'], message: 'ผลตอบกลับมีหัวข้อซ้ำ' })
    sectionIds.add(section.id)
  })
})

export type AnalysisSectionResult = z.infer<typeof analysisSectionResultSchema>
export type AnalysisResult = z.infer<typeof analysisResultSchema>

export type ExpectedAnalysisRequest = {
  documentType: DocumentType
  rubricVersion: string
  sections: readonly RubricSection[]
}

export const INCOMPATIBLE_VERSION_MESSAGE = 'ระบบตรวจฝั่งเซิร์ฟเวอร์เป็นคนละรุ่นกับหน้าเว็บนี้ โปรดรีเฟรชหน้า (Ctrl+F5) แล้วลองใหม่อีกครั้ง'
export const INVALID_RESPONSE_MESSAGE = 'ผลตอบกลับจากระบบยังไม่ครบถ้วน โปรดลองใหม่อีกครั้ง'
export const LEGACY_RESPONSE_WARNING = 'ผลนี้มาจากเซิร์ฟเวอร์รุ่นก่อน จึงยังไม่มีการระบุหัวข้อที่ไม่เกี่ยวข้อง ทุกหัวข้อจึงถูกนับรวมในคะแนน'

export type AnalysisParseResult =
  | { ok: true; result: AnalysisResult }
  | { ok: false; code: 'INCOMPATIBLE_VERSION' | 'INVALID_RESPONSE'; message: string; retryable: boolean }

function upgradeLegacyResult(legacy: z.infer<typeof legacyAnalysisResultSchema>): AnalysisResult {
  const sections: AnalysisSectionResult[] = legacy.sections.map((section) => ({ ...section, applicability: DEFAULT_APPLICABILITY }))
  const score = calculateOverallScore(sections)
  return {
    ...legacy,
    apiVersion: LEGACY_API_VERSION,
    sections,
    overallScore: legacy.overallScore,
    scoreSummary: {
      applicableSectionCount: score.applicableSectionCount,
      notApplicableSectionCount: score.notApplicableSectionCount,
      scoredWeight: score.scoredWeight,
    },
    qualityWarnings: [...legacy.qualityWarnings, LEGACY_RESPONSE_WARNING].slice(0, 6),
  }
}

/**
 * Validates an `/api/analyze` payload against the contract this bundle speaks.
 * An unknown future version is rejected outright rather than parsed loosely,
 * because a partially understood result would misreport a student's score.
 */
function matchesExpectedRequest(result: AnalysisResult, expected: ExpectedAnalysisRequest) {
  if (result.documentType !== expected.documentType || result.rubricVersion !== expected.rubricVersion) return false
  const activeSections = expected.sections.filter((section) => section.enabled && section.weight > 0)
  if (result.sections.length !== activeSections.length) return false
  return result.sections.every((section, index) => {
    const expectedSection = activeSections[index]
    return section.id === expectedSection.id.trim()
      && section.title === expectedSection.title.trim()
      && section.criteria === expectedSection.criteria.trim()
      && section.weight === expectedSection.weight
  })
}

export function parseAnalysisResponse(payload: unknown, expected?: ExpectedAnalysisRequest): AnalysisParseResult {
  const versionProbe = z.object({ apiVersion: z.unknown() }).safeParse(payload)
  const rawVersion = versionProbe.success ? versionProbe.data.apiVersion : undefined

  if (rawVersion !== undefined) {
    if (typeof rawVersion !== 'number' || !isSupportedApiVersion(rawVersion)) {
      return { ok: false, code: 'INCOMPATIBLE_VERSION', message: INCOMPATIBLE_VERSION_MESSAGE, retryable: false }
    }
    const parsed = analysisResultSchema.safeParse(payload)
    return parsed.success && (!expected || matchesExpectedRequest(parsed.data, expected))
      ? { ok: true, result: parsed.data }
      : { ok: false, code: 'INVALID_RESPONSE', message: INVALID_RESPONSE_MESSAGE, retryable: true }
  }

  const legacy = legacyAnalysisResultSchema.safeParse(payload)
  const upgraded = legacy.success ? upgradeLegacyResult(legacy.data) : undefined
  return upgraded && (!expected || matchesExpectedRequest(upgraded, expected))
    ? { ok: true, result: upgraded }
    : { ok: false, code: 'INVALID_RESPONSE', message: INVALID_RESPONSE_MESSAGE, retryable: true }
}

export function isNotApplicable(section: Pick<AnalysisSectionResult, 'applicability'>) {
  return section.applicability === 'not_applicable'
}

export function formatOverallScore(result: Pick<AnalysisResult, 'overallScore'>) {
  return result.overallScore === null ? NO_APPLICABLE_SECTIONS_LABEL : `${result.overallScore}%`
}

export function createMockAnalysis(sections: RubricSection[], referenceSummary: ReferenceCheckSummary, rubricVersion: string, documentType: DocumentType): AnalysisResult {
  const activeSections = sections.filter((section) => section.enabled && section.weight > 0)
  const results: AnalysisSectionResult[] = activeSections.map((section, index) => ({
    id: section.id,
    title: section.title,
    criteria: section.criteria,
    weight: section.weight,
    applicability: DEFAULT_APPLICABILITY,
    score: [2, 2, 3][index % 3],
    reason: `Mock: ตรวจพบเนื้อหาที่สัมพันธ์กับหัวข้อ ${section.title} ในระดับเบื้องต้น`,
    evidence: ['Mock evidence: โปรดแทนที่ด้วยหลักฐานจาก Gemini เมื่อเชื่อม Worker จริง'],
    missing: ['ตรวจสอบความครบถ้วนกับเกณฑ์รายวิชาและอาจารย์ผู้สอน'],
    recommendation: `เพิ่มรายละเอียดให้ตรงเกณฑ์ “${section.criteria}”`,
    confidence: 0.5,
  }))
  const score = calculateOverallScore(results)

  return {
    apiVersion: API_VERSION,
    documentType,
    overallScore: score.overallScore,
    scoreSummary: {
      applicableSectionCount: score.applicableSectionCount,
      notApplicableSectionCount: score.notApplicableSectionCount,
      scoredWeight: score.scoredWeight,
    },
    sections: results,
    qualityWarnings: ['นี่คือ mock response ไม่มีการเรียก Gemini และคะแนนอาจไม่สะท้อนเนื้อหาเอกสารจริง'],
    consistencyNotes: [`โปรดตรวจ${getDocumentTypeDefinition(documentType).consistencyLabel}กับอาจารย์ผู้สอน`],
    referenceComment: referenceSummary.warnings.length > 0 ? `พบข้อสังเกตจากการตรวจอ้างอิงเบื้องต้น ${referenceSummary.warnings.length} รายการ` : 'ไม่พบข้อสังเกตจากกฎ citation เบื้องต้น โปรดยืนยันรูปแบบอีกครั้ง',
    model: 'mock-analysis-v1',
    rubricVersion,
  }
}

export function formatAnalysisResult(result: AnalysisResult) {
  const documentType = getDocumentTypeDefinition(result.documentType)
  const lines = [
    `${documentType.resultTitle} จาก RubricLensAi (ผลเบื้องต้น)`,
    `ประเภทงาน: ${documentType.label}`,
    `คะแนนรวม: ${formatOverallScore(result)}`,
    `หัวข้อที่ใช้ประเมิน: ${result.scoreSummary.applicableSectionCount} · หัวข้อที่ไม่เกี่ยวข้อง: ${result.scoreSummary.notApplicableSectionCount}`,
    `โมเดล: ${result.model}`,
    `เกณฑ์: ${result.rubricVersion}`,
    '',
  ]

  if (result.overallScore === null) {
    lines.push(`หมายเหตุ: ทุกหัวข้อในเกณฑ์ถูกประเมินว่า${NOT_APPLICABLE_BADGE}กับงานชิ้นนี้ ระบบจึงไม่คำนวณคะแนนรวม`, '')
  }

  result.sections.forEach((section, index) => {
    if (isNotApplicable(section)) {
      lines.push(
        `${index + 1}. ${section.title} — ${NOT_APPLICABLE_BADGE} (น้ำหนัก ${section.weight} ไม่ถูกนำมาคิดคะแนน)`,
        `เหตุผล: ${section.reason}`,
        '',
      )
      return
    }
    lines.push(
      `${index + 1}. ${section.title} — ${section.score}/3 (น้ำหนัก ${section.weight})`,
      `เหตุผล: ${section.reason}`,
      `หลักฐานที่พบ: ${section.evidence.length ? section.evidence.join(' | ') : 'ยังไม่พบหลักฐานชัดเจน'}`,
      `ข้อมูลหรือหลักฐานที่อาจยังขาด: ${section.missing.length ? section.missing.join(' | ') : 'AI ไม่พบประเด็นที่ขาดจากข้อความที่ส่ง'}`,
      `คำแนะนำ: ${section.recommendation}`,
      '',
    )
  })

  lines.push(`ความสอดคล้องของเอกสาร (${documentType.consistencyDimensions.join(' · ')}):`)
  lines.push(...(result.consistencyNotes.length ? result.consistencyNotes.map((note) => `- ${note}`) : ['- AI ไม่ได้ระบุข้อสังเกตเพิ่มเติม']))
  lines.push('', 'เอกสารอ้างอิง:', result.referenceComment)
  if (result.qualityWarnings.length) {
    lines.push('', 'คำเตือนคุณภาพข้อความ:', ...result.qualityWarnings.map((warning) => `- ${warning}`))
  }
  lines.push('', 'หมายเหตุ: ผลนี้ใช้ช่วยทบทวนเท่านั้น ไม่ใช่คำตัดสินแทนอาจารย์หรือผลตรวจลอกเลียนผลงาน')
  return lines.join('\n')
}
