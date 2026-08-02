import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, ChevronDown, Copy, Download, FileText, LoaderCircle, RotateCcw, Upload } from 'lucide-react'
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
import { API_VERSION, API_VERSION_HEADER } from '../shared/api-contract'
import { createMockAnalysis, formatAnalysisResult, formatOverallScore, isNotApplicable, NOT_APPLICABLE_BADGE, parseAnalysisResponse, type AnalysisResult } from './lib/analysis'
import { isLikelyPdf, MAX_ANALYSIS_CHARS, MAX_FILE_BYTES, MAX_RAW_CHARS, PDF_LIMITS_LABEL, prepareDocument } from './lib/document'
import { extractPdfText } from './lib/pdf'
import { analyzeReferences } from './lib/references'
import { cloneRubricTemplate, DEFAULT_RUBRIC_TEMPLATE_ID, getDefaultRubricTemplate, getRubricTemplatesForDocumentType, inferDocumentTypeFromTemplate, rubricSchema, rubricSectionSchema, rubricTemplates, type RubricSection } from './lib/rubric'
import { DOCUMENT_TYPES, documentTypeDefinitions, getDocumentTypeDefinition, type DocumentType } from '../shared/document-types'

const DRAFT_KEY = 'report-checker-session-draft-v1'
const PRODUCTION_API_BASE_URL = 'https://report-checker-ai-api.oomzazato01.workers.dev/api'

function usesMockAnalysis() {
  const configured = import.meta.env.VITE_USE_MOCK_ANALYSIS
  return configured ? configured !== 'false' : import.meta.env.DEV
}

function getApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? PRODUCTION_API_BASE_URL : '/api')
}

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
  documentType: z.enum(DOCUMENT_TYPES).optional(),
  templateId: z.string(),
  rubric: z.array(rubricSectionSchema),
})
const apiErrorSchema = z.object({
  error: z.string().trim().min(1),
  code: z.string().optional(),
  retryable: z.boolean().optional(),
})
type Draft = {
  reportText: string
  documentType: DocumentType
  templateId: string
  rubric: RubricSection[]
}

export type AnalysisState = 'idle' | 'input' | 'preview' | 'editing' | 'ready' | 'analyzing' | 'result' | 'error'

const stateLabels: Record<AnalysisState, string> = {
  idle: 'พร้อมเริ่ม', input: 'กำลังเตรียมเอกสาร', preview: 'กำลังตรวจตัวอย่าง', editing: 'กำลังแก้ไข',
  ready: 'พร้อมส่งตรวจ', analyzing: 'AI กำลังตรวจ', result: 'ตรวจเสร็จแล้ว', error: 'ต้องตรวจข้อมูลอีกครั้ง',
}

const analysisSteps = ['ตรวจขนาดเอกสาร', 'เตรียมเกณฑ์การตรวจ', 'ส่งข้อมูลผ่านระบบที่ปลอดภัย', 'AI อ่านเอกสาร', 'ตรวจความครบถ้วนของคำตอบ', 'รวมผลแต่ละหัวข้อ', 'คำนวณคะแนนรวม']

function getAnonymousToken() {
  const key = 'report-checker-anonymous-token'
  const token = crypto.randomUUID()
  try {
    const existing = window.localStorage.getItem(key)
    if (existing) return existing
    window.localStorage.setItem(key, token)
  } catch {
    // Browsers can block storage in strict privacy modes. A session-only token still allows analysis.
  }
  return token
}

function removeStoredDraft() {
  try { window.sessionStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be unavailable. */ }
}

function saveDraft(draft: Draft) {
  try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* Keep the in-memory form usable. */ }
}

function loadDraft(): Draft {
  const fallback = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
  try {
    const saved = window.sessionStorage.getItem(DRAFT_KEY)
    const parsed = draftSchema.safeParse(saved ? JSON.parse(saved) : null)
    if (parsed.success) {
      const savedTemplate = rubricTemplates.find((template) => template.id === parsed.data.templateId)
      const documentType = savedTemplate?.documentType
        ?? parsed.data.documentType
        ?? inferDocumentTypeFromTemplate(parsed.data.templateId)
      const replacementTemplate = getDefaultRubricTemplate(documentType)
      return {
        ...parsed.data,
        documentType,
        templateId: savedTemplate?.id ?? replacementTemplate.id,
        // Preserve edits only while their source template still exists. A
        // retired/unknown template cannot safely lend its rubric to a new id.
        rubric: savedTemplate ? parsed.data.rubric : replacementTemplate.sections.map((section) => ({ ...section })),
      }
    }
  } catch {
    removeStoredDraft()
  }
  return { reportText: '', documentType: fallback.documentType, templateId: fallback.id, rubric: fallback.sections }
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
  const [resultActionMessage, setResultActionMessage] = useState<string | null>(null)
  const [anonymousToken] = useState(getAnonymousToken)
  const [documentType, setDocumentType] = useState<DocumentType>(initialDraft.documentType)
  const [templateId, setTemplateId] = useState(initialDraft.templateId)
  const [rubric, setRubric] = useState<RubricSection[]>(initialDraft.rubric)
  const [showAdvancedRubric, setShowAdvancedRubric] = useState(false)
  const [showReferenceDetails, setShowReferenceDetails] = useState(false)
  const [appendixConfirmed, setAppendixConfirmed] = useState(false)
  const [appendixConfirmationOpen, setAppendixConfirmationOpen] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const progressTimerRef = useRef<number | null>(null)
  const analysisAbortRef = useRef<AbortController | null>(null)
  const analysisInFlightRef = useRef(false)
  const abortReasonRef = useRef<'cancel' | 'timeout' | null>(null)
  const idempotencyKeyRef = useRef<string | null>(null)
  const pdfAbortRef = useRef<AbortController | null>(null)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const analyzingRef = useRef<HTMLElement | null>(null)
  const resultRef = useRef<HTMLElement | null>(null)
  const appendixDialogRef = useRef<HTMLDivElement | null>(null)
  const appendixConfirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const { register, reset, setValue, watch, formState: { errors }, trigger } = useForm<SourceForm>({
    resolver: zodResolver(sourceSchema), defaultValues: { reportText: initialDraft.reportText }, mode: 'onChange',
  })
  const text = watch('reportText')
  const reportTextField = register('reportText')
  const preparedDocument = useMemo(() => prepareDocument(text), [text])
  const referenceSummary = useMemo(() => analyzeReferences(preparedDocument.mainText), [preparedDocument.mainText])
  const rubricValidation = rubricSchema.safeParse({ version: 'rubric-editor-v1', sections: rubric })
  const documentTypeDefinition = getDocumentTypeDefinition(documentType)
  const availableRubricTemplates = getRubricTemplatesForDocumentType(documentType)
  const enabledWeight = rubric.filter((section) => section.enabled).reduce((total, section) => total + section.weight, 0)
  const exceedsRawLimit = text.length > MAX_RAW_CHARS
  const exceedsAnalysisLimit = preparedDocument.mainText.length > MAX_ANALYSIS_CHARS
  const isTooShort = preparedDocument.mainText.trim().length > 0 && preparedDocument.mainText.trim().length < 100
  const controlsLocked = state === 'analyzing' || isExtracting
  const canAnalyze = Boolean(preparedDocument.mainText.trim()) && !exceedsRawLimit && !exceedsAnalysisLimit && !controlsLocked && state !== 'result' && rubricValidation.success
  const priorityItems = useMemo(() => {
    if (!result) return []
    // Sections that do not apply to this kind of work carry no gap to fix.
    return result.sections.filter((section) => !isNotApplicable(section))
      .sort((left, right) => left.score - right.score || right.weight - left.weight)
      .flatMap((section) => section.missing.map((missing) => ({ section: section.title, missing, recommendation: section.recommendation })))
      .slice(0, 6)
  }, [result])

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current)
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current)
    analysisAbortRef.current?.abort()
    pdfAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!text.trim()) removeStoredDraft()
      else saveDraft({ reportText: text, documentType, templateId, rubric })
    }, 300)
    return () => window.clearTimeout(timer)
  }, [text, documentType, templateId, rubric])

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
    if (state !== 'analyzing') return
    const frame = window.requestAnimationFrame(() => {
      analyzingRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      analyzingRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [state])

  useEffect(() => {
    if (state !== 'result') return
    window.requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      resultRef.current?.focus({ preventScroll: true })
    })
  }, [state])

  const markContentChanged = (nextText: string) => {
    if (state !== 'analyzing') setState(nextText.trim() ? 'input' : 'idle')
    setResult(null)
    setAnalysisMessage(null)
    setResultActionMessage(null)
    setAppendixConfirmed(false)
    idempotencyKeyRef.current = null
  }

  const markRubricChanged = (nextRubric: RubricSection[]) => {
    setRubric(nextRubric)
    setResult(null)
    setAnalysisMessage(null)
    idempotencyKeyRef.current = null
    if (state === 'result') setState('ready')
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
      setFileNotice(`ไฟล์มีขนาดเกิน ${MAX_FILE_BYTES / (1024 * 1024)} MB ระบบจึงยังไม่ได้อ่านหรือส่งไฟล์นี้`)
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
      setFileNotice(`อ่าน PDF ครบ ${extraction.pageCount} หน้าแล้ว ตรวจแก้ข้อความในกล่องด้านบนได้ก่อนกดตรวจเอกสาร`)
      setAppendixConfirmed(false)
      setState(extraction.text.trim() && extraction.text.length <= MAX_RAW_CHARS ? 'input' : 'error')
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

  const startAnalysis = async (appendixIsConfirmed = appendixConfirmed) => {
    if (analysisInFlightRef.current || state === 'analyzing') return
    analysisInFlightRef.current = true

    const valid = await trigger('reportText')
    if (!valid || !preparedDocument.mainText.trim() || exceedsAnalysisLimit || exceedsRawLimit) {
      setState('error')
      setAnalysisMessage(!preparedDocument.mainText.trim() ? 'กรุณาเพิ่มเนื้อหาเอกสารหลักก่อนเริ่มตรวจ' : 'เนื้อหาเอกสารยังยาวเกินขนาดที่รองรับ ระบบยังไม่ได้ตัดหรือส่งข้อความส่วนใด')
      setAnalysisCanRetry(false)
      analysisInFlightRef.current = false
      return
    }

    if (!rubricValidation.success) {
      setState('error')
      setAnalysisMessage('เกณฑ์การตรวจยังไม่พร้อม โปรดแก้ไขหัวข้อหรือน้ำหนักก่อนเริ่มตรวจ')
      setAnalysisCanRetry(false)
      analysisInFlightRef.current = false
      return
    }

    const excludeAppendix = appendixIsConfirmed
    if (preparedDocument.appendixHeading && !excludeAppendix) {
      setAppendixConfirmationOpen(true)
      setAnalysisMessage(null)
      setAnalysisCanRetry(false)
      analysisInFlightRef.current = false
      return
    }
    if (preparedDocument.appendixHeading && excludeAppendix) {
      setAppendixConfirmed(true)
    }

    const controller = new AbortController()
    analysisAbortRef.current = controller
    abortReasonRef.current = null
    setState('analyzing')
    setResult(null)
    setAnalysisMessage(null)
    setAnalysisCanRetry(false)
    setResultActionMessage(null)
    setProgressIndex(0)
    progressTimerRef.current = window.setInterval(() => setProgressIndex((current) => Math.min(current + 1, analysisSteps.length - 2)), 1_500)
    timeoutRef.current = window.setTimeout(() => {
      abortReasonRef.current = 'timeout'
      controller.abort()
    }, getAnalysisTimeoutMs())
    const rubricVersion = rubricTemplates.find((template) => template.id === templateId)?.version ?? 'custom-rubric-v1'
    try {
      if (usesMockAnalysis()) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 600)
          controller.signal.addEventListener('abort', () => { window.clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')) }, { once: true })
        })
        setResult(createMockAnalysis(rubric, referenceSummary, rubricVersion, documentType))
      } else {
        const baseUrl = getApiBaseUrl()
        idempotencyKeyRef.current ??= crypto.randomUUID()
        const response = await fetch(`${baseUrl}/analyze`, {
          method: 'POST', signal: controller.signal,
          headers: { 'content-type': 'application/json', 'Idempotency-Key': idempotencyKeyRef.current, [API_VERSION_HEADER]: String(API_VERSION) },
          body: JSON.stringify({
            reportText: text,
            documentType,
            anonymousToken,
            rubric: { version: rubricVersion, sections: rubric },
            referenceSummary: referenceSummary.aiSummary,
            documentOptions: { excludeAppendix: Boolean(preparedDocument.appendixHeading && excludeAppendix) },
          }),
        })
        const rawPayload = await response.text()
        let payload: unknown
        try { payload = JSON.parse(rawPayload) as unknown } catch { payload = undefined }
        const parsedError = apiErrorSchema.safeParse(payload)
        if (!response.ok || parsedError.success) {
          // The stored request no longer matches this key, so retrying with it
          // would only conflict again. Drop it and let the next attempt mint one.
          if (parsedError.success && parsedError.data.code === 'IDEMPOTENCY_CONFLICT') idempotencyKeyRef.current = null
          const message = parsedError.success ? parsedError.data.error : 'ระบบตอบกลับในรูปแบบที่อ่านไม่ได้ โปรดลองใหม่ภายหลัง'
          const error = new Error(message) as Error & { retryable?: boolean }
          error.retryable = parsedError.success ? (parsedError.data.retryable ?? response.status >= 500) : response.status >= 500
          throw error
        }
        const parsedResult = parseAnalysisResponse(payload, { documentType, rubricVersion, sections: rubric })
        if (!parsedResult.ok) {
          const error = new Error(parsedResult.message) as Error & { retryable?: boolean }
          error.retryable = parsedResult.retryable
          throw error
        }
        setResult(parsedResult.result)
      }
      setProgressIndex(analysisSteps.length - 1)
      setState('result')
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
    setDocumentType(nextTemplate.documentType)
    setTemplateId(nextTemplate.id)
    markRubricChanged(nextTemplate.sections)
  }

  const selectDocumentType = (nextDocumentType: DocumentType) => {
    if (nextDocumentType === documentType) return
    const currentTemplate = cloneRubricTemplate(templateId)
    const hasCustomChanges = JSON.stringify(rubric) !== JSON.stringify(currentTemplate.sections)
    if (hasCustomChanges && !window.confirm('การเปลี่ยนประเภทงานจะแทนที่เกณฑ์ที่แก้ไว้ ต้องการดำเนินการต่อหรือไม่?')) return
    const nextTemplate = getDefaultRubricTemplate(nextDocumentType)
    setDocumentType(nextDocumentType)
    setTemplateId(nextTemplate.id)
    markRubricChanged(nextTemplate.sections.map((section) => ({ ...section })))
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
    if (controlsLocked) return
    if (text.trim() && !window.confirm('ล้างข้อความและการตั้งค่าทั้งหมดในแท็บนี้หรือไม่?')) return
    const fallback = cloneRubricTemplate(DEFAULT_RUBRIC_TEMPLATE_ID)
    reset({ reportText: '' })
    setDocumentType(fallback.documentType)
    setTemplateId(fallback.id)
    setRubric(fallback.sections)
    setState('idle')
    setResult(null)
    setFileName(null)
    setFileNotice(null)
    setWarnings([])
    setAppendixConfirmed(false)
    setAnalysisMessage(null)
    setResultActionMessage(null)
    idempotencyKeyRef.current = null
    removeStoredDraft()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const prepareNewAnalysis = () => {
    idempotencyKeyRef.current = null
    setResult(null)
    setResultActionMessage(null)
    setState('ready')
    window.requestAnimationFrame(() => editorRef.current?.focus())
  }

  const copyResult = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(formatAnalysisResult(result))
      setResultActionMessage('คัดลอกผลตรวจแล้ว')
    } catch {
      setResultActionMessage('เบราว์เซอร์ไม่อนุญาตให้คัดลอกอัตโนมัติ กรุณาใช้ปุ่มดาวน์โหลดแทน')
    }
  }

  const downloadResult = () => {
    if (!result) return
    const blob = new Blob([formatAnalysisResult(result)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${getDocumentTypeDefinition(result.documentType).resultTitle}-${new Date().toISOString().slice(0, 10)}.txt`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setResultActionMessage('ดาวน์โหลดผลตรวจแล้ว')
  }

  const cancelAppendixConfirmation = () => {
    setAppendixConfirmationOpen(false)
    setState('input')
    setAnalysisMessage('ยังไม่ได้ส่งเอกสาร คุณสามารถแก้ข้อความหรือกดตรวจอีกครั้งได้')
    setAnalysisCanRetry(false)
    window.requestAnimationFrame(() => editorRef.current?.focus())
  }

  const confirmAppendixExclusion = () => {
    setAppendixConfirmed(true)
    setAppendixConfirmationOpen(false)
    void startAnalysis(true)
  }

  useEffect(() => {
    if (!appendixConfirmationOpen) return

    const frame = window.requestAnimationFrame(() => appendixConfirmButtonRef.current?.focus())
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelAppendixConfirmation()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = appendixDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleDialogKeys)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleDialogKeys)
    }
  }, [appendixConfirmationOpen])

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">RubricLens AI</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7"><span className="font-medium text-slate-800">ตรวจเอกสารให้ครบ ชัด และตรงเกณฑ์</span> — รองรับรายงานทั่วไป โครงงาน และรายงานวิจัย</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="w-fit" aria-live="polite">สถานะ: {stateLabels[state]}</Badge>
            {text.trim() && <Button type="button" size="sm" variant="ghost" onClick={clearDraft} disabled={controlsLocked}><RotateCcw />เริ่มใหม่</Button>}
          </div>
        </header>

        {appendixConfirmationOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" role="presentation">
          <div ref={appendixDialogRef} role="dialog" aria-modal="true" aria-labelledby="appendix-dialog-title" aria-describedby="appendix-dialog-description" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl ring-1 ring-slate-950/10 sm:p-6">
            <h2 id="appendix-dialog-title" className="text-lg font-semibold text-slate-950">ยืนยันการไม่ส่งภาคผนวก</h2>
            <div id="appendix-dialog-description" className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              <p>พบส่วน “{preparedDocument.appendixHeading}” จำนวน {preparedDocument.excludedCharCount.toLocaleString()} ตัวอักษร</p>
              <p>ระบบจะไม่นำส่วนนี้ไปวิเคราะห์ แต่ข้อความต้นฉบับยังอยู่ครบ หากยังไม่พร้อม คุณสามารถกลับไปแก้ข้อความได้โดยยังไม่ส่งข้อมูลไปยัง AI</p>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={cancelAppendixConfirmation}>กลับไปแก้ข้อความ</Button>
              <Button ref={appendixConfirmButtonRef} type="button" onClick={confirmAppendixExclusion}>ยืนยันและส่งตรวจ</Button>
            </div>
          </div>
        </div>}

        <Alert className="mb-5 border-amber-200 bg-amber-50 text-amber-950">
          <AlertCircle className="size-4" />
          <AlertTitle>ใช้เป็นผู้ช่วยทบทวนเท่านั้น</AlertTitle>
          <AlertDescription>AI อาจคลาดเคลื่อน ผลไม่ใช่คำตัดสินแทนอาจารย์ และระบบนี้ไม่ตรวจหรือรับรองการลอกเลียนผลงาน</AlertDescription>
        </Alert>

        <div>
          <Card>
            <CardHeader><CardTitle>เพิ่มเอกสาร</CardTitle><CardDescription>รองรับเนื้อหาเอกสารหลักไม่เกิน {MAX_ANALYSIS_CHARS.toLocaleString()} ตัวอักษร และไฟล์ PDF {PDF_LIMITS_LABEL}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="report-text">ข้อความเอกสาร</label>
                <Textarea
                  id="report-text" aria-label="ข้อความเอกสาร" className="h-64 resize-none overflow-y-scroll leading-6 sm:h-80"
                  placeholder="วางเนื้อหาเอกสารที่นี่…" {...reportTextField}
                  ref={(element) => { reportTextField.ref(element); editorRef.current = element }}
                  onChange={(event) => { reportTextField.onChange(event); markContentChanged(event.target.value) }}
                  disabled={state === 'analyzing' || isExtracting}
                />
                <div className="flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:justify-between sm:gap-4">
                  <span>{errors.reportText?.message ?? `ร่างถูกเก็บเฉพาะในแท็บนี้ และจะส่งเมื่อคุณกด “${documentTypeDefinition.actionLabel}”`}</span>
                  <span className={exceedsRawLimit || exceedsAnalysisLimit ? 'font-medium text-red-700' : ''}>{text.length.toLocaleString()} ตัวอักษรทั้งหมด · {preparedDocument.mainText.length.toLocaleString()} ตัวอักษรที่จะวิเคราะห์</span>
                </div>
              </div>

              {(exceedsRawLimit || exceedsAnalysisLimit) && <Alert className="border-red-200 bg-red-50 text-red-950"><AlertCircle className="size-4" /><AlertTitle>เอกสารยังยาวเกินขนาดที่รองรับ</AlertTitle><AlertDescription>ระบบยังไม่ได้ตัดข้อความหรือส่งข้อมูลส่วนใด เนื้อหาเอกสารหลักต้องไม่เกิน {MAX_ANALYSIS_CHARS.toLocaleString()} ตัวอักษร และข้อความทั้งหมดรวมภาคผนวกต้องไม่เกิน {MAX_RAW_CHARS.toLocaleString()} ตัวอักษร</AlertDescription></Alert>}
              {isTooShort && <Alert className="border-sky-200 bg-sky-50 text-sky-950"><AlertCircle className="size-4" /><AlertTitle>เอกสารค่อนข้างสั้น</AlertTitle><AlertDescription>ยังส่งตรวจได้ แต่ผล AI อาจไม่ครบถ้วน ควรใส่เนื้อหาหลักมากกว่า 100 ตัวอักษร</AlertDescription></Alert>}

              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md text-sm font-medium focus-within:ring-2 focus-within:ring-indigo-500" htmlFor="pdf-upload"><Upload className="size-5 text-indigo-600" /> อัปโหลด PDF <span className="font-normal text-slate-500">({PDF_LIMITS_LABEL})</span></label>
                <input id="pdf-upload" className="sr-only" type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={state === 'analyzing' || isExtracting} />
                {isExtracting && <div className="mt-3 space-y-2"><p className="flex items-center gap-2 text-sm text-indigo-700"><LoaderCircle className="size-4 animate-spin" />กำลังอ่านข้อความจาก PDF {pdfProgress ? `${pdfProgress.completed}/${pdfProgress.total} หน้า` : ''}</p>{pdfProgress && <Progress value={(pdfProgress.completed / pdfProgress.total) * 100} />}<Button type="button" size="sm" variant="outline" onClick={() => pdfAbortRef.current?.abort()}>ยกเลิกการอ่าน PDF</Button></div>}
                {fileName && <p className="mt-2 break-all text-sm text-slate-700"><FileText className="mr-1 inline size-4" />{fileName}</p>}
                {fileNotice && <p className="mt-2 text-sm leading-6 text-slate-600" aria-live="polite">{fileNotice}</p>}
              </div>
              {warnings.map((warning) => <Alert key={warning} className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle className="size-4" /><AlertTitle>โปรดตรวจข้อความจาก PDF</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert>)}
              <div className="space-y-2">
                <Button className="min-h-12 w-full text-base sm:w-auto sm:min-w-44" onClick={() => void startAnalysis()} disabled={!canAnalyze}><CheckCircle2 />{documentTypeDefinition.actionLabel}</Button>
                {!text.trim() && <p className="text-sm text-slate-500">วางข้อความหรือเลือก PDF ก่อน ปุ่มนี้จึงจะกดได้</p>}
                {text.trim() && !rubricValidation.success && <p className="text-sm text-red-700">โปรดแก้เกณฑ์การตรวจให้ถูกต้องก่อนส่ง</p>}
                <p className="max-w-2xl text-xs leading-5 text-slate-500">เมื่อกดตรวจ เนื้อหาเอกสารหลัก ประเภทเอกสาร และเกณฑ์จะถูกส่งไปยัง Google Gemini ผ่าน Cloudflare Worker ผล AI อาจคลาดเคลื่อน ระบบไม่เก็บไฟล์หรือข้อความต้นฉบับถาวร และอาจพักผลสำเร็จไว้ไม่เกิน 10 นาทีเพื่อป้องกันการส่งซ้ำ <a className="text-indigo-700 underline underline-offset-2" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">นโยบายของ Google</a></p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-5">
          <CardHeader><CardTitle>ประเภทงานและเกณฑ์การตรวจ</CardTitle><CardDescription>เลือกประเภทให้ตรงกับงาน ระบบจะเปลี่ยนหัวข้อ น้ำหนัก และจุดเน้นของ AI ให้เหมาะสม</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="document-type">ประเภทงาน<select id="document-type" className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base disabled:cursor-not-allowed disabled:opacity-50" value={documentType} onChange={(event) => selectDocumentType(event.target.value as DocumentType)} disabled={controlsLocked}>{documentTypeDefinitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.label}</option>)}</select></label>
              <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="rubric-template">ชุดเกณฑ์การตรวจ<select id="rubric-template" className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-base disabled:cursor-not-allowed disabled:opacity-50" value={templateId} onChange={(event) => selectTemplate(event.target.value)} disabled={controlsLocked}>{availableRubricTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950" aria-live="polite">
              <p className="font-medium">{documentTypeDefinition.label}: {documentTypeDefinition.description}</p>
              <p className="mt-1"><span className="font-medium">จุดเน้น:</span> {documentTypeDefinition.reviewFocus}</p>
              <p className="mt-1 text-amber-900"><span className="font-medium">ข้อจำกัด:</span> {documentTypeDefinition.limitation}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-wrap gap-2"><Badge variant="outline">ใช้ {rubric.filter((section) => section.enabled).length}/{rubric.length} หัวข้อ</Badge><Badge variant="outline">น้ำหนักรวม {Number.isFinite(enabledWeight) ? enabledWeight : 'ไม่ถูกต้อง'}</Badge></div>
            </div>
            <Button type="button" variant="outline" aria-expanded={showAdvancedRubric} onClick={() => setShowAdvancedRubric((value) => !value)}><ChevronDown className={showAdvancedRubric ? 'rotate-180 transition-transform' : 'transition-transform'} />{showAdvancedRubric ? 'ซ่อนการตั้งค่าขั้นสูง' : 'แก้ไขหัวข้อและน้ำหนัก'}</Button>
            {showAdvancedRubric && <div className="space-y-3" aria-label="การตั้งค่าเกณฑ์ขั้นสูง">
              {rubric.map((section) => <div key={section.id} className={`rounded-lg border p-4 ${section.enabled ? 'bg-white' : 'bg-slate-100 opacity-75'}`}>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_7rem_auto] lg:items-start">
                  <label className="space-y-1 text-sm font-medium text-slate-600"><span>ชื่อหัวข้อ</span><Input aria-label={`ชื่อหัวข้อ ${section.title}`} value={section.title} onChange={(event) => updateSection(section.id, { title: event.target.value })} disabled={controlsLocked} /></label>
                  <label className="space-y-1 text-sm font-medium text-slate-600"><span>สิ่งที่ต้องการตรวจ</span><Textarea aria-label={`เกณฑ์ ${section.title}`} className="min-h-24" value={section.criteria} onChange={(event) => updateSection(section.id, { criteria: event.target.value })} disabled={controlsLocked} /></label>
                  <label className="space-y-1 text-sm font-medium text-slate-600"><span>น้ำหนัก</span><Input aria-label={`น้ำหนัก ${section.title}`} type="number" min="0" max="100" step="0.5" value={Number.isNaN(section.weight) ? '' : section.weight} onChange={(event) => updateSection(section.id, { weight: event.target.valueAsNumber })} disabled={controlsLocked} /></label>
                  <div className="flex flex-wrap gap-2 lg:pt-7"><Button type="button" size="sm" variant={section.enabled ? 'outline' : 'secondary'} onClick={() => updateSection(section.id, { enabled: !section.enabled })} disabled={controlsLocked}>{section.enabled ? 'ไม่นำมาคิดคะแนน' : 'นำมาคิดคะแนน'}</Button><Button type="button" size="sm" variant="destructive" aria-label={`ลบ ${section.title}`} onClick={() => removeSection(section)} disabled={controlsLocked}>ลบหัวข้อ</Button></div>
                </div>
              </div>)}
              <Button type="button" variant="outline" onClick={addSection} disabled={controlsLocked || rubric.length >= 30}>เพิ่มหัวข้อใหม่</Button>
            </div>}
            {!rubricValidation.success && <Alert className="border-red-200 bg-red-50 text-red-950"><AlertCircle className="size-4" /><AlertTitle>เกณฑ์ยังไม่พร้อม</AlertTitle><AlertDescription>{rubricValidation.error.issues.map((issue) => issue.message).join(' · ')}</AlertDescription></Alert>}
          </CardContent>
        </Card>

        {state === 'analyzing' && <section ref={analyzingRef} tabIndex={-1} className="mt-5 scroll-mt-4 outline-none" aria-label="กำลังตรวจเอกสาร" aria-live="polite"><Card><CardHeader><CardTitle className="flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />กำลังตรวจเอกสาร</CardTitle><CardDescription>รายการด้านล่างเป็นความคืบหน้าโดยประมาณ เอกสารยาวอาจใช้เวลาถึง 2 นาที</CardDescription></CardHeader><CardContent className="space-y-4"><Progress value={((progressIndex + 1) / analysisSteps.length) * 100} /><ol className="space-y-2 text-sm">{analysisSteps.map((step, index) => <li key={step} className={index < progressIndex ? 'text-emerald-700' : index === progressIndex ? 'font-medium text-indigo-700' : 'text-slate-400'}>{index < progressIndex ? '✓' : index === progressIndex ? '•' : '○'} {step}</li>)}</ol><Button variant="outline" onClick={cancelAnalysis}>ยกเลิกการตรวจ</Button></CardContent></Card></section>}

        {analysisMessage && <Alert className={`mt-5 ${state === 'error' ? 'border-red-200 bg-red-50 text-red-950' : 'border-sky-200 bg-sky-50 text-sky-950'}`} aria-live="assertive"><AlertCircle className="size-4" /><AlertTitle>{state === 'error' ? 'ยังตรวจเอกสารไม่ได้' : 'สถานะการตรวจ'}</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">{analysisMessage}{analysisCanRetry && <Button size="sm" variant="outline" onClick={() => void startAnalysis()}>ลองอีกครั้งด้วยคำขอเดิม</Button>}</AlertDescription></Alert>}

        {state === 'result' && result && <section ref={resultRef} tabIndex={-1} className="mt-5 scroll-mt-4 space-y-5 outline-none" aria-label="ผลวิเคราะห์">
          <Card className="border-emerald-200"><CardHeader><CardTitle>{getDocumentTypeDefinition(result.documentType).resultTitle}</CardTitle><CardDescription>ผลเบื้องต้น · ประเภทงาน {getDocumentTypeDefinition(result.documentType).label} · โมเดล {result.model} · เกณฑ์รุ่น {result.rubricVersion}</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-slate-600">{result.overallScore === null ? 'ทุกหัวข้อในเกณฑ์ถูกประเมินว่าไม่เกี่ยวข้องกับงานชิ้นนี้ ระบบจึงไม่คำนวณคะแนนรวม' : 'คะแนนรวมคำนวณด้วยโค้ดจากหัวข้อที่เกี่ยวข้องเท่านั้น หัวข้อที่ไม่เกี่ยวข้องไม่ถูกนับในตัวหาร'}</p><p className={`mt-1 font-semibold ${result.overallScore === null ? 'text-2xl text-slate-700' : 'text-5xl text-emerald-700'}`}>{formatOverallScore(result)}</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">ใช้ประเมิน {result.scoreSummary.applicableSectionCount}/{result.sections.length} หัวข้อ</Badge>{result.scoreSummary.notApplicableSectionCount > 0 && <Badge variant="secondary">{NOT_APPLICABLE_BADGE} {result.scoreSummary.notApplicableSectionCount} หัวข้อ</Badge>}<Button variant="outline" onClick={copyResult}><Copy />คัดลอกผล</Button><Button variant="outline" onClick={downloadResult}><Download />ดาวน์โหลด .txt</Button><Button variant="outline" onClick={prepareNewAnalysis}>แก้ไขแล้วตรวจใหม่</Button></div></div>{resultActionMessage && <p className="text-sm text-indigo-700" aria-live="polite">{resultActionMessage}</p>}</CardContent></Card>
          <Alert className="border-amber-200 bg-amber-50 text-amber-950"><AlertCircle className="size-4" /><AlertTitle>AI อาจคลาดเคลื่อน</AlertTitle><AlertDescription>ใช้ผลนี้ช่วยทบทวนงาน ไม่ใช่คำตัดสินแทนอาจารย์ และไม่ใช่ผลตรวจลอกเลียนผลงาน</AlertDescription></Alert>
          <Card><CardHeader><CardTitle>สิ่งที่ควรแก้ก่อนส่ง</CardTitle><CardDescription>เรียงจากหัวข้อคะแนนต่ำและน้ำหนักสูงก่อน ตรวจยืนยันกับเอกสารต้นฉบับทุกครั้ง</CardDescription></CardHeader><CardContent>{priorityItems.length ? <ol className="space-y-3 text-sm">{priorityItems.map((item, index) => <li key={`${item.section}-${item.missing}`} className="rounded-lg border bg-slate-50 p-3"><p className="font-medium text-slate-900">{index + 1}. {item.section}</p><p className="mt-1 leading-6 text-slate-700">อาจยังขาด: {item.missing}</p><p className="mt-1 leading-6 text-indigo-800">ควรทำ: {item.recommendation}</p></li>)}</ol> : <p className="text-sm leading-6 text-slate-600">AI ไม่พบประเด็นที่ขาดอย่างชัดเจนจากข้อความที่ส่ง แต่ยังควรตรวจเทียบกับเกณฑ์รายวิชาและไฟล์ต้นฉบับ</p>}</CardContent></Card>
          <div className="grid gap-4 lg:grid-cols-2">{result.sections.map((section) => <Card key={section.id} className={isNotApplicable(section) ? 'border-slate-200 bg-slate-50' : undefined}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div><CardTitle>{section.title}</CardTitle><CardDescription>{isNotApplicable(section) ? `น้ำหนัก ${section.weight} · ไม่ถูกนำมาคิดคะแนน` : `น้ำหนัก ${section.weight} · ความมั่นใจของ AI ${Math.round(section.confidence * 100)}%`}</CardDescription></div>
                {isNotApplicable(section) ? <Badge variant="secondary">{NOT_APPLICABLE_BADGE}</Badge> : <Badge>{section.score}/3</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><p className="font-medium">เหตุผล</p><p className="mt-1 leading-6 text-slate-600">{section.reason}</p></div>
              {!isNotApplicable(section) && <>
                <div><p className="font-medium">หลักฐานที่พบ</p>{section.evidence.length ? <ul className="mt-1 list-disc space-y-1 pl-5 leading-6 text-slate-600">{section.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1 text-slate-500">ยังไม่พบหลักฐานชัดเจนในข้อความที่ส่ง</p>}</div>
                <div><p className="font-medium">ข้อมูลหรือหลักฐานที่อาจยังขาด</p>{section.missing.length ? <ul className="mt-1 list-disc space-y-1 pl-5 leading-6 text-slate-600">{section.missing.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1 text-slate-500">AI ไม่พบประเด็นที่ขาดจากข้อความที่ส่ง</p>}</div>
                <div><p className="font-medium">คำแนะนำ</p><p className="mt-1 leading-6 text-slate-600">{section.recommendation}</p></div>
              </>}
            </CardContent>
          </Card>)}</div>
          <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>ความสอดคล้องของเอกสาร</CardTitle><CardDescription>{getDocumentTypeDefinition(result.documentType).consistencyDimensions.join(' · ')}</CardDescription></CardHeader><CardContent>{result.consistencyNotes.length ? <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{result.consistencyNotes.map((note) => <li key={note}>{note}</li>)}</ul> : <p className="text-sm text-slate-500">AI ไม่ได้ระบุข้อสังเกตเพิ่มเติม</p>}</CardContent></Card><Card><CardHeader><CardTitle>เอกสารอ้างอิง</CardTitle><CardDescription>ผลตรวจรูปแบบเบื้องต้น โปรดยืนยันกับเกณฑ์รายวิชา</CardDescription></CardHeader><CardContent className="space-y-3 text-sm leading-6 text-slate-700"><p>{result.referenceComment}</p>{referenceSummary.warnings.length > 0 && <ul className="list-disc space-y-1 pl-5">{referenceSummary.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}</CardContent></Card></div>
          {result.qualityWarnings.length > 0 && <Card><CardHeader><CardTitle>คำเตือนคุณภาพข้อความ</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">{result.qualityWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></CardContent></Card>}
        </section>}

        <Card className="mt-5">
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
