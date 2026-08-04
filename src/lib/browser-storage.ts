// รายการเดียวที่บอกว่า RubricLensAi เก็บอะไรไว้บนเครื่องของผู้ใช้บ้าง
//
// ทำไมต้องรวมไว้ที่เดียว: หัวข้อ "คุกกี้และที่เก็บข้อมูลในเบราว์เซอร์" ในหน้านโยบายความเป็นส่วนตัว
// อ่านรายการนี้ไปแสดงตรง ๆ ถ้าใครเปลี่ยนชื่อคีย์ในโค้ดแล้วลืมแก้ที่นี่ เทสต์ใน
// `src/pages/policy.test.tsx` จะแดงทันที นโยบายที่ประกาศกับสิ่งที่ระบบทำจริงจึงไม่หลุดจากกัน

export const ANONYMOUS_TOKEN_KEY = 'rubriclensai-anonymous-token'
export const LEGACY_ANONYMOUS_TOKEN_KEY = 'rubriclens-anonymous-token'
export const SESSION_DRAFT_KEY = 'rubriclensai-session-draft-v1'
export const LEGACY_SESSION_DRAFT_KEY = 'rubriclens-session-draft-v1'

export type BrowserStorageEntry = {
  /** ชื่อคีย์ที่ผู้ใช้จะเห็นถ้าเปิดดูที่เก็บข้อมูลของเบราว์เซอร์เอง */
  key: string
  /** ที่เก็บของเบราว์เซอร์ที่ใช้จริง อธิบายแบบภาษาคน สำหรับแสดงในตารางหน้านโยบาย */
  storageAreaLabel: string
  purpose: string
  lifetime: string
  /** true = คีย์ชื่อเดิมก่อนเปลี่ยนแบรนด์ ระบบยังอ่านและลบให้ แต่ไม่ได้สร้างใหม่แล้ว */
  isLegacy: boolean
}

export const BROWSER_STORAGE_ENTRIES: BrowserStorageEntry[] = [
  {
    key: ANONYMOUS_TOKEN_KEY,
    storageAreaLabel: 'localStorage (ที่เก็บถาวรของเบราว์เซอร์)',
    purpose: 'รหัสสุ่มนิรนาม ไม่ผูกกับชื่อ อีเมล หรือตัวตนใด ๆ ใช้นับจำนวนครั้งที่เรียกใช้ AI เพื่อจำกัดค่าใช้จ่ายของระบบ',
    lifetime: 'อยู่จนกว่าคุณจะล้างข้อมูลเว็บไซต์ในเบราว์เซอร์เอง',
    isLegacy: false,
  },
  {
    key: SESSION_DRAFT_KEY,
    storageAreaLabel: 'sessionStorage (ที่เก็บชั่วคราวของแท็บนั้น)',
    purpose: 'ร่างข้อความและเกณฑ์ที่คุณกำลังกรอก เพื่อไม่ให้หายถ้าเผลอรีเฟรชหน้า',
    lifetime: 'หายทันทีเมื่อปิดแท็บ หรือเมื่อคุณกดปุ่ม “เริ่มใหม่”',
    isLegacy: false,
  },
  {
    key: LEGACY_ANONYMOUS_TOKEN_KEY,
    storageAreaLabel: 'localStorage (ที่เก็บถาวรของเบราว์เซอร์)',
    purpose: 'รหัสนิรนามชื่อคีย์เดิมก่อนเปลี่ยนแบรนด์ ระบบยังอ่านต่อเพื่อไม่ให้ตัวนับของผู้ใช้เดิมถูกรีเซ็ต',
    lifetime: 'อยู่จนกว่าคุณจะล้างข้อมูลเว็บไซต์ในเบราว์เซอร์เอง',
    isLegacy: true,
  },
  {
    key: LEGACY_SESSION_DRAFT_KEY,
    storageAreaLabel: 'sessionStorage (ที่เก็บชั่วคราวของแท็บนั้น)',
    purpose: 'ร่างงานชื่อคีย์เดิมก่อนเปลี่ยนแบรนด์ ระบบอ่านต่อและลบให้เมื่อผู้ใช้กด “เริ่มใหม่”',
    lifetime: 'หายทันทีเมื่อปิดแท็บ หรือเมื่อคุณกดปุ่ม “เริ่มใหม่”',
    isLegacy: true,
  },
]

/** รายการที่ระบบสร้างขึ้นเองในวันนี้ — ตารางในหน้านโยบายแสดงเฉพาะชุดนี้ */
export const ACTIVE_BROWSER_STORAGE_ENTRIES = BROWSER_STORAGE_ENTRIES.filter((entry) => !entry.isLegacy)

/** คีย์ชื่อเดิมที่เหลืออยู่เฉพาะในเครื่องที่เคยใช้เว็บรุ่นก่อน — นโยบายกล่าวถึงเป็นหมายเหตุบรรทัดเดียว */
export const LEGACY_BROWSER_STORAGE_KEYS = BROWSER_STORAGE_ENTRIES.filter((entry) => entry.isLegacy).map((entry) => entry.key)
