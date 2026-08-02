export const DOCUMENT_TYPES = ['general-report', 'project', 'research-report'] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export type DocumentTypeDefinition = {
  id: DocumentType
  label: string
  description: string
  reviewFocus: string
  limitation: string
  consistencyLabel: string
  /** Dimensions shown in the consistency card; differs per document type. */
  consistencyDimensions: string[]
  /** Primary call-to-action wording, e.g. “ตรวจโครงงาน”. */
  actionLabel: string
  /** Heading for the result section and the exported file. */
  resultTitle: string
  /**
   * Sent to the model so “not applicable” stays tied to the nature of the work
   * rather than to an author who simply left the section out.
   */
  notApplicableGuidance: string
}

export const documentTypeDefinitions: DocumentTypeDefinition[] = [
  {
    id: 'general-report',
    label: 'รายงานทั่วไป',
    description: 'เหมาะกับรายงานที่รวบรวม อธิบาย วิเคราะห์ และสรุปข้อมูลจากแหล่งต่าง ๆ',
    reviewFocus: 'ความครบถ้วนของประเด็น การจัดลำดับเนื้อหา คุณภาพการอธิบาย การวิเคราะห์ การสังเคราะห์ และการอ้างอิง',
    limitation: 'ระบบตรวจได้เฉพาะสิ่งที่เขียนในเอกสาร ไม่ยืนยันความจริงของข้อมูลหรือความน่าเชื่อถือของแหล่งอ้างอิง',
    consistencyLabel: 'ความสอดคล้องระหว่างจุดมุ่งหมาย–เนื้อหา–การวิเคราะห์–ข้อสรุป',
    consistencyDimensions: ['วัตถุประสงค์', 'เนื้อหา', 'การวิเคราะห์', 'สรุปผล'],
    actionLabel: 'ตรวจรายงาน',
    resultTitle: 'ผลตรวจรายงานทั่วไป',
    notApplicableGuidance: 'รายงานทั่วไปเกือบทุกหัวข้อในเกณฑ์ใช้ประเมินได้เสมอ ให้ถือว่า “ไม่เกี่ยวข้อง” เฉพาะเมื่อรายงานเป็นการรวบรวมข้อมูลล้วนที่ไม่ได้เรียกร้องการวิเคราะห์หรือการอ้างอิงตามลักษณะงานจริงเท่านั้น หากผู้เขียนควรมีหัวข้อนั้นแต่ไม่ได้เขียน ให้ถือว่าเกี่ยวข้องและให้คะแนนต่ำ',
  },
  {
    id: 'project',
    label: 'โครงงาน',
    description: 'เหมาะกับงานที่เริ่มจากปัญหา มีการออกแบบ ลงมือพัฒนา ทดสอบ และประเมินผลงานหรือชิ้นงาน',
    reviewFocus: 'ปัญหาและความต้องการ การออกแบบ การลงมือทำ ผลงานหรือชิ้นงาน การทดสอบ และการประเมินผล',
    limitation: 'ระบบประเมินหลักฐานที่บันทึกไว้ในเอกสารเท่านั้น ไม่สามารถยืนยันว่าได้ลงมือทำหรือทดสอบจริง',
    consistencyLabel: 'ความสอดคล้องระหว่างปัญหา–วัตถุประสงค์–การออกแบบ–ผลลัพธ์',
    consistencyDimensions: ['ปัญหา', 'วัตถุประสงค์', 'วิธีทำ', 'ผลงาน', 'การทดสอบ', 'สรุปผล'],
    actionLabel: 'ตรวจโครงงาน',
    resultTitle: 'ผลตรวจโครงงาน',
    notApplicableGuidance: 'ให้ถือว่า “ไม่เกี่ยวข้อง” เฉพาะเมื่อลักษณะของโครงงานไม่ต้องมีหัวข้อนั้นจริง เช่น โครงงานศึกษาหรือสำรวจที่ไม่มีชิ้นงานให้ทดสอบ จึงไม่ต้องมีหัวข้อการทดสอบระบบ แต่ถ้าโครงงานสร้างชิ้นงานแล้วผู้เขียนไม่ได้รายงานการทดสอบ ให้ถือว่าเกี่ยวข้องและให้คะแนนต่ำ',
  },
  {
    id: 'research-report',
    label: 'รายงานวิจัย',
    description: 'เหมาะกับงานวิจัยที่มีคำถามวิจัย กรอบแนวคิด ระเบียบวิธี การเก็บและวิเคราะห์ข้อมูลอย่างเป็นระบบ',
    reviewFocus: 'คำถามวิจัย สมมติฐานและตัวแปร (ถ้ามี) ประชากรและกลุ่มตัวอย่าง เครื่องมือ การเก็บข้อมูล การวิเคราะห์ ผล และอภิปรายผล',
    limitation: 'ระบบไม่สามารถรับรองความแท้จริงของข้อมูล ความถูกต้องทางสถิติ จริยธรรมการวิจัย หรือการอนุมัติจากหน่วยงานที่เกี่ยวข้อง',
    consistencyLabel: 'ความสอดคล้องระหว่างคำถามวิจัย–ระเบียบวิธี–ผล–อภิปรายผล',
    consistencyDimensions: ['คำถามวิจัย', 'ระเบียบวิธี', 'ผลการวิจัย', 'อภิปรายผล', 'สรุปผล'],
    actionLabel: 'ตรวจรายงานวิจัย',
    resultTitle: 'ผลตรวจรายงานวิจัย',
    notApplicableGuidance: 'งานวิจัยเชิงคุณภาพ งานวิจัยเอกสาร และงานวิจัยเชิงสำรวจเชิงพรรณนา จำนวนมากไม่ต้องมีสมมติฐานหรือตัวแปรตามระเบียบวิธีที่เลือก และงานวิจัยเอกสารที่ไม่มีผู้เข้าร่วมมนุษย์ก็ไม่ต้องขออนุมัติจริยธรรม กรณีเช่นนี้ให้ถือว่า “ไม่เกี่ยวข้อง” แต่ถ้าระเบียบวิธีที่ผู้เขียนเลือกเรียกร้องหัวข้อนั้นแล้วผู้เขียนไม่ได้เขียน ให้ถือว่าเกี่ยวข้องและให้คะแนนต่ำ',
  },
]

export const DEFAULT_DOCUMENT_TYPE: DocumentType = 'general-report'

/**
 * Requests created before documentType existed always described a project,
 * so the API treats a missing documentType as a project for backward compatibility.
 */
export const LEGACY_DOCUMENT_TYPE: DocumentType = 'project'

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && DOCUMENT_TYPES.includes(value as DocumentType)
}

export function getDocumentTypeDefinition(documentType: DocumentType): DocumentTypeDefinition {
  return documentTypeDefinitions.find((item) => item.id === documentType) ?? documentTypeDefinitions[0]
}
