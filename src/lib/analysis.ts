import { z } from 'zod'

import type { ReferenceCheckSummary } from './references'
import type { RubricSection } from './rubric'

export const analysisSectionResultSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  criteria: z.string().trim().min(1).max(2_000),
  weight: z.number().finite().nonnegative().max(100),
  score: z.number().int().min(0).max(3),
  reason: z.string().trim().min(1).max(2_000),
  evidence: z.array(z.string().trim().min(1).max(1_000)).max(3),
  missing: z.array(z.string().trim().min(1).max(1_000)).max(3),
  recommendation: z.string().trim().min(1).max(2_000),
  confidence: z.number().min(0).max(1),
}).strict()

export const analysisResultSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  sections: z.array(analysisSectionResultSchema).min(1).max(30),
  qualityWarnings: z.array(z.string().trim().min(1).max(1_000)).max(5),
  consistencyNotes: z.array(z.string().trim().min(1).max(1_000)).max(5),
  referenceComment: z.string().trim().min(1).max(2_000),
  model: z.string().trim().min(1).max(100),
  rubricVersion: z.string().trim().min(1).max(100),
  documentInfo: z.object({
    appendixExcluded: z.boolean(),
    excludedCharCount: z.number().int().nonnegative(),
  }).strict().optional(),
}).strict()

export type AnalysisSectionResult = z.infer<typeof analysisSectionResultSchema>
export type AnalysisResult = z.infer<typeof analysisResultSchema>

function calculateOverallScore(sections: Array<Pick<AnalysisSectionResult, 'score' | 'weight'>>) {
  const denominator = sections.reduce((sum, section) => sum + (3 * section.weight), 0)
  return denominator === 0 ? 0 : Math.round((sections.reduce((sum, section) => sum + (section.score * section.weight), 0) / denominator) * 100)
}

export function createMockAnalysis(sections: RubricSection[], referenceSummary: ReferenceCheckSummary, rubricVersion: string): AnalysisResult {
  const activeSections = sections.filter((section) => section.enabled && section.weight > 0)
  const results: AnalysisSectionResult[] = activeSections.map((section, index) => ({
    id: section.id,
    title: section.title,
    criteria: section.criteria,
    weight: section.weight,
    score: [2, 2, 3][index % 3],
    reason: `Mock: ตรวจพบเนื้อหาที่สัมพันธ์กับหัวข้อ ${section.title} ในระดับเบื้องต้น`,
    evidence: ['Mock evidence: โปรดแทนที่ด้วยหลักฐานจาก Gemini เมื่อเชื่อม Worker จริง'],
    missing: ['ตรวจสอบความครบถ้วนกับเกณฑ์รายวิชาและอาจารย์ผู้สอน'],
    recommendation: `เพิ่มรายละเอียดให้ตรงเกณฑ์ “${section.criteria}”`,
    confidence: 0.5,
  }))

  return {
    overallScore: calculateOverallScore(results),
    sections: results,
    qualityWarnings: ['นี่คือ mock response ไม่มีการเรียก Gemini และคะแนนอาจไม่สะท้อนเนื้อหารายงานจริง'],
    consistencyNotes: ['โปรดตรวจความสอดคล้องระหว่างวัตถุประสงค์ วิธีดำเนินงาน ผลการดำเนินงาน และสรุปผลกับอาจารย์ผู้สอน'],
    referenceComment: referenceSummary.warnings.length > 0 ? `พบข้อสังเกตจากการตรวจอ้างอิงเบื้องต้น ${referenceSummary.warnings.length} รายการ` : 'ไม่พบข้อสังเกตจากกฎ citation เบื้องต้น โปรดยืนยันรูปแบบอีกครั้ง',
    model: 'mock-analysis-v1',
    rubricVersion,
  }
}

export function formatAnalysisResult(result: AnalysisResult) {
  const lines = [
    'ผลตรวจรายงานด้วย AI (ผลเบื้องต้น)',
    `คะแนนรวม: ${result.overallScore}%`,
    `โมเดล: ${result.model}`,
    `เกณฑ์: ${result.rubricVersion}`,
    '',
  ]

  result.sections.forEach((section, index) => {
    lines.push(
      `${index + 1}. ${section.title} — ${section.score}/3 (น้ำหนัก ${section.weight})`,
      `เหตุผล: ${section.reason}`,
      `หลักฐานที่พบ: ${section.evidence.length ? section.evidence.join(' | ') : 'ยังไม่พบหลักฐานชัดเจน'}`,
      `ข้อมูลหรือหลักฐานที่อาจยังขาด: ${section.missing.length ? section.missing.join(' | ') : 'AI ไม่พบประเด็นที่ขาดจากข้อความที่ส่ง'}`,
      `คำแนะนำ: ${section.recommendation}`,
      '',
    )
  })

  lines.push('ความสอดคล้องระหว่างบท:')
  lines.push(...(result.consistencyNotes.length ? result.consistencyNotes.map((note) => `- ${note}`) : ['- AI ไม่ได้ระบุข้อสังเกตเพิ่มเติม']))
  lines.push('', 'เอกสารอ้างอิง:', result.referenceComment)
  if (result.qualityWarnings.length) {
    lines.push('', 'คำเตือนคุณภาพข้อความ:', ...result.qualityWarnings.map((warning) => `- ${warning}`))
  }
  lines.push('', 'หมายเหตุ: ผลนี้ใช้ช่วยทบทวนเท่านั้น ไม่ใช่คำตัดสินแทนอาจารย์หรือผลตรวจลอกเลียนผลงาน')
  return lines.join('\n')
}
