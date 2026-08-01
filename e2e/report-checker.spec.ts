import fontkit from '@pdf-lib/fontkit'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

async function createThaiTextPdf() {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fontBytes = await readFile(path.resolve('node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff'))
  const font = await pdf.embedFont(fontBytes, { subset: true })
  const page = pdf.addPage([595, 842])
  page.drawText('บทนำ รายงานภาษาไทยสำหรับทดสอบ PDF', { x: 48, y: 780, size: 16, font, color: rgb(0, 0, 0) })
  page.drawText('วัตถุประสงค์ เพื่อทดสอบการอ่านข้อความจาก text layer', { x: 48, y: 748, size: 12, font })
  return Buffer.from(await pdf.save())
}

async function createScannedLikePdf() {
  const pdf = await PDFDocument.create()
  pdf.addPage([595, 842])
  return Buffer.from(await pdf.save())
}

async function createMultiColumnPdf() {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([595, 842])
  for (let row = 0; row < 4; row += 1) {
    const y = 780 - (row * 28)
    page.drawText(`Left column ${row + 1}`, { x: 48, y, size: 12, font })
    page.drawText(`Right column ${row + 1}`, { x: 360, y, size: 12, font })
  }
  return Buffer.from(await pdf.save())
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
})

test('a user confirms text before viewing mock analysis results', async ({ page }) => {
  await page.getByLabel('ข้อความรายงาน').fill('บทนำ\nรายงานทดสอบสำหรับ browser smoke test ซึ่งมีรายละเอียดเพียงพอสำหรับตรวจเส้นทางการใช้งานตั้งแต่ต้นจนจบ')
  await page.getByRole('button', { name: 'ตรวจสอบและดูตัวอย่าง' }).click()
  await expect(page.getByRole('heading', { name: 'ขั้นที่ 3 — ตรวจและยืนยันก่อนส่ง' })).toBeVisible()
  await page.getByRole('checkbox', { name: /ฉันยืนยันว่ามีอายุ 18 ปีขึ้นไป/ }).check()
  await page.getByRole('button', { name: 'ยืนยันเนื้อหา' }).click()
  await page.getByRole('button', { name: /เริ่มตรวจด้วย\s*ข้อมูลตัวอย่าง/ }).click()
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toBeVisible()
  await expect(page.getByText('AI อาจคลาดเคลื่อน', { exact: true })).toBeVisible()
})

test('preview is brought into view and advanced settings stay collapsed by default', async ({ page }) => {
  await page.getByLabel('ข้อความรายงาน').fill('บทนำ\nข้อความสำหรับตรวจการนำทางไปยังตัวอย่างโดยไม่ต้องเลื่อนผ่านรายการเกณฑ์จำนวนมากบนหน้าจอ')
  await expect(page.getByLabel('การตั้งค่าเกณฑ์ขั้นสูง')).toHaveCount(0)
  await page.getByRole('button', { name: 'ตรวจสอบและดูตัวอย่าง' }).click()
  const previewHeading = page.getByRole('heading', { name: 'ขั้นที่ 3 — ตรวจและยืนยันก่อนส่ง' })
  await expect(previewHeading).toBeInViewport()
  await expect(page.getByText('เฉพาะข้อความในกรอบด้านล่างจะถูกนำไปวิเคราะห์')).toBeVisible()
})

test('mobile layout has no horizontal overflow and primary touch targets are large enough', async ({ page }) => {
  const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
  const box = await page.getByRole('button', { name: 'ตรวจสอบและดูตัวอย่าง' }).boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
})

test('a real Thai PDF text layer can be previewed and edited', async ({ page }) => {
  await page.getByLabel(/อัปโหลด PDF/).setInputFiles({ name: 'thai-report.pdf', mimeType: 'application/pdf', buffer: await createThaiTextPdf() })
  await expect(page.getByText(/อ่าน PDF ครบ 1 หน้าแล้ว/)).toBeVisible()
  await expect(page.getByLabel('ข้อความรายงาน')).toHaveValue(/บทนำ/)
  await expect(page.getByRole('heading', { name: 'ขั้นที่ 3 — ตรวจและยืนยันก่อนส่ง' })).toBeVisible()
})

test('a PDF without a text layer warns that MVP does not perform OCR', async ({ page }) => {
  await page.getByLabel(/อัปโหลด PDF/).setInputFiles({ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: await createScannedLikePdf() })
  await expect(page.getByText(/ระบบ MVP จะไม่ทำ OCR/)).toBeVisible()
})

test('a multi-column PDF warns the user to verify reading order', async ({ page }) => {
  await page.getByLabel(/อัปโหลด PDF/).setInputFiles({ name: 'columns.pdf', mimeType: 'application/pdf', buffer: await createMultiColumnPdf() })
  await expect(page.getByText(/อาจมีหลายคอลัมน์/)).toBeVisible()
  await expect(page.getByLabel('ข้อความรายงาน')).toHaveValue(/Left column 1/)
  await expect(page.getByLabel('ข้อความรายงาน')).toHaveValue(/Right column 1/)
})

test('appendix exclusion is explicit and requires separate confirmation', async ({ page }) => {
  await page.getByLabel('ข้อความรายงาน').fill('บทนำ\nเนื้อหาหลักสำหรับประเมินโครงสร้างรายงาน\n\nภาคผนวก ก\nข้อมูลดิบที่ไม่ควรส่งไปวิเคราะห์')
  await page.getByRole('button', { name: 'ตรวจสอบและดูตัวอย่าง' }).click()
  await expect(page.getByText(/ระบบจะไม่นำภาคผนวกจำนวน/)).toBeVisible()
  await page.getByRole('checkbox', { name: /ฉันยืนยันว่ามีอายุ 18 ปีขึ้นไป/ }).check()
  await expect(page.getByRole('button', { name: 'ยืนยันเนื้อหา' })).toBeDisabled()
  await page.getByRole('checkbox', { name: /ฉันตรวจแล้วและยืนยันว่าไม่นำส่วน/ }).check()
  await expect(page.getByRole('button', { name: 'ยืนยันเนื้อหา' })).toBeEnabled()
})
