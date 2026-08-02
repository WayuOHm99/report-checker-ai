import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { analysisResultSchema, createMockAnalysis, NO_APPLICABLE_SECTIONS_LABEL, NOT_APPLICABLE_BADGE } from './lib/analysis'
import { MAX_PDF_PAGES, pdfPageLimitMessage } from './lib/document'
import { extractPdfText } from './lib/pdf'
import { analyzeReferences } from './lib/references'
import { cloneRubricTemplate, DEFAULT_RUBRIC_TEMPLATE_ID } from './lib/rubric'
import { API_VERSION, API_VERSION_HEADER } from '../shared/api-contract'
import { calculateOverallScore } from '../shared/scoring'

function apiResult(overrides: Record<string, unknown> = {}) {
  const template = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
  return {
    ...createMockAnalysis(template.sections, analyzeReferences('บทนำ'), template.version, template.documentType),
    documentInfo: { appendixExcluded: false, excludedCharCount: 0 },
    ...overrides,
  }
}

function stubApi(payload: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } }))
  vi.stubEnv('VITE_USE_MOCK_ANALYSIS', 'false')
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const longEnoughReport = 'บทนำ เนื้อหารายงานสำหรับทดสอบเส้นทางการเรียก API ให้ครบถ้วนพอสมควร'

vi.mock('./lib/pdf', () => ({ extractPdfText: vi.fn() }))

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.sessionStorage.clear()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('does not allow an empty report to be analyzed', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'ตรวจรายงาน' })).toBeDisabled()
  })

  it('remains usable when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(() => render(<App />)).not.toThrow()
    expect(screen.getByRole('button', { name: 'ตรวจรายงาน' })).toBeDisabled()
  })

  it('uses one primary action without an age gate or privacy card', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ\nโครงงานนี้จัดทำขึ้นเพื่อทดสอบระบบ')
    expect(screen.queryByText('ความเป็นส่วนตัว')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(await screen.findByRole('region', { name: 'ผลวิเคราะห์' })).toBeInTheDocument()
  })

  it('extracts a selected PDF into preview text', async () => {
    vi.mocked(extractPdfText).mockResolvedValue({
      pageCount: 1,
      text: 'บทนำ โครงงานทดสอบ PDF',
      warnings: [],
    })
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText(/อัปโหลด PDF/), new File(['pdf'], 'report.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText(/อ่าน PDF ครบ 1 หน้าแล้ว/)).toBeInTheDocument()
    expect(screen.getByLabelText('ข้อความเอกสาร')).toHaveValue('บทนำ โครงงานทดสอบ PDF')
  })

  it('warns when a PDF has no text layer and does not offer OCR', async () => {
    vi.mocked(extractPdfText).mockResolvedValue({ pageCount: 2, text: '', warnings: ['ไม่พบ text layer ใน PDF นี้ ซึ่งอาจเป็น PDF สแกน ระบบ MVP จะไม่ทำ OCR โปรดวางข้อความแทน'] })
    const user = userEvent.setup()
    render(<App />)
    await user.upload(screen.getByLabelText(/อัปโหลด PDF/), new File(['pdf'], 'scanned.pdf', { type: 'application/pdf' }))
    expect(await screen.findByText(/ระบบ MVP จะไม่ทำ OCR/)).toBeInTheDocument()
  })

  it('blocks text over 200,000 characters without truncating it', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('ข้อความเอกสาร'), { target: { value: 'ก'.repeat(200_001) } })
    expect(screen.getByText(/ระบบยังไม่ได้ตัดข้อความหรือส่งข้อมูลส่วนใด/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ตรวจรายงาน' })).toBeDisabled()
  })

  it('asks before excluding an appendix and does not send when cancelled', async () => {
    const user = userEvent.setup()
    render(<App />)
    const report = 'บทนำ\nเนื้อหาหลัก\n\nภาคผนวก ก\nข้อมูลดิบ'
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), report)
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    const dialog = screen.getByRole('dialog', { name: 'ยืนยันการไม่ส่งภาคผนวก' })
    expect(dialog).toHaveTextContent('ระบบจะไม่นำส่วนนี้ไปวิเคราะห์')
    await waitFor(() => expect(screen.getByRole('button', { name: 'ยืนยันและส่งตรวจ' })).toHaveFocus())
    expect(screen.queryByRole('region', { name: 'ผลวิเคราะห์' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'กลับไปแก้ข้อความ' }))
    expect(screen.queryByRole('dialog', { name: 'ยืนยันการไม่ส่งภาคผนวก' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('ข้อความเอกสาร')).toHaveValue(report)
    expect(screen.getByText(/ยังไม่ได้ส่งเอกสาร/)).toBeInTheDocument()
  })

  it('analyzes only after appendix exclusion is explicitly confirmed', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ\nเนื้อหาหลัก\n\nภาคผนวก ก\nข้อมูลดิบ')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    await user.click(screen.getByRole('button', { name: 'ยืนยันและส่งตรวจ' }))
    expect(await screen.findByRole('region', { name: 'ผลวิเคราะห์' })).toBeInTheDocument()
  })

  it('restores a draft only from the current browser session', () => {
    window.sessionStorage.setItem('rubriclens-session-draft-v1', JSON.stringify({
      reportText: 'ร่างรายงานในแท็บนี้', templateId: 'project-th-v1',
      rubric: [{ id: 'intro', title: 'บทนำ', criteria: 'มีบริบท', weight: 1, enabled: true }],
    }))
    render(<App />)
    expect(screen.getByLabelText('ข้อความเอกสาร')).toHaveValue('ร่างรายงานในแท็บนี้')
    expect(screen.getByLabelText('ประเภทงาน')).toHaveValue('project')
    expect(window.localStorage.getItem('rubriclens-session-draft-v1')).toBeNull()
  })

  it('repairs a draft whose document type contradicts its known template', () => {
    window.sessionStorage.setItem('rubriclens-session-draft-v1', JSON.stringify({
      reportText: 'ร่างที่บันทึกจากสถานะไม่สอดคล้อง',
      documentType: 'research-report',
      templateId: 'project-th-v1',
      rubric: [{ id: 'objectives', title: 'วัตถุประสงค์', criteria: 'ระบุผลลัพธ์', weight: 1, enabled: true }],
    }))

    render(<App />)

    expect(screen.getByLabelText('ประเภทงาน')).toHaveValue('project')
    expect(screen.getByLabelText('ชุดเกณฑ์การตรวจ')).toHaveValue('project-th-v1')
    expect(screen.getByRole('button', { name: 'ตรวจโครงงาน' })).toBeInTheDocument()
  })

  it('replaces an unknown saved template and its stale rubric with the document-type default', async () => {
    window.sessionStorage.setItem('rubriclens-session-draft-v1', JSON.stringify({
      reportText: 'ร่างจากเกณฑ์รุ่นที่เลิกใช้แล้ว',
      documentType: 'research-report',
      templateId: 'retired-research-template',
      rubric: [{ id: 'question', title: 'คำถามวิจัย', criteria: 'ระบุคำถาม', weight: 1, enabled: true }],
    }))

    render(<App />)

    expect(screen.getByLabelText('ประเภทงาน')).toHaveValue('research-report')
    expect(screen.getByLabelText('ชุดเกณฑ์การตรวจ')).toHaveValue('research-th-v1')
    expect(screen.getByRole('button', { name: 'ตรวจรายงานวิจัย' })).toBeInTheDocument()
    expect(screen.getByText('ใช้ 13/13 หัวข้อ')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }))
    expect(screen.queryByLabelText('ชื่อหัวข้อ คำถามวิจัย')).not.toBeInTheDocument()
    expect(screen.getByLabelText('ชื่อหัวข้อ ประชากร กลุ่มตัวอย่าง หรือผู้ให้ข้อมูล')).toBeInTheDocument()
  })

  it('switches the full rubric and explanation with the document type', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByLabelText('ประเภทงาน')).toHaveValue('general-report')
    expect(screen.getByText('ใช้ 8/8 หัวข้อ')).toBeInTheDocument()
    expect(screen.getByText(/รวบรวม อธิบาย วิเคราะห์ และสรุปข้อมูล/)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('ประเภทงาน'), 'project')
    expect(screen.getByLabelText('ชุดเกณฑ์การตรวจ')).toHaveValue('project-th-v1')
    expect(screen.getByText('ใช้ 10/10 หัวข้อ')).toBeInTheDocument()
    expect(screen.getByText(/ไม่สามารถยืนยันว่าได้ลงมือทำหรือทดสอบจริง/)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('ประเภทงาน'), 'research-report')
    expect(screen.getByLabelText('ชุดเกณฑ์การตรวจ')).toHaveValue('research-th-v1')
    expect(screen.getByText('ใช้ 13/13 หัวข้อ')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }))
    expect(screen.getByLabelText('ชื่อหัวข้อ ประชากร กลุ่มตัวอย่าง หรือผู้ให้ข้อมูล')).toBeInTheDocument()
    expect(screen.getByLabelText('ชื่อหัวข้อ เครื่องมือวิจัย')).toBeInTheDocument()
    expect(screen.getByLabelText('ชื่อหัวข้อ การวิเคราะห์ข้อมูล')).toBeInTheDocument()
  })

  it('labels the action, the result, and the request with the selected document type', async () => {
    vi.stubEnv('VITE_USE_MOCK_ANALYSIS', 'false')
    const template = cloneRubricTemplate('project-th-v1')
    const projectResult = { ...createMockAnalysis(template.sections, analyzeReferences('บทนำ'), template.version, template.documentType), documentInfo: { appendixExcluded: false, excludedCharCount: 0 } }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(projectResult), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByLabelText('ประเภทงาน'), 'project')
    expect(screen.getByRole('button', { name: 'ตรวจโครงงาน' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ตรวจรายงาน' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ เนื้อหาโครงงานสำหรับทดสอบการส่งประเภทงานไปยัง Worker อย่างถูกต้อง')
    await user.click(screen.getByRole('button', { name: 'ตรวจโครงงาน' }))
    await screen.findByRole('region', { name: 'ผลวิเคราะห์' })

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ documentType: 'project', rubric: { version: 'project-th-v1' } })
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)[API_VERSION_HEADER]).toBe(String(API_VERSION))
    expect(screen.getByText('ผลตรวจโครงงาน')).toBeInTheDocument()
    expect(screen.getByText('ปัญหา · วัตถุประสงค์ · วิธีทำ · ผลงาน · การทดสอบ · สรุปผล')).toBeInTheDocument()
  })

  it('rejects a PDF over 10 MB before extraction', async () => {
    const user = userEvent.setup()
    render(<App />)
    const largeFile = new File([new Uint8Array((10 * 1024 * 1024) + 1)], 'large.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText(/อัปโหลด PDF/), largeFile)
    expect(screen.getByText(/ไฟล์มีขนาดเกิน 10 MB/)).toBeInTheDocument()
    expect(extractPdfText).not.toHaveBeenCalled()
  })

  it('lets the user add and disable rubric sections', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('ใช้ 8/8 หัวข้อ')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }))
    await user.click(screen.getAllByRole('button', { name: 'ไม่นำมาคิดคะแนน' })[0])
    expect(screen.getByText('ใช้ 7/8 หัวข้อ')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'เพิ่มหัวข้อใหม่' }))
    expect(screen.getByLabelText('ชื่อหัวข้อ หัวข้อใหม่')).toBeInTheDocument()
  })

  it('rejects a rubric with a negative weight', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }))
    fireEvent.change(screen.getByLabelText('น้ำหนัก บทนำและบริบท'), { target: { value: '-1', valueAsNumber: -1 } })
    expect(screen.getByText(/น้ำหนักต้องไม่ติดลบ/)).toBeInTheDocument()
  })

  it('shows detailed mock results after one click', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ\nเนื้อหาสำหรับตรวจ')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(screen.getByText(/ตรวจขนาดเอกสาร/)).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'ผลวิเคราะห์' })).toBeInTheDocument()
    expect(screen.getByText('ความสอดคล้องของเอกสาร')).toBeInTheDocument()
    expect(screen.getByText('สิ่งที่ควรแก้ก่อนส่ง')).toBeInTheDocument()
    expect(screen.getAllByText('ข้อมูลหรือหลักฐานที่อาจยังขาด').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'ดาวน์โหลด .txt' })).toBeInTheDocument()
  })

  it('does not display an incomplete API response', async () => {
    vi.stubEnv('VITE_USE_MOCK_ANALYSIS', 'false')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ overallScore: 90, sections: [] }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ เนื้อหารายงานสำหรับทดสอบผลตอบกลับที่มีข้อมูลไม่ครบถ้วนจากระบบภายนอก')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(await screen.findByText(/ผลตอบกลับจากระบบยังไม่ครบถ้วน/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ผลวิเคราะห์' })).not.toBeInTheDocument()
  })

  it('shows an exhausted daily quota clearly without an ineffective retry button', async () => {
    vi.stubEnv('VITE_USE_MOCK_ANALYSIS', 'false')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'โควตารายวันของ Gemini ทั้งโมเดลหลักและโมเดลสำรองครบแล้ว โปรดลองใหม่หลังโควตารีเซ็ตหรือให้ผู้ดูแลเปิด Billing',
      code: 'GEMINI_DAILY_QUOTA', retryable: false,
    }), { status: 429, headers: { 'content-type': 'application/json' } })))
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ เนื้อหารายงานสำหรับทดสอบข้อความโควตารายวันที่ครบแล้วจากระบบ Gemini')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))

    expect(await screen.findByText(/โควตารายวันของ Gemini ทั้งโมเดลหลักและโมเดลสำรองครบแล้ว/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ลองอีกครั้งด้วยคำขอเดิม' })).not.toBeInTheDocument()
  })

  it('uses a new idempotency key when the user explicitly starts a fresh analysis', async () => {
    vi.stubEnv('VITE_USE_MOCK_ANALYSIS', 'false')
    const template = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
    const completeResult = { ...createMockAnalysis(template.sections, analyzeReferences('บทนำ'), template.version, template.documentType), documentInfo: { appendixExcluded: false, excludedCharCount: 0 } }
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(completeResult), { status: 200, headers: { 'content-type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ เนื้อหารายงานสำหรับทดสอบการตรวจใหม่ด้วยคำขอใหม่อย่างชัดเจน')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    await screen.findByRole('region', { name: 'ผลวิเคราะห์' })
    const firstKey = (fetchMock.mock.calls[0][1].headers as Record<string, string>)['Idempotency-Key']
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ documentType: 'general-report' })
    await user.click(screen.getByRole('button', { name: 'แก้ไขแล้วตรวจใหม่' }))
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const secondKey = (fetchMock.mock.calls[1][1].headers as Record<string, string>)['Idempotency-Key']
    expect(secondKey).not.toBe(firstKey)
  })

  it('locks report and rubric controls while analysis is running', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ เนื้อหารายงานสำหรับตรวจสอบการล็อกแบบฟอร์มระหว่างที่ AI กำลังประมวลผล')
    await user.click(screen.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }))
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(screen.getByLabelText('ข้อความเอกสาร')).toBeDisabled()
    expect(screen.getByLabelText('ประเภทงาน')).toBeDisabled()
    expect(screen.getByLabelText('ชุดเกณฑ์การตรวจ')).toBeDisabled()
    expect(screen.getByLabelText('น้ำหนัก บทนำและบริบท')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'เริ่มใหม่' })).toBeDisabled()
    await screen.findByRole('region', { name: 'ผลวิเคราะห์' })
  })

  it('scrolls to and focuses the progress section when analysis starts', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ\nเนื้อหาสำหรับตรวจและติดตามความคืบหน้า')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))

    const progressSection = await screen.findByRole('region', { name: 'กำลังตรวจเอกสาร' })
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
      expect(progressSection).toHaveFocus()
    })
  })

  it('distinguishes a timeout from a user cancellation and offers a controlled retry', async () => {
    vi.stubEnv('VITE_ANALYSIS_TIMEOUT_MS', '20')
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), 'บทนำ\nเนื้อหาสำหรับทดสอบ timeout โดยไม่ส่งข้อมูลไปยัง Gemini จริง')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(await screen.findByText(/การตรวจใช้เวลานานเกิน 2 นาที/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลองอีกครั้งด้วยคำขอเดิม' })).toBeInTheDocument()
  })

  it('shows the page limit and the size limit together before a file is chosen', () => {
    render(<App />)
    // Stated on the upload control and again in the card description.
    expect(screen.getAllByText(new RegExp(`ไม่เกิน ${MAX_PDF_PAGES.toLocaleString()} หน้า`)).length).toBeGreaterThan(1)
  })

  it('explains a PDF that exceeds the page limit without offering to continue', async () => {
    vi.mocked(extractPdfText).mockRejectedValue(new Error(pdfPageLimitMessage(MAX_PDF_PAGES + 1)))
    const user = userEvent.setup()
    render(<App />)

    await user.upload(screen.getByLabelText(/อัปโหลด PDF/), new File(['%PDF-'], 'huge.pdf', { type: 'application/pdf' }))

    expect(await screen.findByText(new RegExp(`เกินขีดจำกัด ${MAX_PDF_PAGES.toLocaleString()} หน้า`))).toBeInTheDocument()
    expect(screen.getByText(/ยังไม่ได้ส่งข้อมูลส่วนใดออกจากเครื่องคุณ/)).toBeInTheDocument()
    expect(screen.getByLabelText('ข้อความเอกสาร')).toHaveValue('')
  })

  it('shows a not-applicable badge instead of a score and keeps the section out of the priority list', async () => {
    const base = apiResult()
    const [first, second, ...rest] = base.sections
    const sections = [
      { ...first, score: 3, missing: [] },
      { ...second, applicability: 'not_applicable' as const, score: 0, evidence: [], missing: [], reason: 'งานชิ้นนี้ไม่ต้องมีหัวข้อนี้ตามลักษณะงาน' },
      ...rest.map((section) => ({ ...section, score: 3, missing: [] })),
    ]
    const { overallScore, ...scoreSummary } = calculateOverallScore(sections)
    const responsePayload = {
      ...base,
      overallScore,
      scoreSummary,
      sections,
    }
    expect(() => analysisResultSchema.parse(responsePayload)).not.toThrow()
    stubApi(responsePayload)
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('ข้อความเอกสาร'), longEnoughReport)
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    await screen.findByRole('region', { name: 'ผลวิเคราะห์' })

    expect(screen.getAllByText(NOT_APPLICABLE_BADGE).length).toBeGreaterThan(0)
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText(/หัวข้อที่ไม่เกี่ยวข้องไม่ถูกนับในตัวหาร/)).toBeInTheDocument()
    const priorityList = screen.getByText('สิ่งที่ควรแก้ก่อนส่ง').closest('div')!
    expect(priorityList.textContent).not.toContain(second.title)
  })

  it('does not show a misleading 0% when every section is not applicable', async () => {
    const base = apiResult()
    stubApi({
      ...base,
      overallScore: null,
      scoreSummary: { applicableSectionCount: 0, notApplicableSectionCount: base.sections.length, scoredWeight: 0 },
      sections: base.sections.map((section) => ({ ...section, applicability: 'not_applicable', score: 0, evidence: [], missing: [] })),
    })
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('ข้อความเอกสาร'), longEnoughReport)
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    await screen.findByRole('region', { name: 'ผลวิเคราะห์' })

    expect(screen.getByText(NO_APPLICABLE_SECTIONS_LABEL)).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.getByText(/ระบบจึงไม่คำนวณคะแนนรวม/)).toBeInTheDocument()
  })

  it('refuses a response from an incompatible API version and does not offer a pointless retry', async () => {
    stubApi(apiResult({ apiVersion: API_VERSION + 1 }))
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('ข้อความเอกสาร'), longEnoughReport)
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))

    expect(await screen.findByText(/เป็นคนละรุ่นกับหน้าเว็บนี้/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'ผลวิเคราะห์' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ลองอีกครั้งด้วยคำขอเดิม' })).not.toBeInTheDocument()
  })

  it('mints a fresh idempotency key after the Worker reports a key conflict', async () => {
    const conflict = new Response(JSON.stringify({ error: 'คีย์คำขอนี้ถูกใช้กับเอกสารหรือเกณฑ์ชุดอื่นไปแล้ว', code: 'IDEMPOTENCY_CONFLICT', retryable: false }), { status: 409, headers: { 'content-type': 'application/json' } })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(conflict)
      .mockResolvedValue(new Response(JSON.stringify(apiResult()), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubEnv('VITE_USE_MOCK_ANALYSIS', 'false')
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('ข้อความเอกสาร'), longEnoughReport)
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(await screen.findByText(/ถูกใช้กับเอกสารหรือเกณฑ์ชุดอื่นไปแล้ว/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    await screen.findByRole('region', { name: 'ผลวิเคราะห์' })

    const firstKey = (fetchMock.mock.calls[0][1].headers as Record<string, string>)['Idempotency-Key']
    const secondKey = (fetchMock.mock.calls[1][1].headers as Record<string, string>)['Idempotency-Key']
    expect(secondKey).not.toBe(firstKey)
  })

  it('renders a result from a Worker that predates the version field during a rolling deploy', async () => {
    const template = cloneRubricTemplate('project-th-v1')
    const base = {
      ...createMockAnalysis(template.sections, analyzeReferences('บทนำ'), template.version, template.documentType),
      documentInfo: { appendixExcluded: false, excludedCharCount: 0 },
    }
    stubApi({
      overallScore: base.overallScore,
      sections: base.sections.map(({ applicability: _applicability, ...section }) => section),
      qualityWarnings: [], consistencyNotes: base.consistencyNotes, referenceComment: base.referenceComment,
      model: base.model, rubricVersion: base.rubricVersion,
    })
    const user = userEvent.setup()
    render(<App />)

    await user.selectOptions(screen.getByLabelText('ประเภทงาน'), 'project')
    await user.type(screen.getByLabelText('ข้อความเอกสาร'), longEnoughReport)
    await user.click(screen.getByRole('button', { name: 'ตรวจโครงงาน' }))
    await screen.findByRole('region', { name: 'ผลวิเคราะห์' })

    expect(screen.getByText(`${base.overallScore}%`)).toBeInTheDocument()
    expect(screen.getByText(/มาจากเซิร์ฟเวอร์รุ่นก่อน/)).toBeInTheDocument()
  })
})
