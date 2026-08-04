import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SiteFooter } from '@/components/SiteFooter'
import {
  ACTIVE_BROWSER_STORAGE_ENTRIES,
  ANONYMOUS_TOKEN_KEY,
  BROWSER_STORAGE_ENTRIES,
  LEGACY_ANONYMOUS_TOKEN_KEY,
  LEGACY_BROWSER_STORAGE_KEYS,
  LEGACY_SESSION_DRAFT_KEY,
  SESSION_DRAFT_KEY,
} from '@/lib/browser-storage'
import { CONTACT_EMAIL, COPYRIGHT_YEAR, PRIVACY_POLICY_PATH, SITE_NAME, TERMS_PATH } from '@/lib/site-info'
import PrivacyPolicy from './PrivacyPolicy'
import TermsOfService from './TermsOfService'

/** ข้อความทั้งหน้าแบบต่อกันเป็นก้อนเดียว ใช้ตรวจว่าประโยคสำคัญยังอยู่ครบ */
function pageText() {
  return document.body.textContent ?? ''
}

describe('ท้ายเว็บ (footer)', () => {
  it('แสดงลิขสิทธิ์ในชื่อแบรนด์ พร้อมปีปัจจุบัน', () => {
    render(<SiteFooter />)

    expect(pageText()).toContain(`© ${COPYRIGHT_YEAR} ${SITE_NAME}`)
  })

  it('มีลิงก์ครบสามทาง คือ นโยบาย ข้อกำหนด และซอร์สโค้ด', () => {
    render(<SiteFooter />)

    expect(screen.getByRole('link', { name: 'นโยบายความเป็นส่วนตัว' })).toHaveAttribute('href', PRIVACY_POLICY_PATH)
    expect(screen.getByRole('link', { name: 'ข้อกำหนดการใช้งาน' })).toHaveAttribute('href', TERMS_PATH)
    expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', expect.stringContaining('github.com'))
  })

  it('ไม่มีลิงก์อื่นนอกจากสามทางนั้น เพื่อให้ท้ายเว็บไม่รก', () => {
    render(<SiteFooter />)

    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
})

describe('หน้านโยบายความเป็นส่วนตัว', () => {
  it('ระบุข้อเท็จจริงหลักของระบบ คือไม่มีฐานข้อมูลและไฟล์ PDF ไม่ถูกอัปโหลด', () => {
    render(<PrivacyPolicy />)

    expect(pageText()).toContain('ไม่มีฐานข้อมูล')
    expect(pageText()).toContain('ไม่ถูกอัปโหลด')
  })

  it('บอกว่าข้อความถูกส่งต่อให้ Google Gemini ผ่าน Cloudflare', () => {
    render(<PrivacyPolicy />)

    expect(pageText()).toContain('Google Gemini API')
    expect(pageText()).toContain('Cloudflare Workers')
  })

  it('บอกอายุของข้อมูลชั่วคราวบนเซิร์ฟเวอร์ตามที่โค้ดตั้งไว้จริง', () => {
    render(<PrivacyPolicy />)

    expect(pageText()).toContain('10 นาที')
    expect(pageText()).toContain('10 ครั้งต่อชั่วโมง')
  })

  it('มีหัวข้อคุกกี้อยู่ในหน้าเดียวกัน และบอกตรง ๆ ว่าไม่ตั้งคุกกี้', () => {
    render(<PrivacyPolicy />)

    expect(screen.getByRole('heading', { name: '7. คุกกี้และที่เก็บข้อมูลในเบราว์เซอร์' })).toBeInTheDocument()
    expect(pageText()).toContain('ไม่ตั้งคุกกี้แม้แต่ตัวเดียว')
    expect(pageText()).toContain('ไม่มีเครื่องมือเก็บสถิติผู้เข้าชม')
  })

  it('แสดงครบทุกรายการที่ระบบเก็บไว้บนเครื่องผู้ใช้ รวมถึงคีย์ชื่อเดิมที่ยังอ่านอยู่', () => {
    render(<PrivacyPolicy />)

    for (const entry of ACTIVE_BROWSER_STORAGE_ENTRIES) {
      expect(pageText()).toContain(entry.key)
      expect(pageText()).toContain(entry.purpose)
    }
    for (const legacyKey of LEGACY_BROWSER_STORAGE_KEYS) {
      expect(pageText()).toContain(legacyKey)
    }
  })

  it('ทุกคีย์ที่โค้ดใช้จริง ต้องถูกประกาศไว้ในรายการที่หน้านโยบายอ่านไปแสดง', () => {
    const declaredKeys = BROWSER_STORAGE_ENTRIES.map((entry) => entry.key)

    // ถ้ามีคนเพิ่มหรือเปลี่ยนคีย์ในโค้ดแล้วลืมแก้รายการนี้ เทสต์ข้อนี้จะแดง
    // เพื่อไม่ให้เว็บประกาศนโยบายที่ไม่ตรงกับสิ่งที่ระบบทำจริง
    expect(declaredKeys).toContain(ANONYMOUS_TOKEN_KEY)
    expect(declaredKeys).toContain(LEGACY_ANONYMOUS_TOKEN_KEY)
    expect(declaredKeys).toContain(SESSION_DRAFT_KEY)
    expect(declaredKeys).toContain(LEGACY_SESSION_DRAFT_KEY)
  })

  it('บอกวิธีลบข้อมูลที่เก็บไว้ด้วยตัวเอง', () => {
    render(<PrivacyPolicy />)

    expect(pageText()).toContain('ลบด้วยตัวเองได้อย่างไร')
  })

  it('มีช่องทางติดต่อทั้งอีเมลและช่องทางสำรอง เผื่ออีเมลส่งไม่ถึง', () => {
    render(<PrivacyPolicy />)

    expect(screen.getByRole('link', { name: CONTACT_EMAIL })).toHaveAttribute('href', `mailto:${CONTACT_EMAIL}`)
    expect(screen.getAllByRole('link', { name: 'หน้ารับแจ้งปัญหาบน GitHub' }).length).toBeGreaterThan(0)
  })

  it('มีหัวเรื่องหลักเพียงหัวเดียว เพื่อให้โปรแกรมอ่านหน้าจอไล่หัวข้อได้ถูก', () => {
    render(<PrivacyPolicy />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})

describe('หน้าข้อกำหนดการใช้งาน', () => {
  it('ประกาศชัดว่าเครื่องมือนี้ไม่ใช่การให้คะแนนอย่างเป็นทางการและไม่ใช่เครื่องตรวจลอกเลียนผลงาน', () => {
    render(<TermsOfService />)

    expect(pageText()).toContain('ไม่ใช่การให้คะแนนอย่างเป็นทางการ')
    expect(pageText()).toContain('ไม่ใช่เครื่องตรวจการลอกเลียนผลงาน')
  })

  it('ระบุว่าเอกสารที่ผู้ใช้ส่งยังเป็นของผู้ใช้ และไม่ถูกนำไปฝึกโมเดล', () => {
    render(<TermsOfService />)

    expect(pageText()).toContain('ยังเป็นทรัพย์สินของคุณทั้งหมด')
    expect(pageText()).toContain('ไม่นำไปฝึกโมเดลของเราเอง')
  })

  it('ระบุขีดจำกัดการใช้งานตรงกับที่โค้ดฝั่งเซิร์ฟเวอร์บังคับไว้จริง', () => {
    render(<TermsOfService />)

    expect(pageText()).toContain('10 ครั้งต่อชั่วโมง')
  })

  it('มีข้อจำกัดความรับผิดและการให้บริการตามสภาพ ซึ่งเป็นส่วนที่คุ้มครองผู้พัฒนา', () => {
    render(<TermsOfService />)

    expect(screen.getByRole('heading', { name: '8. ให้บริการตามสภาพ' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '9. ข้อจำกัดความรับผิด' })).toBeInTheDocument()
  })

  it('ลิงก์กลับไปหน้านโยบายความเป็นส่วนตัวได้', () => {
    render(<TermsOfService />)

    expect(screen.getAllByRole('link', { name: 'นโยบายความเป็นส่วนตัว' })[0]).toHaveAttribute('href', PRIVACY_POLICY_PATH)
  })

  it('มีหัวเรื่องหลักเพียงหัวเดียว เพื่อให้โปรแกรมอ่านหน้าจอไล่หัวข้อได้ถูก', () => {
    render(<TermsOfService />)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })
})
