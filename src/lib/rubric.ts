import { z } from 'zod'
import {
  DEFAULT_DOCUMENT_TYPE,
  type DocumentType,
} from '../../shared/document-types'

export const rubricSectionSchema = z.object({
  id: z.string().trim().min(1).max(100, 'รหัสหัวข้อยาวเกินไป'),
  title: z.string().trim().min(1, 'หัวข้อต้องมีชื่อ').max(120, 'ชื่อหัวข้อต้องไม่เกิน 120 ตัวอักษร'),
  criteria: z.string().trim().min(1, 'กรุณาระบุเกณฑ์การตรวจ').max(2_000, 'เกณฑ์การตรวจต้องไม่เกิน 2,000 ตัวอักษร'),
  weight: z.number().finite('น้ำหนักต้องเป็นตัวเลข').nonnegative('น้ำหนักต้องไม่ติดลบ').max(100, 'น้ำหนักต่อหัวข้อต้องไม่เกิน 100'),
  enabled: z.boolean(),
})

export const rubricSchema = z.object({
  version: z.string().trim().min(1).max(100),
  sections: z.array(rubricSectionSchema).min(1, 'ต้องมีอย่างน้อย 1 หัวข้อ').max(30, 'มีหัวข้อได้ไม่เกิน 30 หัวข้อ'),
}).superRefine(({ sections }, context) => {
  const ids = new Set<string>()
  sections.forEach((section, index) => {
    if (ids.has(section.id)) {
      context.addIssue({ code: 'custom', message: `รหัสหัวข้อซ้ำ: ${section.id}`, path: ['sections', index, 'id'] })
    }
    ids.add(section.id)
  })

  const enabledWeight = sections
    .filter((section) => section.enabled)
    .reduce((total, section) => total + section.weight, 0)

  if (enabledWeight <= 0) {
    context.addIssue({
      code: 'custom',
      message: 'หัวข้อที่เปิดใช้งานต้องมีน้ำหนักรวมมากกว่า 0',
      path: ['sections'],
    })
  }
})

export type RubricSection = z.infer<typeof rubricSectionSchema>
export type RubricTemplate = {
  id: string
  label: string
  version: string
  documentType: DocumentType
  sections: RubricSection[]
}

const generalReportSections: RubricSection[] = [
  { id: 'introduction', title: 'บทนำและบริบท', criteria: 'แนะนำหัวข้อ ที่มา ขอบเขต และบริบทที่จำเป็นต่อความเข้าใจรายงาน', weight: 1, enabled: true },
  { id: 'purpose', title: 'จุดมุ่งหมายของรายงาน', criteria: 'ระบุสิ่งที่ต้องการนำเสนอ ศึกษา หรืออธิบายอย่างชัดเจนและสอดคล้องกับเนื้อหา', weight: 1, enabled: true },
  { id: 'information-coverage', title: 'ความครบถ้วนและคุณภาพข้อมูล', criteria: 'ครอบคลุมประเด็นสำคัญ ใช้ข้อมูลที่เกี่ยวข้อง และแยกข้อเท็จจริงออกจากความคิดเห็น', weight: 2, enabled: true },
  { id: 'organization', title: 'การจัดลำดับและการเชื่อมโยง', criteria: 'จัดหมวดหมู่และลำดับเนื้อหาอย่างมีเหตุผล แต่ละส่วนเชื่อมโยงและติดตามได้', weight: 1, enabled: true },
  { id: 'explanation', title: 'การอธิบายและการสื่อสาร', criteria: 'อธิบายแนวคิด คำสำคัญ และรายละเอียดด้วยภาษาที่ชัดเจน เหมาะกับผู้อ่านเป้าหมาย', weight: 1, enabled: true },
  { id: 'analysis-synthesis', title: 'การวิเคราะห์และสังเคราะห์', criteria: 'เปรียบเทียบ ตีความ เชื่อมโยง หรือสังเคราะห์ข้อมูล โดยมีเหตุผลและหลักฐานรองรับ', weight: 2, enabled: true },
  { id: 'conclusion', title: 'บทสรุป', criteria: 'สรุปสาระสำคัญ ตอบจุดมุ่งหมาย และไม่เพิ่มข้อกล่าวอ้างใหม่ที่ไม่มีหลักฐานในเนื้อหา', weight: 1, enabled: true },
  { id: 'references', title: 'การอ้างอิงและแหล่งที่มา', criteria: 'ระบุที่มาของข้อมูลอย่างสม่ำเสมอ ตรวจสอบย้อนกลับได้ และใช้รูปแบบการอ้างอิงที่เหมาะสม', weight: 1, enabled: true },
]

const projectSections: RubricSection[] = [
  { id: 'problem-background', title: 'ปัญหา ที่มา และความสำคัญ', criteria: 'อธิบายปัญหาจริง ผู้ได้รับผลกระทบ หลักฐานของปัญหา และเหตุผลที่ควรพัฒนาโครงงาน', weight: 1.5, enabled: true },
  { id: 'objectives', title: 'วัตถุประสงค์และเกณฑ์ความสำเร็จ', criteria: 'ระบุผลลัพธ์ที่ต้องการอย่างชัดเจน วัดหรือตรวจสอบได้ และมีเกณฑ์ความสำเร็จ', weight: 1, enabled: true },
  { id: 'requirements-scope', title: 'ความต้องการและขอบเขต', criteria: 'ระบุผู้ใช้หรือกลุ่มเป้าหมาย ความต้องการ ขอบเขต สิ่งที่ไม่รวม และข้อจำกัด', weight: 1, enabled: true },
  { id: 'design', title: 'การออกแบบแนวทางแก้ปัญหา', criteria: 'อธิบายทางเลือก เหตุผลในการเลือก สถาปัตยกรรม แบบร่าง หรือการออกแบบที่เชื่อมกับความต้องการ', weight: 1.5, enabled: true },
  { id: 'implementation', title: 'การลงมือพัฒนา', criteria: 'อธิบายขั้นตอน เครื่องมือ ทรัพยากร การแบ่งงาน และหลักฐานการพัฒนาอย่างเพียงพอให้ติดตามได้', weight: 1.5, enabled: true },
  { id: 'deliverable-results', title: 'ผลงาน ชิ้นงาน และผลลัพธ์', criteria: 'นำเสนอผลงานหรือชิ้นงานที่เกิดขึ้น คุณลักษณะสำคัญ และผลที่สอดคล้องกับวัตถุประสงค์', weight: 1.5, enabled: true },
  { id: 'testing-evaluation', title: 'การทดสอบและประเมินผล', criteria: 'ระบุวิธีทดสอบ กลุ่มหรือกรณีทดสอบ ตัวชี้วัด ผลจริง และการเทียบกับเกณฑ์ความสำเร็จ', weight: 2, enabled: true },
  { id: 'conclusion-limitations', title: 'สรุปผลและข้อจำกัด', criteria: 'สรุปสิ่งที่ทำได้และยังทำไม่ได้ตามหลักฐาน พร้อมอธิบายข้อจำกัดและปัญหาที่พบ', weight: 1, enabled: true },
  { id: 'future-work', title: 'ข้อเสนอแนะและงานต่อยอด', criteria: 'เสนอการปรับปรุงหรืองานต่อยอดที่เจาะจง เชื่อมโยงกับผลทดสอบและข้อจำกัด', weight: 0.5, enabled: true },
  { id: 'references', title: 'การอ้างอิงและทรัพยากร', criteria: 'ระบุแหล่งข้อมูล เครื่องมือ ซอฟต์แวร์ หรือผลงานผู้อื่นที่นำมาใช้ให้ตรวจสอบย้อนกลับได้', weight: 0.5, enabled: true },
]

const researchReportSections: RubricSection[] = [
  { id: 'research-background', title: 'ที่มา ปัญหา และช่องว่างการวิจัย', criteria: 'อธิบายบริบท หลักฐานของปัญหา ช่องว่างความรู้ และความสำคัญของการวิจัย', weight: 1, enabled: true },
  { id: 'research-question-objectives', title: 'คำถามวิจัยและวัตถุประสงค์', criteria: 'ระบุคำถามวิจัยและวัตถุประสงค์ที่ชัดเจน สอดคล้อง และสามารถตอบด้วยระเบียบวิธีที่เลือก', weight: 1.5, enabled: true },
  { id: 'hypothesis-variables', title: 'สมมติฐานและตัวแปร', criteria: 'ระบุสมมติฐาน ตัวแปร และนิยามเชิงปฏิบัติการเมื่อระเบียบวิธีเรียกร้อง หัวข้อนี้ไม่เกี่ยวข้องกับงานวิจัยเชิงคุณภาพ งานวิจัยเอกสาร หรืองานเชิงพรรณนาที่ไม่ตั้งสมมติฐานโดยธรรมชาติ', weight: 1, enabled: true },
  { id: 'literature-framework', title: 'ทบทวนวรรณกรรมและกรอบแนวคิด', criteria: 'สังเคราะห์งานที่เกี่ยวข้อง ชี้ความเชื่อมโยงกับคำถามวิจัย และเสนอกรอบแนวคิดหรือฐานทฤษฎี', weight: 1, enabled: true },
  { id: 'population-sample', title: 'ประชากร กลุ่มตัวอย่าง หรือผู้ให้ข้อมูล', criteria: 'ระบุประชากรเป้าหมาย วิธีคัดเลือก ขนาดกลุ่มตัวอย่างหรือผู้ให้ข้อมูล เกณฑ์คัดเข้าออก และความเหมาะสมต่อข้อสรุป หัวข้อนี้ไม่เกี่ยวข้องกับงานวิจัยเอกสารที่ใช้ตัวบทเป็นหน่วยศึกษาแทนผู้ให้ข้อมูล', weight: 1, enabled: true },
  { id: 'research-instruments', title: 'เครื่องมือวิจัย', criteria: 'อธิบายเครื่องมือ การสร้างหรือที่มา และวิธีใช้ สำหรับงานเชิงปริมาณให้ดูความเที่ยงตรงและความเชื่อมั่น สำหรับงานเชิงคุณภาพให้ดูแนวคำถาม บทบาทผู้วิจัย และการตรวจสอบความน่าเชื่อถือแทน', weight: 1, enabled: true },
  { id: 'data-collection', title: 'การเก็บรวบรวมข้อมูล', criteria: 'อธิบายขั้นตอน ช่วงเวลา แหล่งหรือสถานที่ ผู้ดำเนินการ การควบคุมคุณภาพ และการคุ้มครองผู้เข้าร่วมเมื่อมีผู้เข้าร่วม', weight: 1, enabled: true },
  { id: 'data-analysis', title: 'การวิเคราะห์ข้อมูล', criteria: 'ระบุวิธีวิเคราะห์เชิงปริมาณ เชิงคุณภาพ หรือการวิเคราะห์เนื้อหา เหตุผลที่เลือก เงื่อนไข และการเชื่อมกับคำถามวิจัย โดยไม่ถือว่าการไม่ใช้สถิติเป็นข้อบกพร่องหากระเบียบวิธีไม่ต้องใช้', weight: 1.5, enabled: true },
  { id: 'research-findings', title: 'ผลการวิจัย', criteria: 'รายงานผลตามคำถามวิจัยอย่างเป็นกลางและครบถ้วน ใช้ตาราง ภาพ ค่าสถิติ หรือหลักฐานเชิงคุณภาพเช่นบทสัมภาษณ์และการยกตัวบทอย่างเหมาะสมกับระเบียบวิธี', weight: 1.5, enabled: true },
  { id: 'discussion', title: 'อภิปรายผล', criteria: 'ตีความผล เปรียบเทียบกับวรรณกรรม อธิบายความสอดคล้องหรือแตกต่าง และหลีกเลี่ยงข้อสรุปเกินข้อมูล', weight: 1.5, enabled: true },
  { id: 'research-conclusion-limitations', title: 'สรุป ข้อจำกัด และข้อเสนอแนะ', criteria: 'ตอบคำถามวิจัยตามผลที่พบ เปิดเผยข้อจำกัด และเสนอการนำไปใช้หรือวิจัยต่ออย่างสมเหตุผล', weight: 1, enabled: true },
  { id: 'research-ethics', title: 'จริยธรรมการวิจัย', criteria: 'ระบุการยินยอม ความเป็นส่วนตัว ความเสี่ยง และการอนุมัติจริยธรรมเมื่อมีผู้เข้าร่วมมนุษย์หรือข้อมูลส่วนบุคคล หัวข้อนี้ไม่เกี่ยวข้องกับงานวิจัยเอกสารล้วนที่ใช้เฉพาะแหล่งข้อมูลสาธารณะ', weight: 1, enabled: true },
  { id: 'references', title: 'เอกสารอ้างอิง', criteria: 'อ้างอิงแหล่งที่มาอย่างครบถ้วน สอดคล้องระหว่างเนื้อหากับรายการท้ายเรื่อง และใช้รูปแบบเดียวกัน', weight: 1, enabled: true },
]

export const rubricTemplates: RubricTemplate[] = [
  { id: 'general-report-th-v1', label: 'เกณฑ์รายงานทั่วไป', version: 'general-report-th-v1', documentType: 'general-report', sections: generalReportSections },
  { id: 'project-th-v1', label: 'เกณฑ์โครงงาน', version: 'project-th-v1', documentType: 'project', sections: projectSections },
  { id: 'research-th-v1', label: 'เกณฑ์รายงานวิจัย', version: 'research-th-v1', documentType: 'research-report', sections: researchReportSections },
]

export const DEFAULT_RUBRIC_TEMPLATE_ID = 'general-report-th-v1'

export function getRubricTemplatesForDocumentType(documentType: DocumentType): RubricTemplate[] {
  return rubricTemplates.filter((template) => template.documentType === documentType)
}

export function getDefaultRubricTemplate(documentType: DocumentType = DEFAULT_DOCUMENT_TYPE): RubricTemplate {
  return rubricTemplates.find((template) => template.documentType === documentType) ?? rubricTemplates[0]
}

export function inferDocumentTypeFromTemplate(templateId: string): DocumentType {
  return rubricTemplates.find((template) => template.id === templateId)?.documentType ?? DEFAULT_DOCUMENT_TYPE
}

export function cloneRubricTemplate(templateId: string): RubricTemplate {
  const template = rubricTemplates.find((item) => item.id === templateId) ?? getDefaultRubricTemplate()
  return { ...template, sections: template.sections.map((section) => ({ ...section })) }
}
