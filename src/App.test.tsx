import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'
import { extractPdfText } from './lib/pdf'

vi.mock('./lib/pdf', () => ({ extractPdfText: vi.fn() }))

describe('App', () => {
  it('does not allow an empty report to move to preview', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'ตรวจสอบและดูตัวอย่าง' })).toBeDisabled()
  })

  it('moves from text input to preview after validation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('ข้อความรายงาน'), 'บทนำ\nโครงงานนี้จัดทำขึ้นเพื่อทดสอบระบบ')
    await user.click(screen.getByRole('button', { name: 'ตรวจสอบและดูตัวอย่าง' }))
    expect(await screen.findByRole('button', { name: 'ยืนยันเนื้อหา' })).toBeInTheDocument()
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
    expect(await screen.findByText(/ดึงข้อความจาก 1 หน้าแล้ว/)).toBeInTheDocument()
    expect(screen.getByText('บทนำ โครงงานทดสอบ PDF')).toBeInTheDocument()
  })
})
