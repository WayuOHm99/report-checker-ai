import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import App from './App'

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
})
