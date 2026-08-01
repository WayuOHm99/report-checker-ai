import { z } from 'zod'

export const rubricSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, 'หัวข้อต้องมีชื่อ'),
  criteria: z.string().trim().min(1, 'กรุณาระบุเกณฑ์การตรวจ'),
  weight: z.number().finite('น้ำหนักต้องเป็นตัวเลข').nonnegative('น้ำหนักต้องไม่ติดลบ'),
  enabled: z.boolean(),
})

export const rubricSchema = z.object({
  version: z.string().min(1),
  sections: z.array(rubricSectionSchema).min(1, 'ต้องมีอย่างน้อย 1 หัวข้อ'),
}).superRefine(({ sections }, context) => {
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
  sections: RubricSection[]
}

const defaultSections: RubricSection[] = [
  { id: 'introduction', title: 'บทนำ', criteria: 'อธิบายภาพรวมและบริบทของรายงาน', weight: 1, enabled: true },
  { id: 'background', title: 'ความเป็นมาและความสำคัญ', criteria: 'อธิบายปัญหา ความจำเป็น และคุณค่าของโครงงาน', weight: 1, enabled: true },
  { id: 'objectives', title: 'วัตถุประสงค์', criteria: 'ระบุวัตถุประสงค์ชัดเจนและตรวจสอบได้', weight: 1, enabled: true },
  { id: 'scope', title: 'ขอบเขต', criteria: 'ระบุขอบเขตงาน กลุ่มเป้าหมาย หรือข้อจำกัด', weight: 1, enabled: true },
  { id: 'method', title: 'วิธีดำเนินงาน', criteria: 'อธิบายขั้นตอน เครื่องมือ และวิธีประเมินผล', weight: 2, enabled: true },
  { id: 'results', title: 'ผลการดำเนินงาน', criteria: 'นำเสนอผลที่สอดคล้องกับวัตถุประสงค์', weight: 2, enabled: true },
  { id: 'conclusion', title: 'สรุปผล', criteria: 'สรุปผลตามหลักฐานและวัตถุประสงค์', weight: 1, enabled: true },
  { id: 'recommendations', title: 'ข้อเสนอแนะ', criteria: 'เสนอแนวทางพัฒนาหรืองานต่อยอดอย่างเหมาะสม', weight: 1, enabled: true },
  { id: 'references', title: 'เอกสารอ้างอิง', criteria: 'มีรายการอ้างอิงที่สื่อสารแหล่งที่มาได้', weight: 1, enabled: true },
]

export const rubricTemplates: RubricTemplate[] = [
  { id: 'project-th-v1', label: 'โครงงานทั่วไป (ค่าเริ่มต้น)', version: 'project-th-v1', sections: defaultSections },
  {
    id: 'research-th-v1',
    label: 'รายงานวิจัยเบื้องต้น',
    version: 'research-th-v1',
    sections: defaultSections.map((section) => section.id === 'method'
      ? { ...section, criteria: 'อธิบายระเบียบวิธี กลุ่มตัวอย่าง เครื่องมือ และการวิเคราะห์ข้อมูล', weight: 3 }
      : section),
  },
]

export const DEFAULT_RUBRIC_TEMPLATE_ID = rubricTemplates[0].id

export function cloneRubricTemplate(templateId: string): RubricTemplate {
  const template = rubricTemplates.find((item) => item.id === templateId) ?? rubricTemplates[0]
  return { ...template, sections: template.sections.map((section) => ({ ...section })) }
}
