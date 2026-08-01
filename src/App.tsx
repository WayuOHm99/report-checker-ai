import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, ChevronDown, FileText, LoaderCircle, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
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
import { createMockAnalysis, type AnalysisResult } from './lib/analysis'
import { isLikelyPdf, MAX_ANALYSIS_CHARS, MAX_RAW_CHARS, prepareDocument } from './lib/document'
import { extractPdfText } from './lib/pdf'
import { analyzeReferences } from './lib/references'
import { cloneRubricTemplate, DEFAULT_RUBRIC_TEMPLATE_ID, rubricSchema, rubricSectionSchema, rubricTemplates, type RubricSection } from './lib/rubric'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const DRAFT_KEY = 'report-checker-session-draft-v1'

function getAnalysisTimeoutMs() {
  const configured = Number(import.meta.env.VITE_ANALYSIS_TIMEOUT_MS)
  return Number.isFinite(configured) && configured >= 10 ? configured : 120_000
}

const sourceSchema = z.object({
  reportText: z.string().max(MAX_RAW_CHARS, 'ข้อความทั้งหมดยาวเกิน 300,000 ตัวอักษร ระบบยังไม่ได้ตัดหรือส่งข้อความส่วนใด'),
})
type SourceForm = z.infer<typeof sourceSchema>

const draftSchema = z.object({
  reportText: z.string().max(MAX_RAW_CHARS),
  templateId: z.string(),
  rubric: z.array(rubricSectionSchema),
})
type Draft = z.infer<typeof draftSchema>

export type AnalysisState = 'idle' | 'input' | 'preview' | 'editing' | 'ready' | 'analyzing' | 'result' | 'error'

const stateLabels: Record<AnalysisState, string> = {
  idle: 'พร้อมเริ่ม', input: 'กำลังเตรียมรายงาน', preview: 'กำลังตรวจตัวอย่าง', editing: 'กำลังแก้ไข',
  ready: 'พร้อมส่งตรวจ', analyzing: 'AI กำลังตรวจ', result: 'ตรวจเสร็จแล้ว', error: 'ต้องตรวจข้อมูลอีกครั้ง',
}

const analysisSteps = ['ตรวจขนาดเอกสาร', 'เตรียมเกณฑ์การตรวจ', 'ส่งข้อมูลผ่านระบบที่ปลอดภัย', 'AI อ่านรายงาน', 'ตรวจความครบถ้วนของคำตอบ', 'รวมผลแต่ละหัวข้อ', 'คำนวณคะแนนรวม']

function getAnonymousToken() {
  const key = 'report-checker-anonymous-token'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const token = crypto.randomUUID()
  window.localStorage.setItem(key, token)
  return token
}

function loadDraft(): Draft {
  const fallback = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
  try {
    const saved = window.sessionStorage.getItem(DRAFT_KEY)
    const parsed = draftSchema.safeParse(saved ? JSON.parse(saved) : null)
    if (parsed.success) return parsed.data
  } catch {
    window.sessionStorage.removeItem(DRAFT_KEY)
  }
  return { reportText: '', templateId: fallback.id, rubric: fallback.sections }
}

function App() {
  const [initialDraft] = useState(loadDraft)
  const [state, setState] = useState<AnalysisState>(initialDraft.reportText ? 'input' : 'idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileNotice, setFileNotice] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isExtracting, setIsExtracting] = useState(false)
  const [pdfProgress, setPdfProgress] = useState<{ completed: number; total: number } | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [progressIndex, setProgressIndex] = useState(0)
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null)
  const [analysisCanRetry, setAnalysisCanRetry] = useState(false)
  const [templateId, setTemplateId] = useState(initialDraft.templateId)
  const [rubric, setRubric] = useState<RubricSection[]>(initialDraft.rubric)
  const [showAdvancedRubric, setShowAdvancedRubric] = useState(false)
  const [showReferenceDetails, setShowReferenceDetails] = useState(false)
  const [appendixConfirmed, setAppendixConfirmed] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const progressTimerRef = useRef<number | null>(null)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const analysisInFlightRef = useRef(false)
  const abortReasonRef = useRef<'cancel' | 'timeout' | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)
  const pdfAbortRef = useRef<AbortController | null>(null)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const resultRef = useRef<HTMLElement | null>(null)
  const { register, reset, setValue, watch, formState: { errors }, trigger } = useForm<SourceForm>({
    resolver: zodResolver(sourceSchema), defaultValues: { reportText: initialDraft.reportText }, mode: 'onChange',
  })
  const text = watch('reportText')
  const reportTextField = register('reportText')
  const preparedDocument = useMemo(() => prepareDocument(text), [text])
  const referenceSummary = useMemo(() => analyzeReferences(preparedDocument.mainText), [preparedDocument.mainText])
  const rubricValidation = rubricSchema.safeParse({ version: 'rubric-editor-v1', sections: rubric })
  const enabledWeight = rubric.filter((section) => section.enabled).reduce((total, section) => total + section.weight, 0)
  const exceedsRawLimit = text.length > MAX_RAW_CHARS
  const exceedsAnalysisLimit = preparedDocument.mainText.length > MAX_ANALYSIS_CHARS
  const isTooShort = preparedDocument.mainText.trim().length > 0 && preparedDocument.mainText.trim().length < 100
  const canPreview = Boolean(preparedDocument.mainText.trim()) && !exceedsRawLimit && !exceedsAnalysisLimit && !isExtracting && state !== 'analyzing'

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current)
    analysisAbortRef.current?.abort()
    pdfAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!text.trim()) window.sessionStorage.removeItem(DRAFT_KEY)
      else window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ reportText: text, templateId, rubric }))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [text, templateId, rubric])

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!text.trim() || state === 'result') return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [state, text])

  useEffect(() => {
    if (state !== 'preview') return
    window.requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      previewRef.current?.focus({ preventScroll: true })
    })
  }, [state])

  useEffect(() => {
    if (state !== 'result') return
    window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      resultRef.current?.focus({ preventScroll: true })
    })
  }, [state])

  const markContentChanged = () => {
    if (state !== 'analyzing') setState('input')
    setResult(null)
    setAnalysisMessage(null)
    setAppendixConfirmed(false)
    setPrivacyAccepted(false)
    idempotencyKeyRef.current = null
  }

  const markRubricChanged = (nextRubric: RubricSection[]) => {
    setRubric(nextRubric)
    setResult(null)
    setAnalysisMessage(null)
    idempotencyKeyRef.current = null
    if (state === 'result') setState('ready')
  }

  const editText = () => {
    setState('editing')
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
      editorRef.current?.focus({ preventScroll: true })
    })
  }

  const proceedToPreview = async () => {
    const valid = await trigger('reportText')
    if (!valid || !preparedDocument.mainText.trim() || exceedsAnalysisLimit) {
      setState('error')
      setAnalysisMessage(!preparedDocument.mainText.trim() ? 'กรุณาเพิ่มเนื้อหารายงานหลักก่อนดูตัวอย่าง' : 'เนื้อหารายงานหลักยังยาวเกินขนาดที่รองรับ')
      return
    }
    setAnalysisMessage(null)
    setState('preview')
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setFileNotice(null)
    setWarnings([])
    if (!file) return

    if (!isLikelyPdf(file)) {
      setFileName(null)
      setFileNotice('กรุณาเลือกไฟล์นามสกุล .pdf เท่านั้น')
      setState('error')
      event.target.value = ''
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileName(null)
      setFileNotice('ไฟล์มีขนาดเกิน 10 MB ระบบจึงยังไม่ได้อ่านหรือส่งไฟล์นี้')
      setState('error')
      event.target.value = ''
      return
    }
    if (text.trim() && !window.confirm('การอ่าน PDF จะแทนที่ข้อความที่อยู่ในกล่อง ต้องการดำเนินการต่อหรือไม่?')) {
      event.target.value = ''
      return
    }

    const controller = new AbortController()
    pdfAbortRef.current = controller
    setIsExtracting(true)
    setPdfProgress(null)
    setFileName(file.name)
    setState('input')
    try {
      const extraction = await extractPdfText(file, {
        signal: controller.signal,
        onProgress: (completed, total) => setPdfProgress({ completed, total }),
      })
      setValue('reportText', extraction.text, { shouldDirty: true, shouldValidate: true })
      setWarnings(extraction.warnings)
      setFileNotice(`อ่าน PDF ครบ ${extraction.pageCount} หน้าแล้ว โปรดตรวจข้อความก่อนยืนยัน`)
      setAppendixConfirmed(false)
      setPrivacyAccepted(false)
      setState(extraction.text.trim() && extraction.text.length <= MAX_RAW_CHARS ? 'preview' : 'error')
    } catch (error) {
      if (controller.signal.aborted) {
        setFileNotice('ยกเลิกการอ่าน PDF แล้ว ข้อความเดิมยังไม่ถูกส่งไปที่ AI')
        setState(text.trim() ? 'input' : 'idle')
      } else {
        setFileNotice(error instanceof Error ? error.message : 'ไม่สามารถอ่าน PDF นี้ได้ อาจเป็นไฟล์เสียหายหรือเข้ารหัส')
        setState('error')
      }
    } finally {
      setIsExtracting(false)
      setPdfProgress(null)
      pdfAbortRef.current = null
      event.target.value = ''
    }
  }

  const startAnalysis = async () => {
    if (analysisInFlightRef.current || state === 'analyzing') return
    if (!privacyAccepted || (preparedDocument.appendixHeading && !appendixConfirmed) || !rubricValidation.success) {
      setState('error')
      setAnalysisMessage('กรุณายืนยันเนื้อหา ภาคผนวก และความเป็นส่วนตัวให้ครบก่อนเริ่มตรวจ')
      setAnalysisCanRetry(false)
      return
    }

    analysisInFlightRef.current = true
    const controller = new AbortController()
    analysisAbortRef.current = controller
    abortReasonRef.current = null
    setState('analyzing')
    setResult(null)
    setAnalysisMessage(null)
    setAnalysisCanRetry(false)
    setProgressIndex(0)
    progressTimerRef.current = window.setInterval(() => setProgressIndex((current) => Math.min(current + 1, analysisSteps.length - 2)), 1_500)
    timeoutRef.current = window.setTimeout(() => {
      abortReasonRef.current = 'timeout'
      controller.abort()
    }, getAnalysisTimeoutMs())
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
        idempotencyKeyRef.current ??= crypto.randomUUID()
        const response = await fetch(`${baseUrl}/analyze`, {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKeyRef.current },
          body: JSON.stringify({
            reportText: text,
            anonymousToken: getAnonymousToken(),
            rubric: { version: rubricVersion, sections: rubric },
            referenceSummary: referenceSummary.aiSummary,
            documentOptions: { excludeAppendix: Boolean(preparedDocument.appendixHeading && appendixConfirmed) },
          }),
        })
        const rawPayload = await response.text()
        let payload: (AnalysisResult & { error?: string; code?: string; retryable?: boolean }) | null = null
        try { payload = JSON.parse(rawPayload) as AnalysisResult & { error?: string; code?: string; retryable?: boolean } } catch { payload = null }
        if (!response.ok || !payload || payload.error) {
          const message = payload?.error ?? 'ระบบตอบกลับในรูปแบบที่อ่านไม่ได้ โปรดลองใหม่ภายหลัง'
          const error = new Error(message) as Error & { retryable?: boolean }
          error.retryable = payload?.retryable ?? response.status >= 500
          throw error
        }
        setResult(payload)
      }
      setProgressIndex(analysisSteps.length - 1)
      setState('result')
      window.sessionStorage.removeItem(DRAFT_KEY)
    } catch (error) {
      if (controller.signal.aborted) {
        setState('ready')
        setAnalysisCanRetry(abortReasonRef.current === 'timeout')
        setAnalysisMessage(abortReasonRef.current === 'timeout'
          ? 'การตรวจใช้เวลานานเกิน 2 นาที คุณสามารถลองอีกครั้งด้วยคำขอเดิมได้'
          : 'ยกเลิกการตรวจแล้ว หาก Worker ทำงานเสร็จภายหลัง การลองอีกครั้งจะใช้คำขอเดิมเพื่อลดการตรวจซ้ำ')
      } else {
        setState('error')
        setAnalysisCanRetry(Boolean((error as Error & { retryable?: boolean }).retryable))
        setAnalysisMessage(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด โปรดลองใหม่อีกครั้ง')
      }
    } finally {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current)
      analysisAbortRef.current = null
      analysisInFlightRef.current = false
    }
  }

  const cancelAnalysis = () => {
    abortReasonRef.current = 'cancel'
    analysisAbortRef.current?.abort()
  }

  const selectTemplate = (nextTemplateId: string) => {
    const nextTemplate = cloneRubricTemplate(nextTemplateId)
    const currentTemplate = cloneRubricTemplate(templateId)
    const hasCustomChanges = JSON.stringify(rubric) !== JSON.stringify(currentTemplate.sections)
    if (hasCustomChanges && !window.confirm('การเปลี่ยนเทมเพลตจะแทนที่เกณฑ์ที่แก้ไว้ ต้องการดำเนินการต่อหรือไม่?')) return
    setTemplateId(nextTemplate.id)
    markRubricChanged(nextTemplate.sections)
  }

  const updateSection = (id: string, changes: Partial<RubricSection>) => {
    markRubricChanged(rubric.map((section) => section.id === id ? { ...section, ...changes } : section))
  }

  const addSection = () => {
    markRubricChanged([...rubric, { id: `custom-${crypto.randomUUID()}`, title: 'หัวข้อใหม่', criteria: 'อธิบายสิ่งที่ต้องการให้ AI ช่วยตรวจ', weight: 1, enabled: true }])
  }

  const removeSection = (section: RubricSection) => {
    if (!window.confirm(`ลบหัวข้อ “${section.title}” หรือไม่?`)) return
    markRubricChanged(rubric.filter((item) => item.id !== section.id))
  }

  const clearDraft = () => {
    if (text.trim() && !window.confirm('ล้างข้อความและการตั้งค่าทั้งหมดในแท็บนี้หรือไม่?')) return
    const fallback = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
    reset({ reportText: '' })
    setTemplateId(fallback.id)
    setRubric(fallback.sections)
    setState('idle')
    setResult(null)
    setFileName(null)
    setFileNotice(null)
    setWarnings([])
    setAppendixConfirmed(false)
    setPrivacyAccepted(false)
    setAnalysisMessage(null)
    idempotencyKeyRef.current = null
    window.sessionStorage.removeItem(DRAFT_KEY)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-indigo-700"><ShieldCheck className="size-4" /> ผู้ช่วยตรวจรายงานด้วย AI</div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">ตรวจรายงานก่อนส่งอาจารย์</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">วางข้อความหรือเลือก PDF แล้วตรวจทีละขั้น ระบบจะบอกส่วนที่พบ สิ่งที่อาจขาด และแนวทางปรับปรุง</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="w-fit" aria-live="polite">สถานะ: {stateLabels[state]}</Badge>
            {text.trim() && <Button type="button" size="sm" variant="ghost" onClick={clearDraft}><RotateCcw />เริ่มใหม่</Button>}
          </div>
        </header>

        <Alert className="mb-6 border-amber-200 bg-amber-50 text-amber-950">
          <AlertCircle className="size-4" />
          <AlertTitle>ใช้เป็นผู้ช่วยทบทวนเท่านั้น</AlertTitle>
          <AlertDescription>AI อาจคลาดเคลื่อน ผลไม่ใช่คำตัดสินแทนอาจารย์ และระบบนี้ไม่ตรวจหรือรับรองการลอกเลียนผลงาน</AlertDescription>
        </Alert>

        <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
          <Card>
            <CardHeader><CardTitle>ขั้นที่ 1 — เพิ่มรายงาน</CardTitle><CardDescription>รองรับเนื้อหารายงานหลักไม่เกิน 200,000 ตัวอักษร และ PDF ไม่เกิน 10 MB</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="report-text">ข้อความรายงาน</label>
                <Textarea
                  id="report-text" aria-label="ข้อความรายงาน" className="h-80 resize-none overflow-y-scroll leading-6"
                  placeholder="วางเนื้อหารายงานที่นี่…" {...reportTextField}
                  ref={(element) => { reportTextField.ref(element); editorRef.current = element }}
                  onChange={(event) => { reportTextField.onChange(event); markContentChanged() }}
                  disabled={state === 'analyzing' || isExtracting}
                />
                <div className="flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:justify-between sm:gap-4">
                  <span>{errors.reportText?.message ?? 'ร่างถูกเก็บเฉพาะในแท็บนี้ และจะยังไม่ส่งจนกว่าคุณจะยืนยัน'}</span>
                  <span className={exceedsRawLimit || exceedsAnalysisLimit ? 'font-medium text-red-700' : ''}>{text.length.toLocaleString()} ตัวอักษรทั้งหมด · {preparedDocument.mainText.length.toLocaleString()} ตัวอักษรที่จะวิเคราะห์</span>
                </div>
              </div>

              {(exceedsRawLimit || exceedsAnalysisLimit) && <Alert className="border-red-200 bg-red-50 text-red-950"><AlertCircle className="size-4" /><AlertTitle>เอกสารยังยาวเกินขนาดที่รองรับ</AlertTitle><AlertDescription>ระบบยังไม่ได้ตัดข้อความหรือส่งข้อมูลส่วนใด เนื้อหารายงานหลักต้องไม่เกิน {MAX_ANALYSIS_CHARS.toLocaleString()} ตัวอักษร และข้อความทั้งหมดรวมภาคผนวกต้องไม่เกิน {MAX_RAW_CHARS.toLocaleString()} ตัวอักษร</AlertDescription></Alert>}
              {isTooShort && <Alert className="border-sky-200 bg-sky-50 text-sky-950"><AlertCircle className="size-4" /><AlertTitle>รายงานค่อนข้างสั้น</AlertTitle><AlertDescription>ยังดูตัวอย่างได้ แต่ผล AI อาจไม่ครบถ้วน ควรใส่เนื้อหาหลักมากกว่า 100 ตัวอักษร</AlertDescription></Alert>}

              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md text-sm font-medium focus-within:ring-2 focus-within:ring-indigo-500" htmlFor="pdf-upload"><Upload className="size-5 text-indigo-600" /> อัปโหลด PDF <span className="font-normal text-slate-500">(ไม่เกิน 10 MB)</span></label>
                <input id="pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={state === 'analyzing' || isExtracting} />
                {isExtracting && <div className="mt-3 space-y-2"><p className="flex items-center gap-2 text-sm text-indigo-700"><LoaderCircle className="size-4 animate-spin" />กำลังอ่านข้อความจาก PDF {pdfProgress ? `${pdfProgress.completed}/${pdfProgress.total} หน้า` : ''}</p>{pdfProgress && <Progress value={(pdfProgress.completed / pdfProgress.total) * 100} />}<Button type="button" size="sm" variant="outline" onClick={() => pdfAbortRef.current?.abort()}>ยกเลิกการอ่าน PDF</Button></div>}
                {fileName && <p className="mt-2 break-all text-sm text-slate-700"><FileText className="mr-1 inline size-4" />{fileName}</p>}
                {fileNotice && <p className="mt-2 text-sm leading-6 text-slate-600" aria-live="polite">{fileNotice}</p>}
              </div>
              {warnings.map((warning) => <Alert key={warning} className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle className="size-4" /><AlertTitle>โปรดตรวจข้อความจาก PDF</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert>)}
              <div>
                <Button className="w-full sm:w-auto" onClick={proceedToPreview} disabled={!canPreview}>ตรวจสอบและดูตัวอย่าง</Button>
                {!text.trim() && <p className="mt-2 text-sm text-slate-500">วางข้อความหรือเลือก PDF ก่อน ปุ่มนี้จึงจะกดได้</p>}
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader><CardTitle>ความเป็นส่วนตัว</CardTitle><CardDescription>ข้อมูลที่ควรรู้ก่อนเริ่มตรวจ</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
              <p>เมื่อคุณกดยืนยัน เนื้อหารายงานหลักจะถูกส่งไปยัง Google Gemini ผ่าน Cloudflare Worker โดย API key ไม่อยู่ใน browser</p>
              <p>ระบบไม่เก็บไฟล์หรือข้อความต้นฉบับถาวรและไม่บันทึกเนื้อหารายงานใน log ผลสำเร็จอาจถูกเก็บใน KV ไม่เกิน 10 นาทีเพื่อป้องกันคำขอซ้ำ</p>
              <p>ร่างในหน้านี้เก็บเฉพาะ session ของแท็บบนอุปกรณ์ของคุณ คุณล้างได้ด้วยปุ่ม “เริ่มใหม่”</p>
              <p className="font-medium text-slate-800">MVP นี้สำหรับผู้ใช้อายุ 18 ปีขึ้นไป หากอายุต่ำกว่า 18 ปีอย่าส่งข้อมูลเข้าสู่ระบบ</p>
              <a className="inline-flex min-h-11 items-center text-indigo-700 underline underline-offset-4" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">อ่านนโยบายความเป็นส่วนตัวของ Google</a>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6">
          <CardHeader><CardTitle>ขั้นที่ 2 — เลือกเกณฑ์การตรวจ</CardTitle><CardDescription>ใช้ค่าเริ่มต้นได้ทันที หรือเปิดการตั้งค่าขั้นสูงเมื่อต้องการแก้น้ำหนักและหัวข้อ</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,24rem)_auto] sm:items-end">
              <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="rubric-template">รูปแบบรายงาน<select id="rubric-template" className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base" value={templateId} onChange={(event) => selectTemplate(event.target.value)}>{rubricTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
              <div className="flex flex-wrap gap-2"><Badge variant="outline">ใช้ {rubric.filter((section) => section.enabled).length}/{rubric.length} หัวข้อ</Badge><Badge variant="outline">น้ำหนักรวม {Number.isFinite(enabledWeight) ? enabledWeight : 'ไม่ถูกต้อง'}</Badge></div>
            </div>
            <Button type="button" variant="outline" aria-expanded={showAdvancedRubric} onClick={() => setShowAdvancedRubric((value) => !value)}><ChevronDown className={showAdvancedRubric ? 'rotate-180 transition-transform' : 'transition-transform'} />{showAdvancedRubric ? 'ซ่อนการตั้งค่าขั้นสูง' : 'แก้ไขหัวข้อและน้ำหนัก'}</Button>
            {showAdvancedRubric && <div className="space-y-3" aria-label="การตั้งค่าเกณฑ์ขั้นสูง">
              {rubric.map((section) => <div key={section.id} className={`rounded-lg border p-4 ${section.enabled ? 'bg-white' : 'bg-slate-100 opacity-75'}`}>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_7rem_auto] lg:items-start">
                  <label className="space-y-1 text-sm font-medium text-slate-600"><span>ชื่อหัวข้อ</span><Input aria-label={`ชื่อหัวข้อ ${section.title}`} value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium text-slate-600"><span>สิ่งที่ต้องการตรวจ</span><Textarea aria-label={`เกณฑ์ ${section.title}`} className="min-h-24" value={section.criteria} onChange={(event) => updateSection(section.id, { criteria: event.target.value })} /></label>
                  <label className="space-y-1 text-sm font-medium text-slate-600"><span>น้ำหนัก</span><Input aria-label={`น้ำหนัก ${section.title}`} type="number" min="0" step="0.5" value={Number.isNaN(section.weight) ? '' : section.weight} onChange={(event) => updateSection(section.id, { weight: event.target.valueAsNumber })} /></label>
                  <div className="flex flex-wrap gap-2 lg:pt-7"><Button type="button" size="sm" variant={section.enabled ? 'outline' : 'secondary'} onClick={() => updateSection(section.id, { enabled: !section.enabled })}>{section.enabled ? 'ไม่นำมาคิดคะแนน' : 'นำมาคิดคะแนน'}</Button><Button type="button" size="sm" variant="destructive" aria-label={`ลบ ${section.title}`} onClick={() => removeSection(section)}>ลบหัวข้อ</Button></div>
                </div>
              </div>)}
              <Button type="button" variant="outline" onClick={addSection}>เพิ่มหัวข้อใหม่</Button>
            </div>}
            {!rubricValidation.success && <Alert className="border-red-200 bg-red-50 text-red-950"><AlertCircle className="size-4" /><AlertTitle>เกณฑ์ยังไม่พร้อม</AlertTitle><AlertDescription>{rubricValidation.error.issues.map((issue) => issue.message).join(' · ')}</AlertDescription></Alert>}
          </CardContent>
        </Card>

        {(state === 'preview' || state === 'editing' || state === 'ready') && <Card ref={previewRef} tabIndex={-1} className="mt-6 scroll-mt-4 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-indigo-500">
          <CardHeader><CardTitle>ขั้นที่ 3 — ตรวจและยืนยันก่อนส่ง</CardTitle><CardDescription>เฉพาะข้อความในกรอบด้านล่างจะถูกนำไปวิเคราะห์</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border bg-slate-50 p-4 text-sm leading-6">{preparedDocument.mainText}</div>
            {preparedDocument.appendixHeading && <Alert className="border-sky-200 bg-sky-50 text-sky-950"><AlertCircle className="size-4" /><AlertTitle>พบส่วน “{preparedDocument.appendixHeading}”</AlertTitle><AlertDescription>ระบบจะไม่นำภาคผนวกจำนวน {preparedDocument.excludedCharCount.toLocaleString()} ตัวอักษรไปวิเคราะห์ เนื้อหาต้นฉบับในกล่องด้านบนยังอยู่ครบ</AlertDescription></Alert>}
            <label className="flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm leading-6"><input className="mt-1 size-5 shrink-0 accent-indigo-600" type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} /><span>ฉันยืนยันว่ามีอายุ 18 ปีขึ้นไป เข้าใจว่าเนื้อหาหลักจะถูกส่งให้ Google Gemini และผล AI อาจคลาดเคลื่อน</span></label>
            {preparedDocument.appendixHeading && <label className="flex min-h-11 items-start gap-3 rounded-lg border p-3 text-sm leading-6"><input className="mt-1 size-5 shrink-0 accent-indigo-600" type="checkbox" checked={appendixConfirmed} onChange={(event) => setAppendixConfirmed(event.target.checked)} /><span>ฉันตรวจแล้วและยืนยันว่าไม่นำส่วน “{preparedDocument.appendixHeading}” ไปวิเคราะห์</span></label>}
            <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={editText}>กลับไปแก้ข้อความ</Button>{state !== 'ready' ? <Button onClick={() => setState('ready')} disabled={!privacyAccepted || Boolean(preparedDocument.appendixHeading && !appendixConfirmed)}><CheckCircle2 />ยืนยันเนื้อหา</Button> : <Button onClick={startAnalysis} disabled={!rubricValidation.success}>เริ่มตรวจด้วย {import.meta.env.VITE_USE_MOCK_ANALYSIS !== 'false' ? 'ข้อมูลตัวอย่าง' : 'AI'}</Button>}</div>
          </CardContent>
        </Card>}

        {state === 'analyzing' && <Card className="mt-6" aria-live="polite"><CardHeader><CardTitle className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />กำลังตรวจรายงาน</CardTitle><CardDescription>รายการด้านล่างเป็นความคืบหน้าโดยประมาณ เอกสารยาวอาจใช้เวลาถึง 2 นาที</CardDescription></CardHeader><CardContent className="space-y-4"><Progress value={((progressIndex + 1) / analysisSteps.length) * 100} /><ol className="space-y-2 text-sm">{analysisSteps.map((step, index) => <li key={step} className={index < progressIndex ? 'text-emerald-700' : index === progressIndex ? 'font-medium text-indigo-700' : 'text-slate-400'}>{index < progressIndex ? '✓' : index === progressIndex ? '•' : '○'} {step}</li>)}</ol><Button variant="outline" onClick={cancelAnalysis}>ยกเลิกการตรวจ</Button></CardContent></Card>}

        {analysisMessage && <Alert className={`mt-6 ${state === 'error' ? 'border-red-200 bg-red-50 text-red-950' : 'border-sky-200 bg-sky-50 text-sky-950'}`} aria-live="assertive"><AlertCircle className="size-4" /><AlertTitle>{state === 'error' ? 'ยังตรวจรายงานไม่ได้' : 'สถานะการตรวจ'}</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{analysisMessage}{analysisCanRetry && <Button size="sm" variant="outline" onClick={startAnalysis}>ลองอีกครั้งด้วยคำขอเดิม</Button>}</AlertDescription></Alert>}

        {state === 'result' && result && <section ref={resultRef} tabIndex={-1} className="mt-6 scroll-mt-4 space-y-6 outline-none" aria-label="ผลวิเคราะห์">
          <Card className="border-emerald-200"><CardHeader><CardTitle>ผลตรวจเบื้องต้น</CardTitle><CardDescription>โมเดล {result.model} · เกณฑ์รุ่น {result.rubricVersion}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-slate-600">คะแนนรวมคำนวณด้วยโค้ดจากหัวข้อที่เปิดใช้งาน</p><p className="mt-1 text-5xl font-semibold text-emerald-700">{result.overallScore}%</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{result.sections.length} หัวข้อ</Badge><Button variant="outline" onClick={() => { setResult(null); setState('ready') }}>ตรวจอีกครั้ง</Button></div></CardContent></Card>
          <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle className="size-4" /><AlertTitle>AI อาจคลาดเคลื่อน</AlertTitle><AlertDescription>ใช้ผลนี้ช่วยทบทวนงาน ไม่ใช่คำตัดสินแทนอาจารย์ และไม่ใช่ผลตรวจลอกเลียนผลงาน</AlertDescription></Alert>
          <div className="grid gap-4 lg:grid-cols-2">{result.sections.map((section) => <Card key={section.id}><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>{section.title}</CardTitle><CardDescription>น้ำหนัก {section.weight} · ความมั่นใจของ AI {Math.round(section.confidence * 100)}%</CardDescription></div><Badge>{section.score}/3</Badge></div></CardHeader><CardContent className="space-y-3 text-sm"><div><p className="font-medium">เหตุผล</p><p className="mt-1 leading-6 text-slate-600">{section.reason}</p></div><div><p className="font-medium">หลักฐานที่พบ</p>{section.evidence.length ? <ul className="mt-1 list-disc space-y-1 pl-5 leading-6 text-slate-600">{section.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1 text-slate-500">ยังไม่พบหลักฐานชัดเจน</p>}</div><div><p className="font-medium">สิ่งที่อาจขาด</p>{section.missing.length ? <ul className="mt-1 list-disc space-y-1 pl-5 leading-6 text-slate-600">{section.missing.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1 text-slate-500">AI ไม่ได้ระบุสิ่งที่ขาด</p>}</div><div><p className="font-medium">คำแนะนำ</p><p className="mt-1 leading-6 text-slate-600">{section.recommendation}</p></div></CardContent></Card>)}</div>
          <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>ความสอดคล้องระหว่างบท</CardTitle><CardDescription>วัตถุประสงค์ · วิธีดำเนินงาน · ผล · สรุปผล</CardDescription></CardHeader><CardContent>{result.consistencyNotes.length ? <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{result.consistencyNotes.map((note) => <li key={note}>{note}</li>)}</ul> : <p className="text-sm text-slate-500">AI ไม่ได้ระบุข้อสังเกตเพิ่มเติม</p>}</CardContent></Card><Card><CardHeader><CardTitle>เอกสารอ้างอิง</CardTitle><CardDescription>ผลตรวจรูปแบบเบื้องต้น โปรดยืนยันกับเกณฑ์รายวิชา</CardDescription></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-slate-700"><p>{result.referenceComment}</p>{referenceSummary.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5">{referenceSummary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</CardContent></Card></div>
          {result.qualityWarnings.length > 0 && <Card><CardHeader><CardTitle>คำเตือนคุณภาพข้อความ</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">{result.qualityWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></CardContent></Card>}
        </section>}

        <Card className="mt-6">
          <CardHeader><CardTitle>ข้อมูลอ้างอิงที่ระบบพบ</CardTitle><CardDescription>ตรวจด้วยกฎพื้นฐานเท่านั้น ไม่ยืนยันว่าแหล่งอ้างอิงมีอยู่จริงหรือถูกต้อง</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">รายการท้ายเล่ม {referenceSummary.bibliographyEntryCount}</Badge><Badge variant="outline">อ้างอิงแบบตัวเลข {referenceSummary.numericCitationIds.length}</Badge><Badge variant="outline">ผู้แต่ง-ปี {referenceSummary.authorYearCitationCount}</Badge></div>
            <Button type="button" variant="outline" aria-expanded={showReferenceDetails} onClick={() => setShowReferenceDetails((value) => !value)}><ChevronDown className={showReferenceDetails ? 'rotate-180 transition-transform' : 'transition-transform'} />{showReferenceDetails ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียดการตรวจอ้างอิง'}</Button>
            {showReferenceDetails && <div className="space-y-4"><Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle className="size-4" /><AlertTitle>ตรวจพบเบื้องต้น โปรดยืนยัน</AlertTitle><AlertDescription>ระบบส่งให้ AI เฉพาะจำนวนและสถานะสรุป ไม่ให้ AI นับรายการทั้งหมดเอง</AlertDescription></Alert>{referenceSummary.warnings.length > 0 ? <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">{referenceSummary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="text-sm text-emerald-700">ไม่พบข้อสังเกตจากกฎเบื้องต้น โปรดยืนยันรูปแบบกับเกณฑ์รายวิชาอีกครั้ง</p>}{referenceSummary.potentiallyUncitedEntries.length > 0 && <div className="rounded-lg border bg-slate-50 p-3"><p className="text-sm font-medium">รายการที่อาจยังไม่ถูกอ้างในเนื้อหา</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600">{referenceSummary.potentiallyUncitedEntries.slice(0, 5).map((entry) => <li key={entry}>{entry}</li>)}</ul></div>}</div>}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default App
