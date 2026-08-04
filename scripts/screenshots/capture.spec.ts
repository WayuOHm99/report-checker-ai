import { devices, expect, test, type Locator, type Page } from '@playwright/test'

import { API_VERSION_HEADER } from '../../shared/api-contract'
import { ANALYZE_ROUTE, analysisResponseFor, readAnalyzeRequest } from '../../e2e/support/api'

/**
 * Regenerates the images in `docs/screenshots/` with `npm run screenshots`.
 *
 * These images ship in a public repository, so everything in them is synthetic:
 * the report text below is invented, and the analyze endpoint is stubbed the
 * same way the E2E suite stubs it. A capture run never calls Gemini, never needs
 * an API key and never spends budget. The stub reports itself as
 * `demo-stub-model` so a screenshot can never be mistaken for a live model run.
 */
const SCREENSHOT_DIR = 'docs/screenshots'

const SAMPLE_REPORT = [
  'บทนำ',
  'รายงานฉบับนี้ศึกษาผลของการใช้ระบบช่วยตรวจเอกสารอัตโนมัติที่มีต่อคุณภาพของรายงานฉบับส่ง เนื่องจากผู้เรียนจำนวนมากส่งงานโดยยังไม่ได้ทบทวนความครบถ้วนของหัวข้อตามเกณฑ์ที่กำหนดไว้ล่วงหน้า',
  'วัตถุประสงค์',
  'เพื่อเปรียบเทียบความครบถ้วนของหัวข้อในรายงานก่อนและหลังการใช้ระบบช่วยตรวจ และเพื่ออธิบายลักษณะของข้อบกพร่องที่พบบ่อยที่สุดในรายงานกลุ่มตัวอย่าง',
  'วิธีดำเนินการ',
  'เก็บข้อมูลจากรายงานสังเคราะห์จำนวน 120 ฉบับ แบ่งเป็นกลุ่มที่ใช้ระบบช่วยตรวจและกลุ่มที่ไม่ใช้ กลุ่มละ 60 ฉบับ ตรวจให้คะแนนด้วยเกณฑ์ชุดเดียวกันทั้งสองกลุ่ม แล้วบันทึกจำนวนหัวข้อที่ขาดหายไปในแต่ละฉบับ',
  'ผลการดำเนินการ',
  'กลุ่มที่ใช้ระบบช่วยตรวจมีจำนวนหัวข้อที่ขาดหายเฉลี่ย 1.4 หัวข้อต่อฉบับ ขณะที่กลุ่มที่ไม่ใช้มีค่าเฉลี่ย 3.2 หัวข้อต่อฉบับ ข้อบกพร่องที่พบบ่อยที่สุดคือการไม่ระบุขอบเขตของงานและการอ้างอิงที่ไม่ครบตามรูปแบบที่กำหนด',
  'สรุปผลและข้อเสนอแนะ',
  'การทบทวนเอกสารด้วยเกณฑ์ที่ชัดเจนก่อนส่งช่วยลดข้อบกพร่องเชิงโครงสร้างได้ แต่ยังไม่สามารถทดแทนการตรวจโดยผู้สอนได้ ควรศึกษาต่อในกลุ่มตัวอย่างที่หลากหลายกว่านี้',
].join('\n')

// Prose pools keyed by section position. The generic E2E stub repeats one
// sentence per field, which is fine for assertions but reads like filler in a
// screenshot, so the captures use review comments written against the sample
// report above.
const REASONS = [
  'เขียนไว้ครบตามโครงสร้างที่เกณฑ์กำหนด และเชื่อมโยงกลับไปที่วัตถุประสงค์ได้',
  'มีการกล่าวถึงประเด็นนี้ แต่รายละเอียดกระจายอยู่หลายย่อหน้าจนผู้อ่านต้องประกอบเอง',
  'พบเนื้อหาที่ตอบหัวข้อนี้ชัดเจน แต่ยังไม่ได้อธิบายเหตุผลเบื้องหลังการตัดสินใจ',
  'ระบุไว้สั้นเกินกว่าจะประเมินคุณภาพของงานในหัวข้อนี้ได้',
]

const EVIDENCE = [
  '“เพื่อเปรียบเทียบความครบถ้วนของหัวข้อในรายงานก่อนและหลังการใช้ระบบช่วยตรวจ”',
  '“เก็บข้อมูลจากรายงานสังเคราะห์จำนวน 120 ฉบับ แบ่งเป็นกลุ่มละ 60 ฉบับ”',
  '“กลุ่มที่ใช้ระบบช่วยตรวจมีจำนวนหัวข้อที่ขาดหายเฉลี่ย 1.4 หัวข้อต่อฉบับ”',
  '“ข้อบกพร่องที่พบบ่อยที่สุดคือการไม่ระบุขอบเขตของงาน”',
]

const MISSING = [
  'เกณฑ์การให้คะแนนที่ใช้ตรวจรายงานทั้งสองกลุ่ม',
  'ที่มาของกลุ่มตัวอย่างและวิธีการสุ่ม',
  'ข้อจำกัดของการศึกษาและผลกระทบต่อการตีความ',
  'รายการอ้างอิงตามรูปแบบที่รายวิชากำหนด',
]

const RECOMMENDATIONS = [
  'เพิ่มตารางสรุปเกณฑ์การให้คะแนนไว้ก่อนหัวข้อผลการดำเนินการ',
  'ระบุวิธีเลือกกลุ่มตัวอย่างให้ชัดในหัวข้อวิธีดำเนินการ',
  'เพิ่มย่อหน้าข้อจำกัดของการศึกษาไว้ท้ายบทสรุป',
  'ตรวจรายการอ้างอิงให้ครบทุกแหล่งที่กล่าวถึงในเนื้อหา',
]

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': `content-type, idempotency-key, ${API_VERSION_HEADER.toLowerCase()}`,
}

type StubResponse = ReturnType<typeof analysisResponseFor>

/**
 * Rewrites only the prose. Scores, weights and section ids stay exactly as the
 * shared builder produced them, because the browser recomputes the total from
 * the sections and rejects a response whose numbers do not agree.
 */
function withReviewProse(response: StubResponse): StubResponse {
  return {
    ...response,
    model: 'demo-stub-model',
    sections: response.sections.map((section, index) => ({
      ...section,
      reason: REASONS[index % REASONS.length],
      evidence: [EVIDENCE[index % EVIDENCE.length]],
      missing: [MISSING[index % MISSING.length]],
      recommendation: RECOMMENDATIONS[index % RECOMMENDATIONS.length],
    })),
    consistencyNotes: [
      'วัตถุประสงค์ระบุการเปรียบเทียบสองกลุ่ม แต่หัวข้อผลการดำเนินการรายงานเพียงค่าเฉลี่ยโดยไม่ได้ระบุการทดสอบนัยสำคัญ',
      'บทสรุประบุข้อจำกัดไว้กว้าง ๆ ควรเชื่อมกลับไปที่วิธีเลือกกลุ่มตัวอย่างในหัวข้อวิธีดำเนินการ',
    ],
    referenceComment: 'ไม่พบรายการอ้างอิงท้ายเอกสาร ทั้งที่เนื้อหากล่าวถึงข้อมูลจากแหล่งอื่น โปรดยืนยันรูปแบบกับเกณฑ์รายวิชา',
  }
}

async function stubAnalyzeForScreenshots(page: Page, { delayMs = 0 } = {}) {
  await page.route(ANALYZE_ROUTE, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders })
      return
    }
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const body = withReviewProse(analysisResponseFor(readAnalyzeRequest(route)))
    await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify(body) })
  })
}

/** Puts the element at the top of the viewport so the shot frames it, not the page. */
async function bringToTop(target: Locator) {
  await target.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }))
  await target.page().waitForTimeout(150)
}

async function capture(page: Page, fileName: string) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${fileName}`, animations: 'disabled', caret: 'hide' })
}

test.beforeEach(async ({ page }) => {
  await stubAnalyzeForScreenshots(page)
  await page.goto('/')
  // A leftover draft from a previous capture would change what the empty state shows.
  await page.evaluate(() => sessionStorage.clear())
  await page.reload()
})

test('01 home and empty state', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'RubricLensAi', level: 1 })).toBeVisible()
  await capture(page, '01-home.png')
})

test('02 rubric editor for a research report', async ({ page }) => {
  await page.getByLabel('ประเภทงาน').selectOption('research-report')
  await page.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }).click()
  await expect(page.getByLabel('การตั้งค่าเกณฑ์ขั้นสูง')).toBeVisible()
  // Frame the card from its heading down: rows of inputs with no title above
  // them do not tell a reader what part of the app they are looking at.
  await bringToTop(page.getByText('ประเภทงานและเกณฑ์การตรวจ', { exact: true }))
  await capture(page, '02-rubric-editor.png')
})

test('03 analysis in progress', async ({ page }) => {
  // Routes match most-recently-registered first, so this slower stub replaces
  // the instant one long enough to photograph the progress card.
  await stubAnalyzeForScreenshots(page, { delayMs: 4_000 })

  await page.getByLabel('ข้อความเอกสาร').fill(SAMPLE_REPORT)
  await page.getByRole('button', { name: 'ตรวจรายงาน' }).click()
  const progress = page.getByLabel('กำลังตรวจเอกสาร')
  await expect(progress).toBeVisible()
  await bringToTop(progress)
  await capture(page, '03-analyzing.png')
})

test('04 result with score, evidence and priorities', async ({ page }) => {
  await page.getByLabel('ข้อความเอกสาร').fill(SAMPLE_REPORT)
  await page.getByRole('button', { name: 'ตรวจรายงาน' }).click()
  const result = page.getByRole('region', { name: 'ผลวิเคราะห์' })
  await expect(result).toBeVisible()
  await bringToTop(result)
  await capture(page, '04-result.png')
})

// Spreading the whole device descriptor is rejected inside a describe group
// because it carries `defaultBrowserType`, so only the context-level fields
// that actually shape a phone screenshot are applied.
const phone = devices['Pixel 5']

test.describe('mobile', () => {
  test.use({
    viewport: phone.viewport,
    deviceScaleFactor: phone.deviceScaleFactor,
    userAgent: phone.userAgent,
    isMobile: phone.isMobile,
    hasTouch: phone.hasTouch,
  })

  test('05 result on a phone viewport', async ({ page }) => {
    await page.getByLabel('ข้อความเอกสาร').fill(SAMPLE_REPORT)
    await page.getByRole('button', { name: 'ตรวจรายงาน' }).click()
    const result = page.getByRole('region', { name: 'ผลวิเคราะห์' })
    await expect(result).toBeVisible()
    await bringToTop(result)
    await capture(page, '05-mobile.png')
  })
})
