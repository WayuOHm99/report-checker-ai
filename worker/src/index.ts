import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'

import { ANALYSIS_RESPONSE_JSON_SCHEMA, buildAnalysisContents, prepareWorkerDocument, splitDocumentForAnalysis, SYSTEM_INSTRUCTION } from './prompt'

const MAX_CHARS_DEFAULT = 200_000
const MAX_RAW_CHARS = 300_000
const MAX_REQUEST_BYTES = 1_100_000
const RATE_LIMIT_PER_HOUR = 10
const IDEMPOTENCY_TTL_SECONDS = 10 * 60
const SINGLE_CALL_TOKEN_LIMIT = 110_000
const DEFAULT_DAILY_TOKEN_BUDGET = 2_000_000
const DEFAULT_PRIMARY_MODEL = 'gemini-3.6-flash'
const DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash-lite'
const GEMINI_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]

type RateLimitStore = Pick<KVNamespace, 'get' | 'put'>

export type AnalysisEnv = Partial<Pick<Env,
  'GEMINI_API_KEY' | 'GEMINI_MODEL' | 'GEMINI_FALLBACK_MODEL' | 'MAX_CHARS' | 'MOCK_ANALYSIS' | 'DAILY_BUDGET_LIMIT' |
  'DAILY_TOKEN_BUDGET' | 'ALLOWED_ORIGIN'>> & { RATE_LIMIT?: RateLimitStore }

const rubricSectionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(120),
  criteria: z.string().trim().min(1).max(2_000),
  weight: z.number().finite().nonnegative().max(100),
  enabled: z.boolean(),
}).strict()

const rubricSchema = z.object({
  version: z.string().trim().min(1).max(100),
  sections: z.array(rubricSectionSchema).min(1).max(30),
}).strict().superRefine(({ sections }, context) => {
  const ids = new Set<string>()
  sections.forEach((section, index) => {
    if (ids.has(section.id)) context.addIssue({ code: 'custom', path: ['sections', index, 'id'], message: `rubric id ซ้ำ: ${section.id}` })
    ids.add(section.id)
  })
})

const requestSchema = z.object({
  reportText: z.string().trim().min(1).max(MAX_RAW_CHARS),
  anonymousToken: z.string().min(16).max(200),
  rubric: rubricSchema,
  referenceSummary: z.object({
    bibliographyDetected: z.boolean(), bibliographyEntryCount: z.number().int().nonnegative(), numericCitationCount: z.number().int().nonnegative(),
    authorYearCitationCount: z.number().int().nonnegative(), unmatchedNumericCitationCount: z.number().int().nonnegative(), potentiallyUncitedEntryCount: z.number().int().nonnegative(),
  }).strict(),
  documentOptions: z.object({ excludeAppendix: z.boolean() }).strict().optional().default({ excludeAppendix: false }),
}).strict()

const analysisSectionSchema = z.object({
  id: z.string().trim().min(1).max(100), score: z.number().int().min(0).max(3),
  reason: z.string().trim().min(1).max(2_000), evidence: z.array(z.string().trim().min(1).max(1_000)).max(3),
  missing: z.array(z.string().trim().min(1).max(1_000)).max(3), recommendation: z.string().trim().min(1).max(2_000),
  confidence: z.number().min(0).max(1),
}).strict()
const modelResponseSchema = z.object({
  sections: z.array(analysisSectionSchema).min(1).max(30),
  qualityWarnings: z.array(z.string().trim().min(1).max(1_000)).max(5),
  consistencyNotes: z.array(z.string().trim().min(1).max(1_000)).max(5),
  referenceComment: z.string().trim().min(1).max(2_000),
}).strict()

type ModelResponse = z.infer<typeof modelResponseSchema>
type ActiveSection = ReturnType<typeof sanitizeRubric>[number]

class ApiFailure extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean

  constructor(code: string, message: string, status: number, retryable = false) {
    super(message)
    this.name = 'ApiFailure'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

const securityHeaders = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'content-type': 'application/json; charset=UTF-8',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: securityHeaders })
}

function errorResponse(error: ApiFailure) {
  return json({ error: error.message, code: error.code, retryable: error.retryable }, error.status)
}

function isAllowedOrigin(origin: string, env: AnalysisEnv) {
  if (!env.ALLOWED_ORIGIN) return false
  const configured = env.ALLOWED_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
  if (configured.includes(origin)) return true
  try {
    const candidate = new URL(origin)
    return configured.some((allowed) => {
      const base = new URL(allowed)
      return candidate.protocol === 'https:' && base.protocol === 'https:' && base.hostname.endsWith('.pages.dev') && candidate.hostname.endsWith(`.${base.hostname}`)
    })
  } catch {
    return false
  }
}

function withCors(response: Response, request: Request, env: AnalysisEnv) {
  const origin = request.headers.get('origin')
  if (!origin || !isAllowedOrigin(origin, env)) return response
  const headers = new Headers(response.headers)
  headers.set('access-control-allow-origin', origin)
  headers.set('access-control-allow-methods', 'POST, OPTIONS')
  headers.set('access-control-allow-headers', 'content-type, idempotency-key')
  headers.set('access-control-max-age', '86400')
  headers.set('vary', 'Origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

async function readJsonWithinLimit(request: Request) {
  const declaredSize = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_REQUEST_BYTES) throw new ApiFailure('REQUEST_TOO_LARGE', 'คำขอมีขนาดเกินที่ระบบรองรับ และยังไม่มีข้อมูลส่วนใดถูกส่งให้ AI', 413)
  if (!request.body) throw new ApiFailure('MISSING_BODY', 'ไม่พบข้อมูลรายงานในคำขอ', 400)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_REQUEST_BYTES) throw new ApiFailure('REQUEST_TOO_LARGE', 'คำขอมีขนาดเกินที่ระบบรองรับ และยังไม่มีข้อมูลส่วนใดถูกส่งให้ AI', 413)
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown } catch { throw new ApiFailure('INVALID_JSON', 'รูปแบบคำขอไม่ถูกต้อง โปรดรีเฟรชหน้าแล้วลองใหม่', 400) }
}

function maxChars(env: AnalysisEnv) {
  const configured = Number(env.MAX_CHARS)
  return Number.isSafeInteger(configured) && configured > 0 ? configured : MAX_CHARS_DEFAULT
}

function getClientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

async function hashKey(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function incrementCounter(store: RateLimitStore | undefined, key: string, limit: number, amount = 1, expirationTtl = 60 * 60) {
  if (!store) return false
  const existing = Number(await store.get(key) ?? '0')
  if (!Number.isFinite(existing) || existing + amount > limit) return true
  await store.put(key, String(existing + amount), { expirationTtl })
  return false
}

function sanitizeRubric(sections: z.infer<typeof rubricSectionSchema>[]) {
  return sections.filter((section) => section.enabled && section.weight > 0).map((section) => ({
    id: section.id.trim(), title: section.title.trim(), criteria: section.criteria.trim(), weight: section.weight,
  }))
}

function calculateOverallScore(sections: Array<{ score: number; weight: number }>) {
  const denominator = sections.reduce((sum, section) => sum + (3 * section.weight), 0)
  if (denominator === 0) return 0
  const numerator = sections.reduce((sum, section) => sum + (section.score * section.weight), 0)
  return Math.round((numerator / denominator) * 100)
}

function mockModelResponse(sections: ActiveSection[]): ModelResponse {
  return {
    sections: sections.map((section) => ({ id: section.id, score: 2, reason: `พบเนื้อหาที่เกี่ยวข้องกับ ${section.title} ในระดับเบื้องต้น`, evidence: [], missing: ['โปรดยืนยันรายละเอียดกับอาจารย์ผู้สอน'], recommendation: `เพิ่มรายละเอียดตามเกณฑ์: ${section.criteria}`, confidence: 0.5 })),
    qualityWarnings: ['นี่คือ mock response — ยังไม่ได้เรียก Gemini'], consistencyNotes: [], referenceComment: 'ใช้ผลตรวจอ้างอิงเบื้องต้นประกอบการพิจารณา',
  }
}

function safelyParseJson(value: string) {
  try { return JSON.parse(value) as unknown } catch { return undefined }
}

function validateExactSections(value: unknown, activeSections: ActiveSection[]) {
  const parsed = modelResponseSchema.safeParse(value)
  if (!parsed.success) return undefined
  const expected = activeSections.map((section) => section.id)
  const received = parsed.data.sections.map((section) => section.id)
  if (new Set(received).size !== received.length || received.length !== expected.length || expected.some((id) => !received.includes(id))) return undefined
  return parsed.data
}

function uniqueLimited(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit)
}

function mergeChunkResponses(responses: ModelResponse[], activeSections: ActiveSection[]) {
  if (responses.length === 1) return responses[0]
  const sections = activeSections.map((active) => {
    const candidates = responses.map((response) => response.sections.find((section) => section.id === active.id)).filter((section): section is ModelResponse['sections'][number] => Boolean(section))
    const strongest = [...candidates].sort((left, right) => right.score - left.score || right.confidence - left.confidence)[0]
    const strongestScore = strongest.score
    const strongestCandidates = candidates.filter((candidate) => candidate.score === strongestScore)
    return {
      ...strongest,
      evidence: uniqueLimited(candidates.flatMap((candidate) => candidate.evidence), 3),
      missing: uniqueLimited(strongestCandidates.flatMap((candidate) => candidate.missing), 3),
      confidence: Math.max(...candidates.map((candidate) => candidate.confidence)),
    }
  })
  return {
    sections,
    qualityWarnings: uniqueLimited(['เอกสารเกินขนาด token สำหรับการวิเคราะห์ครั้งเดียว ระบบจึงแบ่งเป็นส่วนโดยไม่ตัดข้อความ', ...responses.flatMap((response) => response.qualityWarnings)], 5),
    consistencyNotes: uniqueLimited(responses.flatMap((response) => response.consistencyNotes), 5),
    referenceComment: responses.map((response) => response.referenceComment).find(Boolean) ?? 'โปรดยืนยันเอกสารอ้างอิงกับเกณฑ์รายวิชา',
  }
}

function mapGeminiError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : undefined
  const isQuota = status === 429 || message.includes('429') || message.includes('quota') || message.includes('resource_exhausted')
  if (isQuota) {
    const isDaily = message.includes('perday') || message.includes('per day') || message.includes('daily') || message.includes('rpd') || message.includes('requestsperday')
    return isDaily
      ? new ApiFailure('GEMINI_DAILY_QUOTA', 'โควตารายวันของ Gemini ครบแล้ว ระบบจะลองโมเดลสำรองให้อัตโนมัติ', 429)
      : new ApiFailure('GEMINI_RATE_LIMIT', 'Gemini กำลังมีคำขอหนาแน่น ระบบจะลองใหม่และสลับโมเดลให้อัตโนมัติ', 429, true)
  }
  if (status === 401 || status === 403 || message.includes('401') || message.includes('403') || message.includes('api key')) return new ApiFailure('AI_CONFIGURATION', 'ระบบ AI ยังตั้งค่าไม่สมบูรณ์ กรุณาแจ้งผู้ดูแลระบบ', 503)
  if (message.includes('model') && (message.includes('not found') || message.includes('invalid'))) return new ApiFailure('MODEL_UNAVAILABLE', 'โมเดล AI ที่ตั้งค่าไว้ยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลระบบ', 503)
  if (status === 408 || (status !== undefined && status >= 500)) return new ApiFailure('GEMINI_UNAVAILABLE', 'Gemini ยังไม่พร้อมตอบกลับในขณะนี้ ระบบจะลองโมเดลสำรองให้อัตโนมัติ', 502, true)
  return new ApiFailure('GEMINI_UNAVAILABLE', 'ยังเชื่อมต่อ Gemini ไม่ได้ในขณะนี้ โปรดลองใหม่ภายหลัง', 502, true)
}

function canUseFallback(error: unknown): error is ApiFailure {
  return error instanceof ApiFailure && ['GEMINI_DAILY_QUOTA', 'GEMINI_RATE_LIMIT', 'GEMINI_UNAVAILABLE', 'MODEL_UNAVAILABLE'].includes(error.code)
}

function exhaustedGeminiFailure(error: unknown) {
  const failure = error instanceof ApiFailure ? error : mapGeminiError(error)
  if (failure.code === 'GEMINI_DAILY_QUOTA') return new ApiFailure('GEMINI_DAILY_QUOTA', 'โควตารายวันของ Gemini ทั้งโมเดลหลักและโมเดลสำรองครบแล้ว โปรดลองใหม่หลังโควตารีเซ็ตหรือให้ผู้ดูแลเปิด Billing', 429)
  if (failure.code === 'GEMINI_RATE_LIMIT') return new ApiFailure('GEMINI_RATE_LIMIT', 'Gemini มีคำขอหนาแน่นทั้งโมเดลหลักและโมเดลสำรอง โปรดลองใหม่ในอีก 1–2 นาที', 429, true)
  return failure
}

async function generateValidated(ai: GoogleGenAI, model: string, prompt: string, activeSections: ActiveSection[]) {
  const generate = async (contents: string) => {
    const response = await ai.models.generateContent({ model, contents, config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json', responseJsonSchema: ANALYSIS_RESPONSE_JSON_SCHEMA } })
    return response.text ?? ''
  }
  try {
    const first = validateExactSections(safelyParseJson(await generate(prompt)), activeSections)
    if (first) return first
    const retry = validateExactSections(safelyParseJson(await generate(`${prompt}\n\nReturn valid JSON with every rubric id exactly once.`)), activeSections)
    if (retry) return retry
    throw new ApiFailure('INVALID_AI_RESPONSE', 'คำตอบจาก AI ไม่ครบตามหัวข้อที่กำหนด โปรดลองใหม่อีกครั้ง', 502, true)
  } catch (error) {
    if (error instanceof ApiFailure) throw error
    throw mapGeminiError(error)
  }
}

async function prepareModelPlan(ai: GoogleGenAI, model: string, reportText: string, referenceSummary: unknown, activeSections: ActiveSection[]) {
  const fullPrompt = buildAnalysisContents({ reportText, referenceSummary }, activeSections)
  let fullTokenCount: number
  try {
    const count = await ai.models.countTokens({ model, contents: `${SYSTEM_INSTRUCTION}\n\n${fullPrompt}` })
    fullTokenCount = count.totalTokens ?? 0
  } catch (error) {
    throw mapGeminiError(error)
  }

  const chunks = fullTokenCount <= SINGLE_CALL_TOKEN_LIMIT ? [reportText] : splitDocumentForAnalysis(reportText)
  const prompts = chunks.map((chunk, index) => buildAnalysisContents({ reportText: chunk, referenceSummary }, activeSections, { index: index + 1, total: chunks.length }))
  let plannedInputTokens = fullTokenCount
  if (chunks.length > 1) {
    try {
      const counts = await Promise.all(prompts.map((prompt) => ai.models.countTokens({ model, contents: `${SYSTEM_INSTRUCTION}\n\n${prompt}` })))
      plannedInputTokens = counts.reduce((sum, count) => sum + (count.totalTokens ?? 0), 0)
    } catch (error) {
      throw mapGeminiError(error)
    }
  }
  if (prompts.length > 10 || plannedInputTokens > 1_000_000) throw new ApiFailure('DOCUMENT_TOKEN_LIMIT', 'เอกสารมี token มากเกินขนาดที่ระบบแบ่งวิเคราะห์ได้ โปรดลดเนื้อหาแล้วลองใหม่', 413)

  return { model, plannedInputTokens, prompts }
}

async function generateModelPlan(ai: GoogleGenAI, plan: Awaited<ReturnType<typeof prepareModelPlan>>, activeSections: ActiveSection[]) {
  const responses: ModelResponse[] = []
  for (const prompt of plan.prompts) responses.push(await generateValidated(ai, plan.model, prompt, activeSections))
  return mergeChunkResponses(responses, activeSections)
}

async function analyzeWithGemini(reportText: string, referenceSummary: unknown, activeSections: ActiveSection[], env: AnalysisEnv) {
  if (!env.GEMINI_API_KEY) throw new ApiFailure('AI_CONFIGURATION', 'ระบบยังไม่ได้ตั้งค่า Gemini API key กรุณาแจ้งผู้ดูแลระบบ', 503)
  const ai = new GoogleGenAI({
    apiKey: env.GEMINI_API_KEY,
    httpOptions: {
      retryOptions: { attempts: 3, initialDelay: 1, maxDelay: 4, expBase: 2, jitter: 0.5, httpStatusCodes: GEMINI_RETRYABLE_STATUS_CODES },
    },
  })
  const primaryModel = env.GEMINI_MODEL?.trim() || DEFAULT_PRIMARY_MODEL
  const configuredFallback = env.GEMINI_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL
  const fallbackModel = configuredFallback === primaryModel ? undefined : configuredFallback
  let fallbackReason: ApiFailure | undefined
  let plan: Awaited<ReturnType<typeof prepareModelPlan>>
  try {
    plan = await prepareModelPlan(ai, primaryModel, reportText, referenceSummary, activeSections)
  } catch (error) {
    if (!fallbackModel || !canUseFallback(error)) throw error
    fallbackReason = error
    try {
      plan = await prepareModelPlan(ai, fallbackModel, reportText, referenceSummary, activeSections)
    } catch (fallbackError) {
      throw canUseFallback(fallbackError) ? exhaustedGeminiFailure(fallbackError) : fallbackError
    }
  }

  const dailyRequestLimit = Number(env.DAILY_BUDGET_LIMIT ?? '100')
  const dailyTokenLimit = Number(env.DAILY_TOKEN_BUDGET ?? String(DEFAULT_DAILY_TOKEN_BUDGET))
  const date = new Date().toISOString().slice(0, 10)
  if (env.RATE_LIMIT) {
    if (await incrementCounter(env.RATE_LIMIT, `budget:requests:${date}`, Number.isFinite(dailyRequestLimit) ? dailyRequestLimit : 100, 1, 60 * 60 * 36)) throw new ApiFailure('DAILY_REQUEST_BUDGET', 'จำนวนการตรวจของระบบวันนี้ครบแล้ว โปรดลองใหม่วันถัดไป', 429)
    if (await incrementCounter(env.RATE_LIMIT, `budget:tokens:${date}`, Number.isFinite(dailyTokenLimit) ? dailyTokenLimit : DEFAULT_DAILY_TOKEN_BUDGET, plan.plannedInputTokens * 2, 60 * 60 * 36)) throw new ApiFailure('DAILY_TOKEN_BUDGET', 'งบประมาณ token ของระบบวันนี้ครบแล้ว โปรดลองใหม่วันถัดไป', 429)
  }

  let response: ModelResponse
  try {
    response = await generateModelPlan(ai, plan, activeSections)
  } catch (error) {
    if (!fallbackModel || plan.model === fallbackModel || !canUseFallback(error)) throw plan.model === fallbackModel && canUseFallback(error) ? exhaustedGeminiFailure(error) : error
    fallbackReason = error
    let fallbackPlan: Awaited<ReturnType<typeof prepareModelPlan>>
    try {
      fallbackPlan = await prepareModelPlan(ai, fallbackModel, reportText, referenceSummary, activeSections)
      response = await generateModelPlan(ai, fallbackPlan, activeSections)
      plan = fallbackPlan
    } catch (fallbackError) {
      throw canUseFallback(fallbackError) ? exhaustedGeminiFailure(fallbackError) : fallbackError
    }
  }

  if (fallbackReason) {
    console.warn(JSON.stringify({ event: 'gemini_model_fallback', primaryModel, fallbackModel: plan.model, reason: fallbackReason.code }))
    response = {
      ...response,
      qualityWarnings: uniqueLimited([`ระบบใช้โมเดลสำรอง ${plan.model} เนื่องจากโมเดลหลักไม่พร้อมหรือโควตาเต็ม โปรดยืนยันประเด็นสำคัญกับต้นฉบับ`, ...response.qualityWarnings], 5),
    }
  }
  return { response, model: plan.model }
}

export async function handleAnalyze(request: Request, env: AnalysisEnv) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiFailure('UNSUPPORTED_CONTENT_TYPE', 'คำขอต้องเป็น JSON', 415)
  const idempotencyKey = request.headers.get('Idempotency-Key')
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) throw new ApiFailure('INVALID_IDEMPOTENCY_KEY', 'คำขอตรวจไม่สมบูรณ์ โปรดรีเฟรชหน้าแล้วลองใหม่', 400)
  if (env.RATE_LIMIT) {
    const cached = await env.RATE_LIMIT.get(`idempotency:${idempotencyKey}`)
    if (cached) return new Response(cached, { headers: securityHeaders })
  }

  const parsed = requestSchema.safeParse(await readJsonWithinLimit(request))
  if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 'ข้อมูลรายงานหรือเกณฑ์ไม่ถูกต้อง โปรดตรวจข้อมูลแล้วลองใหม่', 400)
  const prepared = prepareWorkerDocument(parsed.data.reportText)
  if (prepared.appendixHeading && !parsed.data.documentOptions.excludeAppendix) throw new ApiFailure('APPENDIX_CONFIRMATION_REQUIRED', `พบส่วน “${prepared.appendixHeading}” กรุณายืนยันการไม่นำภาคผนวกไปวิเคราะห์`, 409)
  if (!prepared.mainText) throw new ApiFailure('EMPTY_MAIN_DOCUMENT', 'ไม่พบเนื้อหารายงานหลักก่อนภาคผนวก', 400)
  if (prepared.mainText.length > maxChars(env)) throw new ApiFailure('DOCUMENT_CHAR_LIMIT', 'เนื้อหารายงานหลักยาวเกิน 200,000 ตัวอักษร ระบบไม่ได้ตัดหรือส่งข้อความ', 413)

  const activeSections = sanitizeRubric(parsed.data.rubric.sections)
  if (activeSections.length === 0) throw new ApiFailure('EMPTY_RUBRIC', 'ต้องมีหัวข้อที่นำมาคิดคะแนนและมีน้ำหนักมากกว่า 0 อย่างน้อยหนึ่งหัวข้อ', 400)

  if (env.RATE_LIMIT) {
    const window = new Date().toISOString().slice(0, 13)
    const [ipHash, tokenHash] = await Promise.all([hashKey(getClientIp(request)), hashKey(parsed.data.anonymousToken)])
    const limitedIp = await incrementCounter(env.RATE_LIMIT, `rate:ip:${ipHash}:${window}`, RATE_LIMIT_PER_HOUR)
    const limitedToken = await incrementCounter(env.RATE_LIMIT, `rate:anon:${tokenHash}:${window}`, RATE_LIMIT_PER_HOUR)
    if (limitedIp || limitedToken) throw new ApiFailure('RATE_LIMITED', 'ส่งคำขอครบขีดจำกัดชั่วคราวแล้ว โปรดลองใหม่ในชั่วโมงถัดไป', 429, true)
  } else if (env.MOCK_ANALYSIS !== 'true') throw new ApiFailure('RATE_LIMIT_UNAVAILABLE', 'ระบบจำกัดคำขอยังไม่พร้อม กรุณาแจ้งผู้ดูแลระบบ', 503)

  const modelOutput = env.MOCK_ANALYSIS === 'true'
    ? { response: mockModelResponse(activeSections), model: 'mock-analysis-v1' }
    : await analyzeWithGemini(prepared.mainText, parsed.data.referenceSummary, activeSections, env)
  const byId = new Map(modelOutput.response.sections.map((section) => [section.id, section]))
  const sections = activeSections.map((section) => ({ ...section, ...byId.get(section.id)! }))
  const responseBody = {
    overallScore: calculateOverallScore(sections), sections,
    qualityWarnings: modelOutput.response.qualityWarnings,
    consistencyNotes: modelOutput.response.consistencyNotes,
    referenceComment: modelOutput.response.referenceComment,
    model: modelOutput.model,
    rubricVersion: parsed.data.rubric.version,
    documentInfo: { appendixExcluded: Boolean(prepared.appendixHeading), excludedCharCount: prepared.excludedCharCount },
  }
  const serialized = JSON.stringify(responseBody)
  if (env.RATE_LIMIT) await env.RATE_LIMIT.put(`idempotency:${idempotencyKey}`, serialized, { expirationTtl: IDEMPOTENCY_TTL_SECONDS })
  return new Response(serialized, { headers: securityHeaders })
}

export default {
  async fetch(request: Request, env: Env | AnalysisEnv): Promise<Response> {
    const url = new URL(request.url)
    let response: Response
    try {
      if (request.method === 'OPTIONS' && url.pathname === '/api/analyze') response = new Response(null, { status: 204, headers: { ...securityHeaders, allow: 'POST, OPTIONS' } })
      else if (request.method === 'GET' && url.pathname === '/api/health') {
        const ready = Boolean(env.GEMINI_API_KEY && env.RATE_LIMIT && env.MOCK_ANALYSIS !== 'true')
        response = json({ status: ready ? 'ok' : 'degraded', aiConfigured: Boolean(env.GEMINI_API_KEY), rateLimitConfigured: Boolean(env.RATE_LIMIT), model: env.GEMINI_MODEL ?? DEFAULT_PRIMARY_MODEL, fallbackModel: env.GEMINI_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL }, ready ? 200 : 503)
      } else if (request.method === 'POST' && url.pathname === '/api/analyze') response = await handleAnalyze(request, env)
      else if (url.pathname === '/api/analyze') response = new Response(JSON.stringify({ error: 'endpoint นี้รองรับเฉพาะ POST', code: 'METHOD_NOT_ALLOWED', retryable: false }), { status: 405, headers: { ...securityHeaders, allow: 'POST, OPTIONS' } })
      else response = errorResponse(new ApiFailure('NOT_FOUND', 'ไม่พบ endpoint ที่เรียกใช้', 404))
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : new ApiFailure('INTERNAL_ERROR', 'ระบบเกิดข้อผิดพลาดที่ไม่คาดคิด โปรดลองใหม่ภายหลัง', 500, true)
      console.error(JSON.stringify({ event: 'analysis_request_failed', code: failure.code, status: failure.status, path: url.pathname }))
      response = errorResponse(failure)
    }
    return withCors(response, request, env)
  },
} satisfies ExportedHandler<Env>
