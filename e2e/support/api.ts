import type { Page, Route } from '@playwright/test'

import { API_VERSION, API_VERSION_HEADER } from '../../shared/api-contract'

/**
 * The production bundle posts to the configured Worker origin, so the glob has
 * to match any host. Every E2E run stubs this route: the suite validates the
 * shipped bundle against the API contract, never a live Worker.
 */
export const ANALYZE_ROUTE = '**/api/analyze'

export type AnalyzeRequestBody = {
  reportText: string
  documentType: string
  anonymousToken: string
  rubric: { version: string; sections: Array<{ id: string; title: string; criteria: string; weight: number; enabled: boolean }> }
  referenceSummary: Record<string, number | boolean>
  documentOptions: { excludeAppendix: boolean }
}

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': `content-type, idempotency-key, ${API_VERSION_HEADER.toLowerCase()}`,
}

/** Builds a contract-shaped success response from the rubric the page actually sent. */
export function analysisResponseFor(request: AnalyzeRequestBody, overrides: Record<string, unknown> = {}) {
  const active = request.rubric.sections.filter((section) => section.enabled && section.weight > 0)
  const sections = active.map((section, index) => ({
    id: section.id,
    title: section.title,
    criteria: section.criteria,
    weight: section.weight,
    applicability: 'applicable' as const,
    score: [2, 3, 2][index % 3],
    reason: `พบเนื้อหาที่สัมพันธ์กับหัวข้อ ${section.title}`,
    evidence: [`ข้อความอ้างอิงสำหรับ ${section.title}`],
    missing: [`รายละเอียดเพิ่มเติมของ ${section.title}`],
    recommendation: `เพิ่มรายละเอียดให้ตรงเกณฑ์ของ ${section.title}`,
    confidence: 0.7,
  }))
  const scoredWeight = sections.reduce((sum, section) => sum + section.weight, 0)
  const numerator = sections.reduce((sum, section) => sum + (section.score * section.weight), 0)

  return {
    apiVersion: API_VERSION,
    documentType: request.documentType,
    overallScore: Math.round((numerator / (scoredWeight * 3)) * 100),
    scoreSummary: { applicableSectionCount: sections.length, notApplicableSectionCount: 0, scoredWeight },
    sections,
    qualityWarnings: [],
    consistencyNotes: ['ตรวจความสอดคล้องกับอาจารย์ผู้สอนอีกครั้ง'],
    referenceComment: 'โปรดยืนยันรูปแบบการอ้างอิงกับเกณฑ์รายวิชา',
    model: 'e2e-stub-model',
    rubricVersion: request.rubric.version,
    documentInfo: { appendixExcluded: request.documentOptions.excludeAppendix, excludedCharCount: 0, analyzedChunkCount: 1 },
    ...overrides,
  }
}

export function readAnalyzeRequest(route: Route): AnalyzeRequestBody {
  return JSON.parse(route.request().postData() ?? '{}') as AnalyzeRequestBody
}

type AnalyzeStub = {
  /** Raw body to return instead of the derived success payload. */
  body?: string
  status?: number
  contentType?: string
  overrides?: Record<string, unknown>
  onRequest?: (request: AnalyzeRequestBody, headers: Record<string, string>) => void
}

/** Installs the analyze stub. Returns nothing; assert through `onRequest`. */
export async function stubAnalyze(page: Page, stub: AnalyzeStub = {}) {
  await page.route(ANALYZE_ROUTE, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders })
      return
    }
    const request = readAnalyzeRequest(route)
    stub.onRequest?.(request, route.request().headers())
    await route.fulfill({
      status: stub.status ?? 200,
      contentType: stub.contentType ?? 'application/json',
      headers: corsHeaders,
      body: stub.body ?? JSON.stringify(analysisResponseFor(request, stub.overrides)),
    })
  })
}
