import { GoogleGenAI } from '@google/genai'
import { z } from 'zod'

import {
  ANALYSIS_RESPONSE_JSON_SCHEMA, buildAnalysisContents, buildConsolidationContents, compactChunkFindings,
  CONSOLIDATION_SYSTEM_INSTRUCTION, prepareWorkerDocument, splitDocumentForAnalysis, SYSTEM_INSTRUCTION,
  THAI_SCRIPT_CORRECTION_INSTRUCTION,
} from './prompt'
import {
  API_VERSION, API_VERSION_HEADER, DEFAULT_APPLICABILITY, isSupportedRequestApiVersion, LEGACY_API_VERSION,
  LEGACY_API_VERSION_HEADER,
  SECTION_APPLICABILITY, SUPPORTED_REQUEST_API_VERSIONS, type RequestApiVersion,
} from '../../shared/api-contract'
import { DOCUMENT_TYPES, getDocumentTypeDefinition, LEGACY_DOCUMENT_TYPE, type DocumentType } from '../../shared/document-types'
import { calculateOverallScore } from '../../shared/scoring'

const MAX_CHARS_DEFAULT = 200_000
const MAX_RAW_CHARS = 300_000
const MAX_REQUEST_BYTES = 1_100_000
const RATE_LIMIT_PER_HOUR = 10
const IDEMPOTENCY_TTL_SECONDS = 10 * 60
const IDEMPOTENCY_RECORD_VERSION = 1
const SINGLE_CALL_TOKEN_LIMIT = 110_000
const MAX_ANALYSIS_CHUNKS = 6
const DEFAULT_DAILY_TOKEN_BUDGET = 2_000_000
const DEFAULT_PRIMARY_MODEL = 'gemini-3.6-flash'
const DEFAULT_FALLBACK_MODEL = 'gemini-3.5-flash-lite'
const GEMINI_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504]
const AI_CHECK_TIMEOUT_MS = 5_000
const AI_CHECK_CACHE_SECONDS = 5 * 60
const AI_CHECK_CACHE_KEY = 'health:ai-reachable'
const ALERT_TIMEOUT_MS = 5_000
const QUALITY_EVENT_TTL_SECONDS = 60 * 60 * 36
/** How often the model wrote a foreign character, and how often the corrective retry failed to remove it. */
const FOREIGN_SCRIPT_RETRIES = 'foreign-script-retries'
const FOREIGN_SCRIPT_PERSISTED = 'foreign-script-persisted'

type RateLimitStore = Pick<KVNamespace, 'get' | 'put'>

export type AnalysisEnv = Partial<Pick<Env,
  'GEMINI_API_KEY' | 'GEMINI_MODEL' | 'GEMINI_FALLBACK_MODEL' | 'MAX_CHARS' | 'MOCK_ANALYSIS' | 'DAILY_BUDGET_LIMIT' |
  'DAILY_TOKEN_BUDGET' | 'ALLOWED_ORIGIN'>> & { RATE_LIMIT?: RateLimitStore; ALERT_WEBHOOK_URL?: string }

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
  documentType: z.enum(DOCUMENT_TYPES).optional().default(LEGACY_DOCUMENT_TYPE),
  anonymousToken: z.string().min(16).max(200),
  rubric: rubricSchema,
  referenceSummary: z.object({
    bibliographyDetected: z.boolean(), bibliographyEntryCount: z.number().int().nonnegative(), numericCitationCount: z.number().int().nonnegative(),
    authorYearCitationCount: z.number().int().nonnegative(), unmatchedNumericCitationCount: z.number().int().nonnegative(), potentiallyUncitedEntryCount: z.number().int().nonnegative(),
  }).strict(),
  documentOptions: z.object({ excludeAppendix: z.boolean() }).strict().optional().default({ excludeAppendix: false }),
}).strict().superRefine(({ documentType, rubric }, context) => {
  const knownRubricTypes: Record<string, DocumentType> = {
    'general-report-th-v1': 'general-report',
    'project-th-v1': 'project',
    'research-th-v1': 'research-report',
  }
  const expectedType = knownRubricTypes[rubric.version]
  if (expectedType && expectedType !== documentType) {
    context.addIssue({ code: 'custom', path: ['rubric', 'version'], message: 'rubric version ไม่ตรงกับประเภทเอกสาร' })
  }
})

type AnalysisRequest = z.infer<typeof requestSchema>

const analysisSectionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  /**
   * Older prompts had no applicability field. Defaulting to "applicable" keeps
   * an omission on the safe side: the section still counts toward the score
   * instead of silently disappearing from the denominator.
   */
  applicability: z.enum(SECTION_APPLICABILITY).optional().default(DEFAULT_APPLICABILITY),
  score: z.number().int().min(0).max(3),
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
type ModelSection = ModelResponse['sections'][number]
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
  headers.set('access-control-allow-headers', `content-type, idempotency-key, ${API_VERSION_HEADER.toLowerCase()}, ${LEGACY_API_VERSION_HEADER.toLowerCase()}`)
  headers.set('access-control-max-age', '86400')
  headers.set('vary', 'Origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

async function readJsonWithinLimit(request: Request) {
  const declaredSize = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_REQUEST_BYTES) throw new ApiFailure('REQUEST_TOO_LARGE', 'คำขอมีขนาดเกินที่ระบบรองรับ และยังไม่มีข้อมูลส่วนใดถูกส่งให้ AI', 413)
  if (!request.body) throw new ApiFailure('MISSING_BODY', 'ไม่พบข้อมูลเอกสารในคำขอ', 400)
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

/** Key order independent representation, so two equal payloads always digest alike. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    return Object.fromEntries(Object.keys(source).sort().map((key) => [key, canonicalize(source[key])]))
  }
  return value
}

/**
 * SHA-256 over the canonical form of the validated request. Only the digest is
 * ever written to KV, so replay protection stores no additional document text.
 */
function canonicalRequestDigest(request: AnalysisRequest) {
  return hashKey(JSON.stringify(canonicalize(request)))
}

function requestedApiVersion(request: Request): RequestApiVersion {
  const header = request.headers.get(API_VERSION_HEADER) ?? request.headers.get(LEGACY_API_VERSION_HEADER)
  if (header === null) return LEGACY_API_VERSION
  const version = Number(header)
  if (!Number.isInteger(version) || !isSupportedRequestApiVersion(version)) {
    throw new ApiFailure('UNSUPPORTED_API_VERSION', 'หน้าเว็บและระบบตรวจเป็นคนละรุ่น โปรดรีเฟรชหน้าแล้วลองใหม่', 426, false)
  }
  return version
}

const idempotencyRecordSchema = z.object({
  version: z.literal(IDEMPOTENCY_RECORD_VERSION),
  digest: z.string().length(64),
  response: z.string().min(1),
}).strict()

const aiReachabilitySchema = z.object({
  reachable: z.boolean(), code: z.string().min(1).max(100), checkedAt: z.number().int().nonnegative(),
}).strict()

type AiReachability = z.infer<typeof aiReachabilitySchema>

/**
 * Counts one occurrence of a named quality event for today. Sampled logs cannot
 * answer "is this getting better or worse" for something that happens rarely,
 * so the tally lives in KV where every occurrence is counted exactly once.
 * Deliberately best effort: losing a data point must never fail a review.
 */
async function recordQualityEvent(store: RateLimitStore | undefined, name: string) {
  if (!store) return
  try {
    const key = qualityEventKey(name)
    const existing = Number(await store.get(key) ?? '0')
    await store.put(key, String(Number.isFinite(existing) ? existing + 1 : 1), { expirationTtl: QUALITY_EVENT_TTL_SECONDS })
  } catch (error) {
    console.warn(JSON.stringify({ event: 'quality_event_not_recorded', name, reason: error instanceof Error ? error.name : 'unknown' }))
  }
}

async function readQualityEvent(store: RateLimitStore | undefined, name: string) {
  if (!store) return 0
  const counted = Number(await store.get(qualityEventKey(name)) ?? '0')
  return Number.isFinite(counted) ? counted : 0
}

function qualityEventKey(name: string) {
  return `stats:${name}:${new Date().toISOString().slice(0, 10)}`
}

async function incrementCounter(store: RateLimitStore | undefined, key: string, limit: number, amount = 1, expirationTtl = 60 * 60) {
  if (!store) return false
  const existing = Number(await store.get(key) ?? '0')
  if (!Number.isFinite(existing) || existing + amount > limit) return true
  await store.put(key, String(existing + amount), { expirationTtl })
  return false
}

/**
 * Reserves a conservative token estimate before each application-level model
 * call. Prompt counts come from countTokens; output is bounded by a documented
 * estimate. Provider-internal retries are not observable here, so this remains
 * a cost-abuse guard rather than billing-grade accounting.
 */
type TokenLedger = {
  charge(tokens: number): Promise<void>
  readonly spent: number
}

function createTokenLedger(env: AnalysisEnv): TokenLedger {
  const configured = Number(env.DAILY_TOKEN_BUDGET ?? String(DEFAULT_DAILY_TOKEN_BUDGET))
  const limit = Number.isFinite(configured) ? configured : DEFAULT_DAILY_TOKEN_BUDGET
  const key = `budget:tokens:${new Date().toISOString().slice(0, 10)}`
  let spent = 0
  return {
    get spent() { return spent },
    async charge(tokens: number) {
      const amount = Math.max(0, Math.ceil(tokens))
      spent += amount
      if (await incrementCounter(env.RATE_LIMIT, key, limit, amount, 60 * 60 * 36)) {
        throw new ApiFailure('DAILY_TOKEN_BUDGET', 'งบประมาณ token ของระบบวันนี้ครบแล้ว โปรดลองใหม่วันถัดไป', 429)
      }
    },
  }
}

/** Structured JSON output stays small and scales with the rubric, not the document. */
function estimateOutputTokens(sectionCount: number) {
  // Gemini 3 reasoning tokens share the generation allowance with structured
  // output. Leave enough room for low-level thinking plus Thai JSON fields.
  return 1_000 + (sectionCount * 500)
}

function sanitizeRubric(sections: z.infer<typeof rubricSectionSchema>[]) {
  return sections.filter((section) => section.enabled && section.weight > 0).map((section) => ({
    id: section.id.trim(), title: section.title.trim(), criteria: section.criteria.trim(), weight: section.weight,
  }))
}

function mockModelResponse(sections: ActiveSection[]): ModelResponse {
  return {
    sections: sections.map((section) => ({ id: section.id, applicability: DEFAULT_APPLICABILITY, score: 2, reason: `พบเนื้อหาที่เกี่ยวข้องกับ ${section.title} ในระดับเบื้องต้น`, evidence: [], missing: ['โปรดยืนยันรายละเอียดกับอาจารย์ผู้สอน'], recommendation: `เพิ่มรายละเอียดตามเกณฑ์: ${section.criteria}`, confidence: 0.5 })),
    qualityWarnings: ['นี่คือ mock response — ยังไม่ได้เรียก Gemini'], consistencyNotes: [], referenceComment: 'ใช้ผลตรวจอ้างอิงเบื้องต้นประกอบการพิจารณา',
  }
}

function safelyParseJson(value: string) {
  try { return JSON.parse(value) as unknown } catch { return undefined }
}

/**
 * A section the model declared irrelevant must not carry evidence, gaps or a
 * score, because application code removes its weight from the denominator.
 * Enforcing that here means a fabricated excerpt cannot survive into the result.
 */
function normalizeSection(section: ModelSection): ModelSection {
  if (section.applicability === 'not_applicable') {
    return { ...section, score: 0, evidence: [], missing: [], confidence: Math.min(section.confidence, 1) }
  }
  // Several chunks routinely quote the same passage; collapse repeats so the
  // consolidated result never shows the same excerpt twice.
  return { ...section, evidence: uniqueLimited(section.evidence, 3), missing: uniqueLimited(section.missing, 3) }
}

function validateExactSections(value: unknown, activeSections: ActiveSection[]) {
  const parsed = modelResponseSchema.safeParse(value)
  if (!parsed.success) return undefined
  const expected = activeSections.map((section) => section.id)
  const received = parsed.data.sections.map((section) => section.id)
  if (new Set(received).size !== received.length || received.length !== expected.length || expected.some((id) => !received.includes(id))) return undefined
  return { ...parsed.data, sections: parsed.data.sections.map(normalizeSection) }
}

function uniqueLimited(values: string[], limit: number) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit)
}

/**
 * The scripts that occasionally leak into Thai model prose, as five character
 * ranges: Hiragana and Katakana (U+3040-30FF), CJK ideographs and their
 * extension A and compatibility blocks (U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF),
 * and Hangul syllables (U+AC00-D7AF). Thai, Latin letters and digits are not
 * matched, so a Thai review that names a technical term in English stays clean.
 */
const FOREIGN_SCRIPT_PATTERN = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/

/**
 * Detects the model writing its own prose in a script the reader cannot read.
 * Evidence is deliberately excluded: it quotes the submitted document word for
 * word, so a document that is genuinely written in another script must survive
 * unchanged instead of being treated as a defect.
 */
function containsForeignScript(response: ModelResponse) {
  const modelAuthoredText = [
    response.referenceComment,
    ...response.qualityWarnings,
    ...response.consistencyNotes,
    ...response.sections.flatMap((section) => [section.reason, section.recommendation, ...section.missing]),
  ]
  return modelAuthoredText.some((text) => FOREIGN_SCRIPT_PATTERN.test(text))
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

async function countPromptTokens(ai: GoogleGenAI, model: string, systemInstruction: string, prompt: string) {
  try {
    const count = await ai.models.countTokens({ model, contents: `${systemInstruction}\n\n${prompt}` })
    return count.totalTokens ?? 0
  } catch (error) {
    throw mapGeminiError(error)
  }
}

type ModelCall = {
  systemInstruction: string
  prompt: string
  promptTokens: number
}

async function generateValidated(ai: GoogleGenAI, model: string, call: ModelCall, activeSections: ActiveSection[], ledger: TokenLedger, store: RateLimitStore | undefined) {
  const generate = async (modelCall: ModelCall) => {
    const maxOutputTokens = estimateOutputTokens(activeSections.length)
    await ledger.charge(modelCall.promptTokens + maxOutputTokens)
    const response = await ai.models.generateContent({
      model,
      contents: modelCall.prompt,
      config: {
        systemInstruction: modelCall.systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema: ANALYSIS_RESPONSE_JSON_SCHEMA,
        maxOutputTokens,
        // Gemini 3 defaults to deeper thinking, which can consume the output
        // allowance and exceed the browser's two-minute request window. Rubric
        // evaluation is constrained instruction-following, so low is enough.
        thinkingConfig: { thinkingLevel: 'low' },
      },
    })
    return response.text ?? ''
  }
  try {
    const first = validateExactSections(safelyParseJson(await generate(call)), activeSections)
    if (first && !containsForeignScript(first)) return first
    // One retry covers both defects, but they are not equally serious: an
    // incomplete answer cannot be shown at all, while a foreign character is
    // only unpleasant to read.
    if (first) {
      console.warn(JSON.stringify({ event: 'foreign_script_retry', model }))
      await recordQualityEvent(store, FOREIGN_SCRIPT_RETRIES)
    }
    const correction = first ? THAI_SCRIPT_CORRECTION_INSTRUCTION : 'Return valid JSON with every rubric id exactly once.'
    const retryPrompt = `${call.prompt}\n\n${correction}`
    const retryPromptTokens = await countPromptTokens(ai, model, call.systemInstruction, retryPrompt)
    const retry = validateExactSections(safelyParseJson(await generate({ ...call, prompt: retryPrompt, promptTokens: retryPromptTokens })), activeSections)
    if (retry) return retry
    // Returning the complete first answer beats failing a review the user has
    // already waited for, so a language slip alone never loses the whole result.
    if (first) return first
    throw new ApiFailure('INVALID_AI_RESPONSE', 'คำตอบจาก AI ไม่ครบตามหัวข้อที่กำหนด โปรดลองใหม่อีกครั้ง', 502, true)
  } catch (error) {
    if (error instanceof ApiFailure) throw error
    throw mapGeminiError(error)
  }
}

type AnalysisPayload = {
  reportText: string
  referenceSummary: unknown
  documentType: DocumentType
}

type ModelPlan = {
  model: string
  chunks: ModelCall[]
}

async function prepareModelPlan(ai: GoogleGenAI, model: string, payload: AnalysisPayload, activeSections: ActiveSection[]): Promise<ModelPlan> {
  const fullPrompt = buildAnalysisContents(payload, activeSections)
  const fullTokenCount = await countPromptTokens(ai, model, SYSTEM_INSTRUCTION, fullPrompt)
  if (fullTokenCount <= SINGLE_CALL_TOKEN_LIMIT) {
    return { model, chunks: [{ systemInstruction: SYSTEM_INSTRUCTION, prompt: fullPrompt, promptTokens: fullTokenCount }] }
  }

  const texts = splitDocumentForAnalysis(payload.reportText)
  if (texts.length > MAX_ANALYSIS_CHUNKS) throw new ApiFailure('DOCUMENT_TOKEN_LIMIT', 'เอกสารมี token มากเกินขนาดที่ระบบแบ่งวิเคราะห์ได้ โปรดลดเนื้อหาแล้วลองใหม่', 413)
  const prompts = texts.map((chunk, index) => buildAnalysisContents({ ...payload, reportText: chunk }, activeSections, { index: index + 1, total: texts.length }))
  const tokenCounts = await Promise.all(prompts.map((prompt) => countPromptTokens(ai, model, SYSTEM_INSTRUCTION, prompt)))
  const chunks = prompts.map((prompt, index) => ({ systemInstruction: SYSTEM_INSTRUCTION, prompt, promptTokens: tokenCounts[index] }))
  const plannedInputTokens = tokenCounts.reduce((sum, tokens) => sum + tokens, 0)
  if (chunks.some((chunk) => chunk.promptTokens > SINGLE_CALL_TOKEN_LIMIT) || plannedInputTokens > 1_000_000) {
    throw new ApiFailure('DOCUMENT_TOKEN_LIMIT', 'เอกสารมี token มากเกินขนาดที่ระบบแบ่งวิเคราะห์ได้ โปรดลดเนื้อหาแล้วลองใหม่', 413)
  }
  return { model, chunks }
}

/**
 * Second stage of a chunked analysis: the model sees only the structured
 * findings from every chunk — never the document text again — and re-judges the
 * rubric for the document as a whole.
 */
async function consolidateChunkFindings(
  ai: GoogleGenAI, model: string, responses: ModelResponse[], payload: AnalysisPayload, activeSections: ActiveSection[], ledger: TokenLedger,
  store: RateLimitStore | undefined,
) {
  const findings = responses.map((response, index) => compactChunkFindings(index + 1, response.sections))
  const prompt = buildConsolidationContents({
    referenceSummary: payload.referenceSummary, documentType: payload.documentType, findings, totalChunks: responses.length,
  }, activeSections)
  const promptTokens = await countPromptTokens(ai, model, CONSOLIDATION_SYSTEM_INSTRUCTION, prompt)
  if (promptTokens > SINGLE_CALL_TOKEN_LIMIT) {
    throw new ApiFailure('CONSOLIDATION_INPUT_TOO_LARGE', 'ผลวิเคราะห์รายส่วนรวมกันแล้วใหญ่เกินกว่าจะสรุปในครั้งเดียว โปรดลดจำนวนหัวข้อหรือความยาวเอกสารแล้วลองใหม่', 413)
  }

  try {
    return await generateValidated(ai, model, { systemInstruction: CONSOLIDATION_SYSTEM_INSTRUCTION, prompt, promptTokens }, activeSections, ledger, store)
  } catch (error) {
    if (error instanceof ApiFailure && error.code === 'INVALID_AI_RESPONSE') {
      throw new ApiFailure('CONSOLIDATION_FAILED', 'ระบบรวมผลวิเคราะห์ทุกส่วนของเอกสารไม่สำเร็จ จึงยังไม่แสดงคะแนนเพื่อไม่ให้ผลคลาดเคลื่อน โปรดลองใหม่อีกครั้ง', 502, true)
    }
    throw error
  }
}

async function generateModelPlan(ai: GoogleGenAI, plan: ModelPlan, payload: AnalysisPayload, activeSections: ActiveSection[], ledger: TokenLedger, store: RateLimitStore | undefined) {
  const responses: ModelResponse[] = []
  for (const call of plan.chunks) responses.push(await generateValidated(ai, plan.model, call, activeSections, ledger, store))
  if (responses.length === 1) return responses[0]

  const consolidated = await consolidateChunkFindings(ai, plan.model, responses, payload, activeSections, ledger, store)
  return {
    ...consolidated,
    qualityWarnings: uniqueLimited([
      `เอกสารยาวเกินการวิเคราะห์ครั้งเดียว ระบบจึงอ่านเป็น ${responses.length} ส่วนโดยไม่ตัดข้อความ แล้วสรุปรวมทั้งเอกสารอีกครั้ง`,
      ...consolidated.qualityWarnings,
    ], 5),
  }
}

async function analyzeWithGemini(payload: AnalysisPayload, activeSections: ActiveSection[], env: AnalysisEnv, ledger: TokenLedger) {
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
  let plan: ModelPlan
  try {
    plan = await prepareModelPlan(ai, primaryModel, payload, activeSections)
  } catch (error) {
    if (!fallbackModel || !canUseFallback(error)) throw error
    fallbackReason = error
    try {
      plan = await prepareModelPlan(ai, fallbackModel, payload, activeSections)
    } catch (fallbackError) {
      throw canUseFallback(fallbackError) ? exhaustedGeminiFailure(fallbackError) : fallbackError
    }
  }

  const dailyRequestLimit = Number(env.DAILY_BUDGET_LIMIT ?? '100')
  if (env.RATE_LIMIT && await incrementCounter(env.RATE_LIMIT, `budget:requests:${new Date().toISOString().slice(0, 10)}`, Number.isFinite(dailyRequestLimit) ? dailyRequestLimit : 100, 1, 60 * 60 * 36)) {
    throw new ApiFailure('DAILY_REQUEST_BUDGET', 'จำนวนการตรวจของระบบวันนี้ครบแล้ว โปรดลองใหม่วันถัดไป', 429)
  }

  let response: ModelResponse
  try {
    response = await generateModelPlan(ai, plan, payload, activeSections, ledger, env.RATE_LIMIT)
  } catch (error) {
    if (!fallbackModel || plan.model === fallbackModel || !canUseFallback(error)) throw plan.model === fallbackModel && canUseFallback(error) ? exhaustedGeminiFailure(error) : error
    fallbackReason = error
    try {
      const fallbackPlan = await prepareModelPlan(ai, fallbackModel, payload, activeSections)
      response = await generateModelPlan(ai, fallbackPlan, payload, activeSections, ledger, env.RATE_LIMIT)
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

  // The corrective retry already ran and did not clear it. Saying so in the
  // result is the difference between a known cosmetic flaw and a silent one:
  // the reader can see why a stray character is there instead of doubting the
  // whole review.
  if (containsForeignScript(response)) {
    console.warn(JSON.stringify({ event: 'foreign_script_persisted', model: plan.model }))
    await recordQualityEvent(env.RATE_LIMIT, FOREIGN_SCRIPT_PERSISTED)
    response = {
      ...response,
      qualityWarnings: uniqueLimited(['ข้อความบางส่วนมีตัวอักษรภาษาอื่นปนอยู่ ระบบขอให้ AI เขียนใหม่แล้วแต่ยังไม่หาย คะแนนและหลักฐานยังใช้ได้ตามปกติ', ...response.qualityWarnings], 5),
    }
  }
  return { response, model: plan.model, chunkCount: plan.chunks.length, tokensCharged: ledger.spent }
}

/**
 * Answers the question the presence of a key cannot: does Google still accept
 * it? A key that has been deleted or disabled looks identical to a working one
 * from inside the Worker, so the only honest check is an authenticated call.
 * countTokens is used because it consumes no generation quota.
 */
async function probeGeminiReachable(env: AnalysisEnv): Promise<AiReachability> {
  if (env.MOCK_ANALYSIS === 'true') return { reachable: false, code: 'MOCK_ANALYSIS', checkedAt: nowInSeconds() }
  if (!env.GEMINI_API_KEY) return { reachable: false, code: 'AI_CONFIGURATION', checkedAt: nowInSeconds() }

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: AI_CHECK_TIMEOUT_MS } })
  try {
    await ai.models.countTokens({ model: env.GEMINI_MODEL?.trim() || DEFAULT_PRIMARY_MODEL, contents: 'health check' })
    return { reachable: true, code: 'OK', checkedAt: nowInSeconds() }
  } catch (error) {
    const verdict = { reachable: false, code: mapGeminiError(error).code, checkedAt: nowInSeconds() }
    console.warn(JSON.stringify({ event: 'gemini_health_check_failed', code: verdict.code }))
    return verdict
  }
}

/**
 * The cached front door to the probe. Caching matters because the endpoint is
 * public: without it, repeated calls would spend the per-minute allowance that
 * real reviews depend on. The verdict carries the moment it was taken so a
 * reader who just replaced the key can tell a fresh answer from a stale one.
 */
async function checkGeminiReachable(env: AnalysisEnv): Promise<AiReachability> {
  const cached = aiReachabilitySchema.safeParse(safelyParseJson(await env.RATE_LIMIT?.get(AI_CHECK_CACHE_KEY) ?? ''))
  if (cached.success) return cached.data

  const verdict = await probeGeminiReachable(env)
  await env.RATE_LIMIT?.put(AI_CHECK_CACHE_KEY, JSON.stringify(verdict), { expirationTtl: AI_CHECK_CACHE_SECONDS })
  return verdict
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000)
}

function serializeAnalysisResponse(
  apiVersion: RequestApiVersion,
  documentType: DocumentType,
  rubricVersion: string,
  model: string,
  chunkCount: number,
  prepared: ReturnType<typeof prepareWorkerDocument>,
  modelResponse: ModelResponse,
  activeSections: ActiveSection[],
) {
  const byId = new Map(modelResponse.sections.map((section) => [section.id, section]))
  const sections = activeSections.map((section) => ({ ...section, ...byId.get(section.id)! }))

  if (apiVersion === LEGACY_API_VERSION) {
    // Exact pre-version response shape: the deployed Pages bundle uses a
    // strict schema and would reject documentType, apiVersion, applicability,
    // scoreSummary or analyzedChunkCount during a Worker-first rollout.
    const legacySections = sections.map(({ applicability: _applicability, ...section }) => section)
    const legacyScore = calculateOverallScore(sections.map((section) => ({ ...section, applicability: DEFAULT_APPLICABILITY })))
    return JSON.stringify({
      overallScore: legacyScore.overallScore ?? 0,
      sections: legacySections,
      qualityWarnings: modelResponse.qualityWarnings.slice(0, 5),
      consistencyNotes: modelResponse.consistencyNotes,
      referenceComment: modelResponse.referenceComment,
      model,
      rubricVersion,
      documentInfo: { appendixExcluded: Boolean(prepared.appendixHeading), excludedCharCount: prepared.excludedCharCount },
    })
  }

  const score = calculateOverallScore(sections)
  return JSON.stringify({
    apiVersion: API_VERSION,
    documentType,
    overallScore: score.overallScore,
    scoreSummary: {
      applicableSectionCount: score.applicableSectionCount,
      notApplicableSectionCount: score.notApplicableSectionCount,
      scoredWeight: score.scoredWeight,
    },
    sections,
    qualityWarnings: modelResponse.qualityWarnings,
    consistencyNotes: modelResponse.consistencyNotes,
    referenceComment: modelResponse.referenceComment,
    model,
    rubricVersion,
    documentInfo: {
      appendixExcluded: Boolean(prepared.appendixHeading), excludedCharCount: prepared.excludedCharCount, analyzedChunkCount: chunkCount,
    },
  })
}

export async function handleAnalyze(request: Request, env: AnalysisEnv) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiFailure('UNSUPPORTED_CONTENT_TYPE', 'คำขอต้องเป็น JSON', 415)
  const idempotencyKey = request.headers.get('Idempotency-Key')
  if (!idempotencyKey || idempotencyKey.length < 16 || idempotencyKey.length > 200) throw new ApiFailure('INVALID_IDEMPOTENCY_KEY', 'คำขอตรวจไม่สมบูรณ์ โปรดรีเฟรชหน้าแล้วลองใหม่', 400)

  // The body is read and validated first, so a malformed or unauthorised-shaped
  // request can never reach a cached result belonging to a well-formed one.
  const rawBody = await readJsonWithinLimit(request)
  const apiVersion = requestedApiVersion(request)
  const parsed = requestSchema.safeParse(rawBody)
  if (!parsed.success) throw new ApiFailure('INVALID_REQUEST', 'ข้อมูลเอกสาร ประเภท หรือเกณฑ์ไม่ถูกต้อง โปรดตรวจข้อมูลแล้วลองใหม่', 400)

  const digest = await canonicalRequestDigest(parsed.data)
  const idempotencyCacheKey = `idempotency:${await hashKey(idempotencyKey)}:v${apiVersion}`
  if (env.RATE_LIMIT) {
    const cached = await env.RATE_LIMIT.get(idempotencyCacheKey)
    if (cached) {
      const record = idempotencyRecordSchema.safeParse(safelyParseJson(cached))
      if (record.success && record.data.digest === digest) return new Response(record.data.response, { headers: securityHeaders })
      if (record.success) {
        throw new ApiFailure('IDEMPOTENCY_CONFLICT', 'คีย์คำขอนี้ถูกใช้กับเอกสารหรือเกณฑ์ชุดอื่นไปแล้ว โปรดเริ่มการตรวจใหม่เพื่อรับคีย์ใหม่', 409, false)
      }
    }
  }

  const prepared = prepareWorkerDocument(parsed.data.reportText)
  if (prepared.appendixHeading && !parsed.data.documentOptions.excludeAppendix) throw new ApiFailure('APPENDIX_CONFIRMATION_REQUIRED', `พบส่วน “${prepared.appendixHeading}” กรุณายืนยันการไม่นำภาคผนวกไปวิเคราะห์`, 409)
  if (!prepared.mainText) throw new ApiFailure('EMPTY_MAIN_DOCUMENT', 'ไม่พบเนื้อหาเอกสารหลักก่อนภาคผนวก', 400)
  if (prepared.mainText.length > maxChars(env)) throw new ApiFailure('DOCUMENT_CHAR_LIMIT', 'เนื้อหาเอกสารหลักยาวเกิน 200,000 ตัวอักษร ระบบไม่ได้ตัดหรือส่งข้อความ', 413)

  const activeSections = sanitizeRubric(parsed.data.rubric.sections)
  if (activeSections.length === 0) throw new ApiFailure('EMPTY_RUBRIC', 'ต้องมีหัวข้อที่นำมาคิดคะแนนและมีน้ำหนักมากกว่า 0 อย่างน้อยหนึ่งหัวข้อ', 400)

  if (env.RATE_LIMIT) {
    const window = new Date().toISOString().slice(0, 13)
    const [ipHash, tokenHash] = await Promise.all([hashKey(getClientIp(request)), hashKey(parsed.data.anonymousToken)])
    const limitedIp = await incrementCounter(env.RATE_LIMIT, `rate:ip:${ipHash}:${window}`, RATE_LIMIT_PER_HOUR)
    const limitedToken = await incrementCounter(env.RATE_LIMIT, `rate:anon:${tokenHash}:${window}`, RATE_LIMIT_PER_HOUR)
    if (limitedIp || limitedToken) throw new ApiFailure('RATE_LIMITED', 'ส่งคำขอครบขีดจำกัดชั่วคราวแล้ว โปรดลองใหม่ในชั่วโมงถัดไป', 429, true)
  } else if (env.MOCK_ANALYSIS !== 'true') throw new ApiFailure('RATE_LIMIT_UNAVAILABLE', 'ระบบจำกัดคำขอยังไม่พร้อม กรุณาแจ้งผู้ดูแลระบบ', 503)

  const payload: AnalysisPayload = { reportText: prepared.mainText, referenceSummary: parsed.data.referenceSummary, documentType: parsed.data.documentType }
  const modelOutput = env.MOCK_ANALYSIS === 'true'
    ? { response: { ...mockModelResponse(activeSections), consistencyNotes: [`Mock: ${getDocumentTypeDefinition(parsed.data.documentType).consistencyLabel}`] }, model: 'mock-analysis-v1', chunkCount: 1 }
    : await analyzeWithGemini(payload, activeSections, env, createTokenLedger(env))
  const serialized = serializeAnalysisResponse(
    apiVersion, parsed.data.documentType, parsed.data.rubric.version, modelOutput.model, modelOutput.chunkCount,
    prepared, modelOutput.response, activeSections,
  )
  if (env.RATE_LIMIT) {
    await env.RATE_LIMIT.put(
      idempotencyCacheKey,
      JSON.stringify({ version: IDEMPOTENCY_RECORD_VERSION, digest, response: serialized }),
      { expirationTtl: IDEMPOTENCY_TTL_SECONDS },
    )
  }
  return new Response(serialized, { headers: securityHeaders })
}

/**
 * The hourly watch. `?verify=ai` only tells you the key is dead once somebody
 * thinks to look; this asks on its own and says so out loud. It probes past the
 * cache, because a cached "reachable" from five minutes ago would defeat the
 * whole point, then refreshes that cache so the next reader benefits.
 *
 * Silence on success is deliberate: an alert that fires every hour is an alert
 * nobody reads.
 */
async function watchGeminiReachable(env: AnalysisEnv) {
  const verdict = await probeGeminiReachable(env)
  await env.RATE_LIMIT?.put(AI_CHECK_CACHE_KEY, JSON.stringify(verdict), { expirationTtl: AI_CHECK_CACHE_SECONDS })
  if (verdict.reachable) {
    console.log(JSON.stringify({ event: 'gemini_watch_ok' }))
    return
  }

  console.error(JSON.stringify({ event: 'gemini_watch_failed', code: verdict.code }))
  if (!env.ALERT_WEBHOOK_URL) return
  try {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // `content` is what Discord and Slack-compatible webhooks read. The code
      // is repeated as its own field for anything that parses the body.
      body: JSON.stringify({
        content: `RubricLensAi: Gemini เรียกไม่ได้ (${verdict.code}) ระบบตรวจเอกสารใช้งานไม่ได้ในขณะนี้`,
        code: verdict.code,
      }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    })
  } catch (error) {
    // A failed alert must not retry the whole scheduled run; the log above is
    // still recorded either way.
    console.error(JSON.stringify({ event: 'gemini_watch_alert_failed', reason: error instanceof Error ? error.name : 'unknown' }))
  }
}

export default {
  async scheduled(_controller: ScheduledController, env: Env | AnalysisEnv, ctx: ExecutionContext) {
    ctx.waitUntil(watchGeminiReachable(env))
  },

  async fetch(request: Request, env: Env | AnalysisEnv): Promise<Response> {
    const url = new URL(request.url)
    let response: Response
    try {
      if (request.method === 'OPTIONS' && url.pathname === '/api/analyze') response = new Response(null, { status: 204, headers: { ...securityHeaders, allow: 'POST, OPTIONS' } })
      else if (request.method === 'GET' && url.pathname === '/api/health') {
        const configured = Boolean(env.GEMINI_API_KEY && env.RATE_LIMIT && env.MOCK_ANALYSIS !== 'true')
        const report = {
          apiVersion: API_VERSION,
          supportedApiVersions: [...SUPPORTED_REQUEST_API_VERSIONS],
          legacyDefaultVersion: LEGACY_API_VERSION,
          status: configured ? 'ok' : 'degraded',
          aiConfigured: Boolean(env.GEMINI_API_KEY), rateLimitConfigured: Boolean(env.RATE_LIMIT),
          model: env.GEMINI_MODEL ?? DEFAULT_PRIMARY_MODEL, fallbackModel: env.GEMINI_FALLBACK_MODEL ?? DEFAULT_FALLBACK_MODEL,
        }
        // The default check stays free and instant. `?verify=ai` is the opt-in
        // that actually asks Google whether the configured key still works,
        // because aiConfigured only ever proved that some value was present.
        if (url.searchParams.get('verify') !== 'ai') response = json(report, configured ? 200 : 503)
        else {
          const ai = await checkGeminiReachable(env)
          const ready = configured && ai.reachable
          response = json({
            ...report,
            status: ready ? 'ok' : 'degraded',
            aiReachable: ai.reachable,
            aiCheckCode: ai.code,
            // A cached verdict can be up to five minutes old. Saying how old
            // stops a reader who just replaced the key from trusting the
            // answer that was taken before they did.
            aiCheckAgeSeconds: Math.max(0, nowInSeconds() - ai.checkedAt),
            foreignScriptRetriesToday: await readQualityEvent(env.RATE_LIMIT, FOREIGN_SCRIPT_RETRIES),
            foreignScriptPersistedToday: await readQualityEvent(env.RATE_LIMIT, FOREIGN_SCRIPT_PERSISTED),
          }, ready ? 200 : 503)
        }
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
