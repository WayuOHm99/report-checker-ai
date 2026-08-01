import type { ReferenceCheckSummary } from './references'
import type { RubricSection } from './rubric'

export type AnalysisSectionResult = Pick<RubricSection, 'id' | 'title' | 'criteria' | 'weight'> & {
  score: number
  reason: string
  evidence: string[]
  missing: string[]
  recommendation: string
  confidence: number
}

export type AnalysisResult = {
  overallScore: number
  sections: AnalysisSectionResult[]
  qualityWarnings: string[]
  consistencyNotes: string[]
  referenceComment: string
  model: string
  rubricVersion: string
}

function calculateOverallScore(sections: Array<Pick<AnalysisSectionResult, 'score' | 'weight'>>) {
  const denominator = sections.reduce((sum, section) => sum + (3 * section.weight), 0)
  return denominator === 0 ? 0 : Math.round((sections.reduce((sum, section) => sum + (section.score * section.weight), 0) / denominator) * 100)
}

export function createMockAnalysis(sections: RubricSection[], referenceSummary: ReferenceCheckSummary, rubricVersion: string): AnalysisResult {
  const activeSections = sections.filter((section) => section.enabled && section.weight > 0)
  const results: AnalysisSectionResult[] = activeSections.map((section, index) => ({
    ...section,
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
