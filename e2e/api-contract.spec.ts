import { expect, test } from '@playwright/test'

import { API_VERSION, API_VERSION_HEADER } from '../shared/api-contract'
import { analysisResponseFor, stubAnalyze, type AnalyzeRequestBody } from './support/api'

const report = 'บทนำ\nเนื้อหารายงานสำหรับตรวจสัญญา API ระหว่างหน้าเว็บกับ Worker ให้ครบทุกฟิลด์ที่จำเป็น'

async function fillAndAnalyze(page: import('@playwright/test').Page, action = 'ตรวจรายงาน') {
  await page.getByLabel('ข้อความเอกสาร').fill(report)
  await page.getByRole('button', { name: action }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
})

test('the built bundle sends the document type, rubric version and idempotency key the Worker expects', async ({ page }) => {
  const requests: AnalyzeRequestBody[] = []
  const headers: Record<string, string>[] = []
  await stubAnalyze(page, { onRequest: (request, requestHeaders) => { requests.push(request); headers.push(requestHeaders) } })

  await page.getByLabel('ประเภทงาน').selectOption('project')
  await fillAndAnalyze(page, 'ตรวจโครงงาน')
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toBeVisible()

  expect(requests).toHaveLength(1)
  expect(requests[0].documentType).toBe('project')
  expect(requests[0].rubric.version).toBe('project-th-v1')
  expect(requests[0].rubric.sections.length).toBeGreaterThan(0)
  expect(requests[0].anonymousToken.length).toBeGreaterThanOrEqual(16)
  expect(requests[0].documentOptions).toEqual({ excludeAppendix: false })
  expect(requests[0].referenceSummary).toHaveProperty('bibliographyDetected')
  expect(headers[0]['idempotency-key'] ?? '').toHaveLength(36)
  expect(headers[0][API_VERSION_HEADER.toLowerCase()]).toBe(String(API_VERSION))
})

test('a rubric version that matches the selected research document type is sent unchanged', async ({ page }) => {
  const requests: AnalyzeRequestBody[] = []
  await stubAnalyze(page, { onRequest: (request) => requests.push(request) })

  await page.getByLabel('ประเภทงาน').selectOption('research-report')
  await fillAndAnalyze(page, 'ตรวจรายงานวิจัย')
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toBeVisible()

  expect(requests[0].rubric.version).toBe('research-th-v1')
  expect(requests[0].documentType).toBe('research-report')
})

test('a Worker error response is shown with its own message and no misleading result', async ({ page }) => {
  await stubAnalyze(page, {
    status: 429,
    body: JSON.stringify({ error: 'โควตารายวันของ Gemini ทั้งโมเดลหลักและโมเดลสำรองครบแล้ว', code: 'GEMINI_DAILY_QUOTA', retryable: false }),
  })

  await fillAndAnalyze(page)

  await expect(page.getByText(/โควตารายวันของ Gemini ทั้งโมเดลหลักและโมเดลสำรองครบแล้ว/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ลองอีกครั้งด้วยคำขอเดิม' })).toHaveCount(0)
})

test('a retryable Worker error offers a retry with the same request', async ({ page }) => {
  await stubAnalyze(page, {
    status: 502,
    body: JSON.stringify({ error: 'ระบบรวมผลวิเคราะห์ทุกส่วนของเอกสารไม่สำเร็จ', code: 'CONSOLIDATION_FAILED', retryable: true }),
  })

  await fillAndAnalyze(page)

  await expect(page.getByText(/รวมผลวิเคราะห์ทุกส่วนของเอกสารไม่สำเร็จ/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'ลองอีกครั้งด้วยคำขอเดิม' })).toBeVisible()
})

test('a malformed response body is refused instead of rendered', async ({ page }) => {
  await stubAnalyze(page, { body: 'not-json-at-all' })

  await fillAndAnalyze(page)

  await expect(page.getByText(/ระบบตอบกลับในรูปแบบที่อ่านไม่ได้|ผลตอบกลับจากระบบยังไม่ครบถ้วน/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toHaveCount(0)
})

test('a success-shaped response missing contract fields is refused', async ({ page }) => {
  await stubAnalyze(page, { body: JSON.stringify({ apiVersion: API_VERSION, overallScore: 90, sections: [] }) })

  await fillAndAnalyze(page)

  await expect(page.getByText(/ผลตอบกลับจากระบบยังไม่ครบถ้วน/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toHaveCount(0)
})

test('a response from an incompatible API version tells the user to refresh', async ({ page }) => {
  await stubAnalyze(page, { overrides: { apiVersion: API_VERSION + 1 } })

  await fillAndAnalyze(page)

  await expect(page.getByText(/เป็นคนละรุ่นกับหน้าเว็บนี้/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toHaveCount(0)
})

test('a not-applicable section is badged instead of scored and is left out of the priority list', async ({ page }) => {
  await page.route('**/api/analyze', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    const request = JSON.parse(route.request().postData() ?? '{}') as AnalyzeRequestBody
    const base = analysisResponseFor(request)
    const [first, second, ...rest] = base.sections
    const sections = [
      { ...first, score: 3, missing: [] },
      { ...second, applicability: 'not_applicable' as const, score: 0, evidence: [], missing: [], reason: 'งานลักษณะนี้ไม่ต้องมีหัวข้อนี้' },
      ...rest,
    ]
    const scoredWeight = sections.filter((section) => section.applicability === 'applicable').reduce((sum, section) => sum + section.weight, 0)
    const numerator = sections.filter((section) => section.applicability === 'applicable').reduce((sum, section) => sum + (section.score * section.weight), 0)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        ...base,
        sections,
        overallScore: Math.round((numerator / (scoredWeight * 3)) * 100),
        scoreSummary: { applicableSectionCount: sections.length - 1, notApplicableSectionCount: 1, scoredWeight },
      }),
    })
  })

  await fillAndAnalyze(page)
  await expect(page.getByRole('region', { name: 'ผลวิเคราะห์' })).toBeVisible()

  await expect(page.getByText('ไม่เกี่ยวข้อง', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/หัวข้อที่ไม่เกี่ยวข้องไม่ถูกนับในตัวหาร/)).toBeVisible()
})
