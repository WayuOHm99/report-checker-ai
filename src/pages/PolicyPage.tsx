import type { ReactNode } from 'react'

import { SiteFooter } from '@/components/SiteFooter'
import { POLICY_LAST_UPDATED_LABEL, SITE_NAME } from '@/lib/site-info'

export const policyLinkClassName = 'text-indigo-700 underline underline-offset-2 hover:text-indigo-900'

/** โครงหน้าที่หน้านโยบายทุกหน้าใช้ร่วมกัน เพื่อให้หัว-ท้ายและระยะห่างเหมือนกันทุกหน้า */
export function PolicyPage({ title, summary, children }: { title: string, summary: string, children: ReactNode }) {
  return (
    <>
      <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
          <header className="mb-6 border-b border-slate-200 pb-5">
            <a className={`text-sm font-medium ${policyLinkClassName}`} href="/">← กลับไปหน้าตรวจเอกสาร</a>
            <p className="mt-4 text-sm font-medium text-slate-500">{SITE_NAME}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm leading-7 text-slate-600">{summary}</p>
            <p className="mt-3 text-xs leading-5 text-slate-500">ปรับปรุงล่าสุด {POLICY_LAST_UPDATED_LABEL}</p>
          </header>
          <div className="space-y-8 pb-4">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}

/** หัวข้อหนึ่งหัวข้อในหน้านโยบาย */
export function PolicySection({ heading, children }: { heading: string, children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
      <div className="space-y-3 text-sm leading-7 text-slate-700">{children}</div>
    </section>
  )
}

/** กล่องเน้นข้อความสำคัญที่อยากให้ผู้ใช้อ่านแม้จะไม่อ่านทั้งหน้า */
export function PolicyHighlight({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm leading-7 text-indigo-950">
      {children}
    </div>
  )
}
