import fontkit from '@pdf-lib/fontkit'
import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

import { MAX_PDF_PAGES } from '../src/lib/document'
import { stubAnalyze } from './support/api'

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

/** Many empty pages stay tiny on disk, so the page-limit guard is testable without a large file. */
async function createOverlongPdf() {
  const pdf = await PDFDocument.create()
  for (let page = 0; page <= MAX_PDF_PAGES; page += 1) pdf.addPage([595, 842])
  return Buffer.from(await pdf.save())
}

test.beforeEach(async ({ page }) => {
  // The production bundle calls the real API, so every run stubs the endpoint.
  await stubAnalyze(page)
  await page.goto('/')
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
})

test('a user sends text for analysis with one primary click', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'RubricLensAi', level: 1 })).toBeVisible()
  await expect(page.getByText(/ตรวจเอกสารให้ครบ ชัด และตรงเกณฑ์/)).toBeVisible()
  await page.getByLabel('ข้อความเอกสาร').fill('บทนำ\nรายงานทดสอบสำหรับ browser smoke test ซึ่งมีรายละเอียดเพียงพอสำหรับตรวจเส้นทางการใช้งานตั้งแต่ต้นจนจบ')
  await page.getByRole('button', { name: 'ตรวจรายงาน' }).click()
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toBeVisible()
  await expect(page.getByText('AI อาจคลาดเคลื่อน', { exact: true })).toBeVisible()
  await expect(page.getByText('สิ่งที่ควรแก้ก่อนส่ง')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ดาวน์โหลด .txt' })).toBeVisible()
})

test('the simple flow has no age gate and advanced settings stay collapsed by default', async ({ page }) => {
  await expect(page.getByLabel('การตั้งค่าเกณฑ์ขั้นสูง')).toHaveCount(0)
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByText('ความเป็นส่วนตัว', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/เมื่อกดตรวจ เนื้อหาเอกสารหลัก ประเภทเอกสาร และเกณฑ์จะถูกส่งไปยัง Google Gemini/)).toBeVisible()
})

test('mobile layout has no horizontal overflow and primary touch targets are large enough', async ({ page }) => {
  const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth)
  const box = await page.getByRole('button', { name: 'ตรวจรายงาน' }).boundingBox()
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
})

test('a real Thai PDF text layer can be previewed and edited', async ({ page }) => {
  await page.getByLabel(/อัปโหลด PDF/).setInputFiles({ name: 'thai-report.pdf', mimeType: 'application/pdf', buffer: await createThaiTextPdf() })
  await expect(page.getByText(/อ่าน PDF ครบ 1 หน้าแล้ว/)).toBeVisible()
  await expect(page.getByLabel('ข้อความเอกสาร')).toHaveValue(/บทนำ/)
  await expect(page.getByRole('button', { name: 'ตรวจรายงาน' })).toBeEnabled()
})

test('a PDF without a text layer warns that MVP does not perform OCR', async ({ page }) => {
  await page.getByLabel(/อัปโหลด PDF/).setInputFiles({ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: await createScannedLikePdf() })
  await expect(page.getByText(/ระบบ MVP จะไม่ทำ OCR/)).toBeVisible()
})

test('a PDF over the page limit is refused before any text is extracted', async ({ page }) => {
  await page.getByLabel(/อัปโหลด PDF/).setInputFiles({ name: 'overlong.pdf', mimeType: 'application/pdf', buffer: await createOverlongPdf() })
  await expect(page.getByText(new RegExp(`เกินขีดจำกัด ${MAX_PDF_PAGES.toLocaleString()} หน้า`))).toBeVisible()
  await expect(page.getByLabel('ข้อความเอกสาร')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'ตรวจรายงาน' })).toBeDisabled()
})

test('the upload control states the page limit next to the size limit', async ({ page }) => {
  await expect(page.getByText(new RegExp(`ไม่เกิน 10 MB และไม่เกิน ${MAX_PDF_PAGES.toLocaleString()} หน้า`)).first()).toBeVisible()
})

test('a multi-column PDF warns the user to verify reading order', async ({ page }) => {
  await page.getByLabel(/อัปโหลด PDF/).setInputFiles({ name: 'columns.pdf', mimeType: 'application/pdf', buffer: await createMultiColumnPdf() })
  await expect(page.getByText(/อาจมีหลายคอลัมน์/)).toBeVisible()
  await expect(page.getByLabel('ข้อความเอกสาร')).toHaveValue(/Left column 1/)
  await expect(page.getByLabel('ข้อความเอกสาร')).toHaveValue(/Right column 1/)
})

test('appendix exclusion is explicit in a confirmation dialog', async ({ page }) => {
  const report = 'บทนำ\nเนื้อหาหลักสำหรับประเมินโครงสร้างรายงาน\n\nภาคผนวก ก\nข้อมูลดิบที่ไม่ควรส่งไปวิเคราะห์'
  await page.getByLabel('ข้อความเอกสาร').fill(report)
  await page.getByRole('button', { name: 'ตรวจรายงาน' }).click()
  const dialog = page.getByRole('dialog', { name: 'ยืนยันการไม่ส่งภาคผนวก' })
  await expect(dialog).toContainText('ระบบจะไม่นำส่วนนี้ไปวิเคราะห์')
  await page.getByRole('button', { name: 'กลับไปแก้ข้อความ' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByLabel('ข้อความเอกสาร')).toHaveValue(report)
  await expect(page.getByText(/ยังไม่ได้ส่งเอกสาร/)).toBeVisible()

  await page.getByRole('button', { name: 'ตรวจรายงาน' }).click()
  await page.getByRole('button', { name: 'ยืนยันและส่งตรวจ' }).click()
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toBeVisible()
})

test('document type selection replaces the rubric with type-specific criteria', async ({ page }) => {
  await expect(page.getByLabel('ประเภทงาน')).toHaveValue('general-report')
  await expect(page.getByText('ใช้ 8/8 หัวข้อ')).toBeVisible()

  await page.getByLabel('ประเภทงาน').selectOption('project')
  await expect(page.getByLabel('ชุดเกณฑ์การตรวจ')).toHaveValue('project-th-v1')
  await expect(page.getByText('ใช้ 10/10 หัวข้อ')).toBeVisible()
  await expect(page.getByText(/ไม่สามารถยืนยันว่าได้ลงมือทำหรือทดสอบจริง/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'ตรวจโครงงาน' })).toBeVisible()

  await page.getByLabel('ประเภทงาน').selectOption('research-report')
  await expect(page.getByLabel('ชุดเกณฑ์การตรวจ')).toHaveValue('research-th-v1')
  await expect(page.getByText('ใช้ 13/13 หัวข้อ')).toBeVisible()
  await page.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }).click()
  await expect(page.getByLabel('ชื่อหัวข้อ เครื่องมือวิจัย')).toBeVisible()
  await expect(page.getByLabel('ชื่อหัวข้อ การวิเคราะห์ข้อมูล')).toBeVisible()
})
