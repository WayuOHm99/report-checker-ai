import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, FileText, LoaderCircle, ShieldCheck, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { extractPdfText } from './lib/pdf'
import { cloneRubricTemplate, DEFAULT_RUBRIC_TEMPLATE_ID, rubricSchema, rubricTemplates, type RubricSection } from './lib/rubric'
import { analyzeReferences } from './lib/references'
import { createMockAnalysis, type AnalysisResult } from './lib/analysis'

const MAX_CHARS = 200_000
const MAX_FILE_BYTES = 10 * 1024 * 1024

const sourceSchema = z.object({
  reportText: z.string().max(MAX_CHARS, 'ข้อความยาวเกิน 200,000 ตัวอักษร — ระบบยังไม่ได้ตัดข้อความใด ๆ'),
})
type SourceForm = z.infer<typeof sourceSchema>

export type AnalysisState = 'idle' | 'input' | 'preview' | 'editing' | 'ready' | 'analyzing' | 'result' | 'error'

const stateLabels: Record<AnalysisState, string> = {
  idle: 'พร้อมเริ่มต้น',
  input: 'กำลังรับเนื้อหา',
  preview: 'ตรวจสอบตัวอย่าง',
  editing: 'กำลังแก้ไข',
  ready: 'พร้อมส่งตรวจ',
  analyzing: 'กำลังวิเคราะห์',
  result: 'แสดงผลแล้ว',
  error: 'ต้องแก้ไขข้อมูล',
}

const analysisSteps = ['ตรวจสอบข้อความ', 'นับ token', 'เตรียมรูบริก', 'ส่งข้อมูลอย่างปลอดภัย', 'AI กำลังวิเคราะห์', 'ตรวจสอบผลลัพธ์', 'คำนวณคะแนน']

function getAnonymousToken() {
  const key = 'report-checker-anonymous-token'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const token = crypto.randomUUID()
  window.localStorage.setItem(key, token)
  return token
}

function App() {
  const [state, setState] = useState<AnalysisState>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileNotice, setFileNotice] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [progressIndex, setProgressIndex] = useState(0)
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null)
  const [templateId, setTemplateId] = useState(DEFAULT_RUBRIC_TEMPLATE_ID)
  const [rubric, setRubric] = useState<RubricSection[]>(() => cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID).sections)
  const timeoutRef = useRef<number | null>(null)
  const progressTimerRef = useRef<number | null>(null)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const { register, getValues, setValue, watch, formState: { errors }, trigger } = useForm<SourceForm>({
    resolver: zodResolver(sourceSchema),
    defaultValues: { reportText: '' },
    mode: 'onChange',
  })
  const text = watch('reportText')
  const reportTextField = register('reportText')

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current)
    analysisAbortRef.current?.abort()
  }, [])

  const editText = () => {
    setState('editing')
    window.requestAnimationFrame(() => editorRef.current?.focus())
  }

  const proceedToPreview = async () => {
    const valid = await trigger('reportText')
    if (!valid || !getValues('reportText').trim()) {
      setState('error')
      return
    }
    setState('preview')
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setFileNotice(null)
    setWarnings([])
    if (!file) return

    if (file.type !== 'application/pdf') {
      setFileName(null)
      setFileNotice('รองรับเฉพาะไฟล์ PDF ที่มี MIME type เป็น application/pdf')
      setState('error')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileName(null)
      setFileNotice('ไฟล์มีขนาดเกิน 10 MB จึงยังไม่รับส่งและไม่มีการอ่านข้อความจากไฟล์')
      setState('error')
      return
    }

    setIsExtracting(true)
    setFileName(file.name)
    setState('input')
    try {
      const extraction = await extractPdfText(file)
      setValue('reportText', extraction.text, { shouldDirty: true, shouldValidate: true })
      setWarnings(extraction.warnings)
      setFileNotice(`ดึงข้อความจาก ${extraction.pageCount} หน้าแล้ว — โปรดตรวจและแก้ไขตัวอย่างก่อนยืนยัน`)
      setState(extraction.text.length > MAX_CHARS ? 'error' : 'preview')
    } catch {
      setFileNotice('ไม่สามารถอ่านข้อความจาก PDF นี้ได้ อาจเป็นไฟล์เสียหาย เข้ารหัส หรือไม่ใช่ PDF ที่รองรับ')
      setState('error')
    } finally {
      setIsExtracting(false)
      event.target.value = ''
    }
  }

  const startAnalysis = async () => {
    if (state === 'analyzing') return
    const controller = new AbortController()
    analysisAbortRef.current = controller
    setState('analyzing')
    setResult(null)
    setAnalysisMessage(null)
    setProgressIndex(0)
    progressTimerRef.current = window.setInterval(() => setProgressIndex((current) => Math.min(current + 1, analysisSteps.length - 2)), 700)
    timeoutRef.current = window.setTimeout(() => controller.abort(), 45_000)
    const rubricVersion = rubricTemplates.find((template) => template.id === templateId)?.version ?? 'custom-rubric-v1'
    try {
      if (import.meta.env.VITE_USE_MOCK_ANALYSIS !== 'false') {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 600)
          controller.signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')) }, { once: true })
        })
        setResult(createMockAnalysis(rubric, referenceSummary, rubricVersion))
      } else {
        const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'
        const response = await fetch(`${baseUrl}/analyze`, {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ reportText: text, anonymousToken: getAnonymousToken(), rubric: { version: rubricVersion, sections: rubric }, referenceSummary: referenceSummary.aiSummary }),
        })
        const payload = await response.json() as AnalysisResult & { error?: string }
        if (!response.ok || payload.error) throw new Error(payload.error ?? 'ไม่สามารถวิเคราะห์รายงานได้')
        setResult(payload)
      }
      setProgressIndex(analysisSteps.length - 1)
      setState('result')
    } catch (error) {
      if (controller.signal.aborted) {
        setState('ready')
        setAnalysisMessage('ยกเลิกการตรวจแล้ว ไม่มีการแสดงผลการวิเคราะห์')
      } else {
        setState('error')
        setAnalysisMessage(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด โปรดลองใหม่อีกครั้ง')
      }
    } finally {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current)
      analysisAbortRef.current = null
    }
  }

  const cancelAnalysis = () => analysisAbortRef.current?.abort()

  const currentLength = text.length
  const exceedsLimit = currentLength > MAX_CHARS
  const referenceSummary = useMemo(() => analyzeReferences(text), [text])
  const rubricValidation = rubricSchema.safeParse({ version: 'rubric-editor-v1', sections: rubric })
  const enabledWeight = rubric.filter((section) => section.enabled).reduce((total, section) => total + section.weight, 0)

  const selectTemplate = (nextTemplateId: string) => {
    const template = cloneRubricTemplate(nextTemplateId)
    setTemplateId(template.id)
    setRubric(template.sections)
  }

  const updateSection = (id: string, changes: Partial<RubricSection>) => {
    setRubric((sections) => sections.map((section) => section.id === id ? { ...section, ...changes } : section))
  }

  const addSection = () => {
    const id = `custom-${crypto.randomUUID()}`
    setRubric((sections) => [...sections, { id, title: 'หัวข้อใหม่', criteria: 'อธิบายเกณฑ์ที่ต้องการตรวจ', weight: 1, enabled: true }])
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
                <Textarea
                  id="report-text"
                  aria-label="ข้อความรายงาน"
                  className="h-80 resize-none overflow-y-scroll leading-6"
                  placeholder="วางเนื้อหารายงานที่นี่…"
                  {...reportTextField}
                  ref={(element) => { reportTextField.ref(element); editorRef.current = element }}
                  onChange={(event) => {
                    reportTextField.onChange(event)
                    if (state !== 'analyzing') setState('input')
                  }}
                  disabled={state === 'analyzing' || isExtracting}
                />
                <div className="flex justify-between gap-4 text-xs text-slate-500"><span>{errors.reportText?.message ?? 'ข้อมูลจะยังไม่ถูกส่งจนกว่าคุณจะยืนยัน'}</span><span className={exceedsLimit ? 'font-medium text-red-700' : ''}>{currentLength.toLocaleString()} / {MAX_CHARS.toLocaleString()} ตัวอักษร</span></div>
              </div>

              {exceedsLimit && <Alert className="border-red-200 bg-red-50 text-red-950"><AlertCircle className="size-4" /><AlertTitle>เนื้อหาเกินขนาดที่ส่งวิเคราะห์ได้</AlertTitle><AlertDescription>ระบบยังไม่ได้ตัดข้อความหรือส่งข้อมูลส่วนใด โปรดแก้ไขให้เหลือไม่เกิน 200,000 ตัวอักษร แล้วตรวจตัวอย่างอีกครั้ง การแบ่งเอกสารจะเกิดขึ้นเฉพาะในระบบจริงเมื่อคุณยืนยันเท่านั้น</AlertDescription></Alert>}

              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-medium" htmlFor="pdf-upload"><Upload className="size-5 text-indigo-600" /> อัปโหลด PDF <span className="font-normal text-slate-500">(สูงสุด 10 MB)</span></label>
                <Input id="pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={state === 'analyzing' || isExtracting} />
                {isExtracting && <p className="mt-2 flex items-center gap-2 text-sm text-indigo-700"><LoaderCircle className="size-4 animate-spin" />กำลังดึง text layer จาก PDF…</p>}
                {fileName && <p className="mt-2 text-sm text-slate-700"><FileText className="mr-1 inline size-4" />{fileName}</p>}
                {fileNotice && <p className="mt-2 text-xs text-slate-600">{fileNotice}</p>}
              </div>
              {warnings.map((warning) => <Alert key={warning} className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle className="size-4" /><AlertTitle>โปรดตรวจข้อความที่ดึงได้</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert>)}
              <Button className="w-full sm:w-auto" onClick={proceedToPreview} disabled={state === 'analyzing' || isExtracting || !text.trim() || exceedsLimit}>ตรวจสอบและดูตัวอย่าง</Button>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader><CardTitle>ความเป็นส่วนตัว</CardTitle><CardDescription>แนวทางสำหรับระบบจริงใน Phase ถัดไป</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600"><p>จะส่งเนื้อหาไปยัง Google Gemini ผ่าน Cloudflare Worker เท่านั้น ไม่มี API key ใน browser</p><p>ไม่เก็บเนื้อหารายงานหรือไฟล์ถาวร และจะไม่บันทึกเนื้อหาใน log</p><p>สำหรับผู้ใช้อายุ 18 ปีขึ้นไปเท่านั้น</p></CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader><CardTitle>รูบริกสำหรับตรวจ</CardTitle><CardDescription>แก้ไขเกณฑ์และน้ำหนักได้ตามรายวิชา หัวข้อที่ปิดจะไม่ถูกนำไปคำนวณทั้งตัวเศษและตัวหารของคะแนนรวม</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 sm:max-w-md"><label className="text-sm font-medium" htmlFor="rubric-template">เทมเพลต</label><select id="rubric-template" className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm" value={templateId} onChange={(event) => selectTemplate(event.target.value)}>{rubricTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600"><Badge variant="outline">เปิดใช้งาน {rubric.filter((section) => section.enabled).length}/{rubric.length} หัวข้อ</Badge><Badge variant="outline">น้ำหนักรวมที่ใช้ {Number.isFinite(enabledWeight) ? enabledWeight : 'ไม่ถูกต้อง'}</Badge></div>
            <div className="space-y-3">
              {rubric.map((section) => <div key={section.id} className={`rounded-lg border p-4 ${section.enabled ? 'bg-white' : 'bg-slate-100 opacity-75'}`}>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_7rem_auto] lg:items-start">
                  <label className="space-y-1 text-xs font-medium text-slate-600"><span>หัวข้อ</span><Input aria-label={`ชื่อหัวข้อ ${section.title}`} value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-medium text-slate-600"><span>เกณฑ์</span><Textarea aria-label={`เกณฑ์ ${section.title}`} className="min-h-20" value={section.criteria} onChange={(event) => updateSection(section.id, { criteria: event.target.value })} /></label>
                  <label className="space-y-1 text-xs font-medium text-slate-600"><span>น้ำหนัก</span><Input aria-label={`น้ำหนัก ${section.title}`} type="number" min="0" step="0.5" value={Number.isNaN(section.weight) ? '' : section.weight} onChange={(event) => updateSection(section.id, { weight: event.target.valueAsNumber })} /></label>
                  <div className="flex gap-2 pt-5"><Button type="button" size="sm" variant={section.enabled ? 'outline' : 'secondary'} onClick={() => updateSection(section.id, { enabled: !section.enabled })}>{section.enabled ? 'ปิดหัวข้อ' : 'เปิดหัวข้อ'}</Button><Button type="button" size="sm" variant="destructive" aria-label={`ลบ ${section.title}`} onClick={() => setRubric((sections) => sections.filter((item) => item.id !== section.id))}>ลบ</Button></div>
                </div>
              </div>)}
            </div>
            {!rubricValidation.success && <Alert className="border-red-200 bg-red-50 text-red-950"><AlertCircle className="size-4" /><AlertTitle>รูบริกยังไม่พร้อมใช้งาน</AlertTitle><AlertDescription>{rubricValidation.error.issues.map((issue) => issue.message).join(' · ')}</AlertDescription></Alert>}
            <Button type="button" variant="outline" onClick={addSection}>เพิ่มหัวข้อ</Button>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader><CardTitle>ตรวจเอกสารอ้างอิงเบื้องต้น</CardTitle><CardDescription>ระบบใช้ regex และกฎพื้นฐานเพื่อตรวจรูปแบบเท่านั้น ไม่ได้ยืนยันความถูกต้องหรือการมีอยู่จริงของแหล่งอ้างอิง</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle className="size-4" /><AlertTitle>ตรวจพบเบื้องต้น โปรดยืนยัน</AlertTitle><AlertDescription>ผลนี้จะถูกสรุปเป็นตัวเลขและสถานะเพื่อส่งให้ AI ในอนาคต แทนการให้ AI นับ citation หรือรายการท้ายเล่มเอง</AlertDescription></Alert>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg border p-3 text-sm"><p className="text-slate-500">หัวข้อท้ายเล่ม</p><p className="mt-1 font-medium">{referenceSummary.bibliographyHeading ?? 'ไม่พบ'}</p></div><div className="rounded-lg border p-3 text-sm"><p className="text-slate-500">รายการท้ายเล่ม</p><p className="mt-1 text-lg font-semibold">{referenceSummary.bibliographyEntryCount}</p></div><div className="rounded-lg border p-3 text-sm"><p className="text-slate-500">citation แบบตัวเลข</p><p className="mt-1 text-lg font-semibold">{referenceSummary.numericCitationIds.length}</p></div><div className="rounded-lg border p-3 text-sm"><p className="text-slate-500">citation ผู้แต่ง-ปี</p><p className="mt-1 text-lg font-semibold">{referenceSummary.authorYearCitationCount}</p></div></div>
            {referenceSummary.warnings.length > 0 ? <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">{referenceSummary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="text-sm text-emerald-700">ไม่พบข้อสังเกตจากกฎเบื้องต้น โปรดยืนยันรูปแบบกับเกณฑ์รายวิชาอีกครั้ง</p>}
            {referenceSummary.potentiallyUncitedEntries.length > 0 && <div className="rounded-lg border bg-slate-50 p-3"><p className="text-sm font-medium">รายการที่อาจยังไม่ถูกอ้างในเนื้อหา</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">{referenceSummary.potentiallyUncitedEntries.slice(0, 5).map((entry) => <li key={entry}>{entry}</li>)}</ul>{referenceSummary.potentiallyUncitedEntries.length > 5 && <p className="mt-2 text-xs text-slate-500">แสดง 5 จาก {referenceSummary.potentiallyUncitedEntries.length} รายการ</p>}</div>}
          </CardContent>
        </Card>

        {(state === 'preview' || state === 'editing' || state === 'ready') && <Card className="mt-6">
          <CardHeader><CardTitle>2. ตรวจสอบก่อนส่ง</CardTitle><CardDescription>นี่คือตัวอย่างข้อความที่จะใช้วิเคราะห์ โปรดตรวจหรือแก้ไขในกล่องข้อความด้านบน แล้วจึงยืนยัน</CardDescription></CardHeader>
          <CardContent className="space-y-4"><div className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-slate-50 p-4 text-sm leading-6">{text}</div><div className="flex flex-wrap gap-3"><Button variant="outline" onClick={editText}>แก้ไขข้อความ</Button>{state !== 'ready' ? <Button onClick={() => setState('ready')}><CheckCircle2 />ยืนยันเนื้อหา</Button> : <Button onClick={startAnalysis} disabled={!rubricValidation.success}>{import.meta.env.VITE_USE_MOCK_ANALYSIS !== 'false' ? 'เริ่มตรวจด้วย Mock AI' : 'เริ่มตรวจด้วย AI'}</Button>}</div></CardContent>
        </Card>}

        {state === 'analyzing' && <Card className="mt-6"><CardHeader><CardTitle className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />กำลังตรวจรายงาน</CardTitle><CardDescription>กรุณาอย่าปิดหน้านี้ระหว่างรอผล</CardDescription></CardHeader><CardContent className="space-y-4"><Progress value={((progressIndex + 1) / analysisSteps.length) * 100} /><ol className="space-y-2 text-sm">{analysisSteps.map((step, index) => <li key={step} className={index < progressIndex ? 'text-emerald-700' : index === progressIndex ? 'font-medium text-indigo-700' : 'text-slate-400'}>{index < progressIndex ? '✓' : index === progressIndex ? '•' : '○'} {step}</li>)}</ol><Button variant="outline" onClick={cancelAnalysis}>ยกเลิกการตรวจ</Button></CardContent></Card>}

        {analysisMessage && <Alert className="mt-6 border-red-200 bg-red-50 text-red-950"><AlertCircle className="size-4" /><AlertTitle>{state === 'error' ? 'ไม่สามารถวิเคราะห์รายงานได้' : 'สถานะการตรวจ'}</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{analysisMessage}{state === 'error' && <Button size="sm" variant="outline" onClick={startAnalysis}>ลองอีกครั้ง</Button>}</AlertDescription></Alert>}

        {state === 'result' && result && <section className="mt-6 space-y-6" aria-label="ผลวิเคราะห์">
          <Card className="border-emerald-200"><CardHeader><CardTitle>ผลวิเคราะห์เบื้องต้น</CardTitle><CardDescription>Model: {result.model} · Rubric: {result.rubricVersion}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-slate-600">คะแนนรวมคำนวณด้วยสูตรตามน้ำหนักของหัวข้อที่เปิดใช้งาน</p><p className="mt-1 text-5xl font-semibold text-emerald-700">{result.overallScore}%</p></div><Badge variant="outline">{result.sections.length} หัวข้อที่ใช้คำนวณ</Badge></CardContent></Card>

          <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle className="size-4" /><AlertTitle>AI อาจคลาดเคลื่อน</AlertTitle><AlertDescription>ใช้ผลนี้เพื่อช่วยทบทวนงานเท่านั้น ไม่ใช่คำตัดสินแทนอาจารย์ และไม่ใช่ผลตรวจลอกเลียนผลงาน</AlertDescription></Alert>

          <div className="grid gap-4 lg:grid-cols-2">{result.sections.map((section) => <Card key={section.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{section.title}</CardTitle><CardDescription>น้ำหนัก {section.weight} · confidence {Math.round(section.confidence * 100)}%</CardDescription></div><Badge>{section.score}/3</Badge></div></CardHeader><CardContent className="space-y-3 text-sm"><div><p className="font-medium">เหตุผล</p><p className="mt-1 leading-6 text-slate-600">{section.reason}</p></div><div><p className="font-medium">หลักฐาน</p><ul className="mt-1 list-disc space-y-1 pl-5 leading-6 text-slate-600">{section.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div><div><p className="font-medium">สิ่งที่อาจขาด</p><ul className="mt-1 list-disc space-y-1 pl-5 leading-6 text-slate-600">{section.missing.map((item) => <li key={item}>{item}</li>)}</ul></div><div><p className="font-medium">คำแนะนำ</p><p className="mt-1 leading-6 text-slate-600">{section.recommendation}</p></div></CardContent></Card>)}</div>

          <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>ความสอดคล้องระหว่างบท</CardTitle><CardDescription>วัตถุประสงค์ · วิธีดำเนินงาน · ผล · สรุปผล</CardDescription></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{result.consistencyNotes.map((note) => <li key={note}>{note}</li>)}</ul></CardContent></Card><Card><CardHeader><CardTitle>เอกสารอ้างอิง</CardTitle><CardDescription>ผลตรวจรูปแบบเบื้องต้น</CardDescription></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-slate-700"><p>{result.referenceComment}</p>{referenceSummary.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5">{referenceSummary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</CardContent></Card></div>

          {result.qualityWarnings.length > 0 && <Card><CardHeader><CardTitle>คำเตือนคุณภาพข้อความ</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">{result.qualityWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></CardContent></Card>}
        </section>}
      </div>
    </main>
  )
}

export default App
