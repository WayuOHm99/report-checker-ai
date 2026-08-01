import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'

const MAX_CHARS = 200_000
const MAX_FILE_BYTES = 10 * 1024 * 1024

const sourceSchema = z.object({ reportText: z.string().max(MAX_CHARS, 'ข้อความยาวเกิน 200,000 ตัวอักษร') })
type SourceForm = z.infer<typeof sourceSchema>

export type AnalysisState = 'idle' | 'input' | 'preview' | 'editing' | 'ready' | 'analyzing' | 'result' | 'error'

const mockAnalysis = {
  overallScore: 78,
  model: 'mock-analysis-v1',
  rubricVersion: 'default-th-v1',
  sections: [
    { title: 'บทนำ', score: 3, reason: 'ระบุหัวข้อและบริบทของโครงงานชัดเจน' },
    { title: 'วัตถุประสงค์', score: 2, reason: 'พบวัตถุประสงค์ แต่ยังวัดผลได้ไม่ครบทุกข้อ' },
    { title: 'วิธีดำเนินงาน', score: 2, reason: 'อธิบายขั้นตอนหลักแล้ว ควรเพิ่มเกณฑ์ประเมินผล' },
  ],
}

const stateLabels: Record<AnalysisState, string> = {
  idle: 'พร้อมเริ่มต้น', input: 'กำลังรับเนื้อหา', preview: 'ตรวจสอบตัวอย่าง', editing: 'กำลังแก้ไข',
  ready: 'พร้อมส่งตรวจ', analyzing: 'กำลังวิเคราะห์', result: 'แสดงผลแล้ว', error: 'ต้องแก้ไขข้อมูล',
}

function App() {
  const [state, setState] = useState<AnalysisState>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileNotice, setFileNotice] = useState<string | null>(null)
  const [result, setResult] = useState<typeof mockAnalysis | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const { register, getValues, watch, formState: { errors }, trigger } = useForm<SourceForm>({
    resolver: zodResolver(sourceSchema),
    defaultValues: { reportText: '' },
    mode: 'onChange',
  })
  const text = watch('reportText')

  useEffect(() => () => { if (timeoutRef.current) window.clearTimeout(timeoutRef.current) }, [])

  const proceedToPreview = async () => {
    const valid = await trigger('reportText')
    if (!valid || !getValues('reportText').trim()) { setState('error'); return }
    setState('preview')
  }

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setFileNotice(null)
    if (!file) return
    if (file.type !== 'application/pdf') {
      setFileName(null); setFileNotice('รองรับเฉพาะไฟล์ PDF'); setState('error'); return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileName(null); setFileNotice('ไฟล์มีขนาดเกิน 10 MB จึงยังไม่รับส่ง'); setState('error'); return
    }
    setFileName(file.name)
    setFileNotice('เลือกไฟล์แล้ว — การดึง text layer และ preview จาก PDF จะเปิดใช้ใน Phase 2')
    setState('input')
  }

  const startMockAnalysis = () => {
    setState('analyzing')
    setResult(null)
    timeoutRef.current = window.setTimeout(() => {
      setResult(mockAnalysis)
      setState('result')
    }, 750)
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-7 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-700"><ShieldCheck className="size-4" /> AI Report Check · MVP</div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">ผู้ช่วยตรวจโครงงานและรายงาน</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">ตรวจความครบถ้วนของโครงสร้างรายงานเบื้องต้น เพื่อช่วยเตรียมงานก่อนให้อาจารย์พิจารณา</p>
          </div>
          <Badge variant="outline" className="w-fit">สถานะ: {stateLabels[state]}</Badge>
        </header>

        <Alert className="mb-6 border-amber-200 bg-amber-50 text-amber-950">
          <AlertCircle className="size-4" />
          <AlertTitle>เครื่องมือช่วยตรวจเบื้องต้น</AlertTitle>
          <AlertDescription>ผล AI ไม่ใช่คำตัดสินแทนอาจารย์ และระบบนี้ไม่อ้างว่าสามารถตรวจลอกเลียนผลงานได้</AlertDescription>
        </Alert>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <Card>
            <CardHeader><CardTitle>1. เพิ่มเนื้อหารายงาน</CardTitle><CardDescription>วางข้อความได้สูงสุด 200,000 ตัวอักษร หรือเลือก PDF ไม่เกิน 10 MB</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="report-text">ข้อความรายงาน</label>
                <Textarea id="report-text" aria-label="ข้อความรายงาน" className="min-h-72 resize-y leading-6" placeholder="วางเนื้อหารายงานที่นี่…" {...register('reportText', { onChange: () => state === 'idle' && setState('input') })} disabled={state === 'analyzing'} />
                <div className="flex justify-between text-xs text-slate-500"><span>{errors.reportText?.message ?? 'ข้อมูลจะยังไม่ถูกส่งจนกว่าจะยืนยัน'}</span><span>{text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} ตัวอักษร</span></div>
              </div>
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-medium" htmlFor="pdf-upload"><Upload className="size-5 text-indigo-600" /> อัปโหลด PDF <span className="font-normal text-slate-500">(สูงสุด 10 MB)</span></label>
                <Input id="pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={state === 'analyzing'} />
                {fileName && <p className="mt-2 text-sm text-slate-700"><FileText className="mr-1 inline size-4" />{fileName}</p>}
                {fileNotice && <p className="mt-2 text-xs text-slate-600">{fileNotice}</p>}
              </div>
              <Button className="w-full sm:w-auto" onClick={proceedToPreview} disabled={state === 'analyzing' || !text.trim()}>ตรวจสอบและดูตัวอย่าง</Button>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader><CardTitle>ความเป็นส่วนตัว</CardTitle><CardDescription>แนวทางสำหรับระบบจริงใน Phase ถัดไป</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
              <p>จะส่งเนื้อหาไปยัง Google Gemini ผ่าน Cloudflare Worker เท่านั้น ไม่มี API key ใน browser</p>
              <p>ไม่เก็บเนื้อหารายงานหรือไฟล์ถาวร และจะไม่บันทึกเนื้อหาใน log</p>
              <p>สำหรับผู้ใช้อายุ 18 ปีขึ้นไปเท่านั้น</p>
            </CardContent>
          </Card>
        </div>

        {(state === 'preview' || state === 'editing' || state === 'ready') && <Card className="mt-6">
          <CardHeader><CardTitle>2. ตรวจสอบก่อนส่ง</CardTitle><CardDescription>โปรดตรวจเนื้อหาและยืนยันก่อนเริ่มวิเคราะห์</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-slate-50 p-4 text-sm leading-6">{text}</div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setState('editing')}>แก้ไขข้อความ</Button>
              {state !== 'ready' ? <Button onClick={() => setState('ready')}><CheckCircle2 />ยืนยันเนื้อหา</Button> : <Button onClick={startMockAnalysis}>เริ่มตรวจด้วย Mock AI</Button>}
            </div>
          </CardContent>
        </Card>}

        {state === 'analyzing' && <Card className="mt-6"><CardContent className="space-y-3 pt-4"><div className="flex items-center gap-2 text-sm font-medium"><LoaderCircle className="size-4 animate-spin" />กำลังวิเคราะห์ด้วย mock response…</div><Progress value={56} /><p className="text-xs text-slate-500">Phase 1 ยังไม่เรียก Gemini หรือส่งข้อมูลออกจาก browser</p></CardContent></Card>}

        {state === 'result' && result && <Card className="mt-6 border-emerald-200">
          <CardHeader><CardTitle>ผลวิเคราะห์ตัวอย่าง</CardTitle><CardDescription>Mock data · {result.model} · {result.rubricVersion}</CardDescription></CardHeader>
          <CardContent className="space-y-4"><div className="text-4xl font-semibold text-emerald-700">{result.overallScore}%</div><div className="grid gap-3 sm:grid-cols-3">{result.sections.map((section) => <div key={section.title} className="rounded-lg border p-3"><div className="flex justify-between font-medium"><span>{section.title}</span><span>{section.score}/3</span></div><p className="mt-2 text-xs leading-5 text-slate-600">{section.reason}</p></div>)}</div></CardContent>
        </Card>}
      </div>
    </main>
  )
}

export default App
