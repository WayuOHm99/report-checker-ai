// ข้อมูลประจำตัวของเว็บไซต์ที่ต้องแสดงตรงกันหลายที่ (footer, หน้านโยบาย, หน้าข้อกำหนด)
// เก็บไว้ที่เดียวเพื่อไม่ให้แก้ที่หนึ่งแล้วลืมอีกที่

export const SITE_NAME = 'RubricLensAi'

// ⚠️ อีเมลนี้ต้องรับเมลได้จริงเสมอ เพราะเป็นช่องทางติดต่อตามกฎหมายที่ประกาศบนหน้า /privacy และ /terms
// ตอนนี้ใช้อีเมลส่วนตัวที่ใช้งานได้จริง เพราะโดเมน rubriclensai.com ยังไม่ต่อ DNS
// เมื่อโดเมนพร้อมและตั้ง Cloudflare Email Routing แล้ว ให้เปลี่ยนเป็น privacy@rubriclensai.com
// ที่บรรทัดนี้บรรทัดเดียว แล้วอัปเดต SECURITY.md ให้ตรงกัน (ดู docs/deployment-runbook.md)
export const CONTACT_EMAIL = 'oomzazato01@gmail.com'

// ช่องทางสำรองสำหรับกรณีอีเมลส่งไม่ถึง ระบุไว้ในหน้านโยบายคู่กับอีเมลเสมอ
export const REPOSITORY_URL = 'https://github.com/WayuOHm99/rubriclens-ai'
export const SUPPORT_ISSUES_URL = `${REPOSITORY_URL}/issues`

export const COPYRIGHT_HOLDER = 'WayuOHm99'
export const COPYRIGHT_YEAR = '2026'
export const LICENSE_NAME = 'MIT License'
export const LICENSE_URL = `${REPOSITORY_URL}/blob/main/LICENSE`

export const PRIVACY_POLICY_PATH = '/privacy'
export const TERMS_PATH = '/terms'

// วันที่นโยบายและข้อกำหนดฉบับปัจจุบันมีผล — แก้ทุกครั้งที่แก้เนื้อหา
export const POLICY_LAST_UPDATED_LABEL = '4 สิงหาคม 2569'
