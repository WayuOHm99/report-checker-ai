import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { createMockAnalysis } from './lib/analysis'
import { extractPdfText } from './lib/pdf'
import { analyzeReferences } from './lib/references'
import { cloneRubricTemplate, DEFAULT_RUBRIC_TEMPLATE_ID } from './lib/rubric'

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
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ\nโครงงานนี้จัดทำขึ้นเพื่อทดสอบระบบ')
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
    expect(screen.getByLabelText('ข้อความรายงาน')).toHaveValue('บทนำ โครงงานทดสอบ PDF')
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
    fireEvent.change(screen.getByLabelText('ข้อความรายงาน'), { target: { value: 'ก'.repeat(200_001) } })
    expect(screen.getByText(/ระบบยังไม่ได้ตัดข้อความหรือส่งข้อมูลส่วนใด/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ตรวจรายงาน' })).toBeDisabled()
  })

  it('asks before excluding an appendix and does not send when cancelled', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ\nเนื้อหาหลัก\n\nภาคผนวก ก\nข้อมูลดิบ')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/ระบบจะไม่นำส่วนนี้ไปวิเคราะห์/))
    expect(screen.queryByRole('region', { name: 'ผลวิเคราะห์' })).not.toBeInTheDocument()
    expect(screen.getByText(/ยังไม่ได้ส่งรายงาน/)).toBeInTheDocument()
  })

  it('restores a draft only from the current browser session', () => {
    window.sessionStorage.setItem('report-checker-session-draft-v1', JSON.stringify({
      reportText: 'ร่างรายงานในแท็บนี้', templateId: 'project-th-v1',
      rubric: [{ id: 'intro', title: 'บทนำ', criteria: 'มีบริบท', weight: 1, enabled: true }],
    }))
    render(<App />)
    expect(screen.getByLabelText('ข้อความรายงาน')).toHaveValue('ร่างรายงานในแท็บนี้')
    expect(window.localStorage.getItem('report-checker-session-draft-v1')).toBeNull()
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
    expect(screen.getByText('ใช้ 9/9 หัวข้อ')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }))
    await user.click(screen.getAllByRole('button', { name: 'ไม่นำมาคิดคะแนน' })[0])
    expect(screen.getByText('ใช้ 8/9 หัวข้อ')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'เพิ่มหัวข้อใหม่' }))
    expect(screen.getByLabelText('ชื่อหัวข้อ หัวข้อใหม่')).toBeInTheDocument()
  })

  it('rejects a rubric with a negative weight', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }))
    fireEvent.change(screen.getByLabelText('น้ำหนัก บทนำ'), { target: { value: '-1', valueAsNumber: -1 } })
    expect(screen.getByText(/น้ำหนักต้องไม่ติดลบ/)).toBeInTheDocument()
  })

  it('shows detailed mock results after one click', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ\nเนื้อหาสำหรับตรวจ')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(screen.getByText(/ตรวจขนาดเอกสาร/)).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'ผลวิเคราะห์' })).toBeInTheDocument()
    expect(screen.getByText('ความสอดคล้องระหว่างบท')).toBeInTheDocument()
    expect(screen.getByText('สิ่งที่ควรแก้ก่อนส่ง')).toBeInTheDocument()
    expect(screen.getAllByText('ข้อมูลหรือหลักฐานที่อาจยังขาด').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'ดาวน์โหลด .txt' })).toBeInTheDocument()
  })

  it('does not display an incomplete API response', async () => {
    vi.stubEnv('VITE_USE_MOCK_ANALYSIS', 'false')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ overallScore: 90, sections: [] }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ เนื้อหารายงานสำหรับทดสอบผลตอบกลับที่มีข้อมูลไม่ครบถ้วนจากระบบภายนอก')
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
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ เนื้อหารายงานสำหรับทดสอบข้อความโควตารายวันที่ครบแล้วจากระบบ Gemini')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))

    expect(await screen.findByText(/โควตารายวันของ Gemini ทั้งโมเดลหลักและโมเดลสำรองครบแล้ว/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ลองอีกครั้งด้วยคำขอเดิม' })).not.toBeInTheDocument()
  })

  it('uses a new idempotency key when the user explicitly starts a fresh analysis', async () => {
    vi.stubEnv('VITE_USE_MOCK_ANALYSIS', 'false')
    const template = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
    const completeResult = { ...createMockAnalysis(template.sections, analyzeReferences('บทนำ'), template.version), documentInfo: { appendixExcluded: false, excludedCharCount: 0 } }
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(completeResult), { status: 200, headers: { 'content-type': 'application/json' } })))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ เนื้อหารายงานสำหรับทดสอบการตรวจใหม่ด้วยคำขอใหม่อย่างชัดเจน')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    await screen.findByRole('region', { name: 'ผลวิเคราะห์' })
    const firstKey = (fetchMock.mock.calls[0][1].headers as Record<string, string>)['Idempotency-Key']
    await user.click(screen.getByRole('button', { name: 'แก้ไขแล้วตรวจใหม่' }))
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const secondKey = (fetchMock.mock.calls[1][1].headers as Record<string, string>)['Idempotency-Key']
    expect(secondKey).not.toBe(firstKey)
  })

  it('locks report and rubric controls while analysis is running', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ เนื้อหารายงานสำหรับตรวจสอบการล็อกแบบฟอร์มระหว่างที่ AI กำลังประมวลผล')
    await user.click(screen.getByRole('button', { name: 'แก้ไขหัวข้อและน้ำหนัก' }))
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(screen.getByLabelText('ข้อความรายงาน')).toBeDisabled()
    expect(screen.getByLabelText('รูปแบบรายงาน')).toBeDisabled()
    expect(screen.getByLabelText('น้ำหนัก บทนำ')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'เริ่มใหม่' })).toBeDisabled()
    await screen.findByRole('region', { name: 'ผลวิเคราะห์' })
  })

  it('scrolls to and focuses the progress section when analysis starts', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ\nเนื้อหาสำหรับตรวจและติดตามความคืบหน้า')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))

    const progressSection = await screen.findByRole('region', { name: 'กำลังตรวจรายงาน' })
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
      expect(progressSection).toHaveFocus()
    })
  })

  it('distinguishes a timeout from a user cancellation and offers a controlled retry', async () => {
    vi.stubEnv('VITE_ANALYSIS_TIMEOUT_MS', '20')
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ\nเนื้อหาสำหรับทดสอบ timeout โดยไม่ส่งข้อมูลไปยัง Gemini จริง')
    await user.click(screen.getByRole('button', { name: 'ตรวจรายงาน' }))
    expect(await screen.findByText(/การตรวจใช้เวลานานเกิน 2 นาที/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลองอีกครั้งด้วยคำขอเดิม' })).toBeInTheDocument()
  })
})
