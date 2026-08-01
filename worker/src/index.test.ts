import { describe, expect, it } from 'vitest'

import worker, { type Env } from './index'

const body = {
  reportText: 'บทนำ เนื้อหาทดสอบ', anonymousToken: 'anonymous-token-for-local-testing',
  rubric: { version: 'project-th-v1', sections: [{ id: 'introduction', title: 'บทนำ', criteria: 'มีบริบท', weight: 2, enabled: true }, { id: 'disabled', title: 'หัวข้อปิด', criteria: 'ไม่ใช้', weight: 1, enabled: false }] },
  referenceSummary: { bibliographyDetected: false, bibliographyEntryCount: 0, numericCitationCount: 0, authorYearCitationCount: 0, unmatchedNumericCitationCount: 0, potentiallyUncitedEntryCount: 0 },
}

describe('POST /api/analyze', () => {
  it('returns a mock response and calculates the score in code', async () => {
    const response = await worker.fetch(new Request('https://local.test/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'test-idempotency-key' }, body: JSON.stringify(body) }), { MOCK_ANALYSIS: 'true' } satisfies Env)
    const result = await response.json() as { overallScore: number; sections: unknown[]; model: string }
    expect(response.status).toBe(200)
    expect(result.overallScore).toBe(67)
    expect(result.sections).toHaveLength(1)
    expect(result.model).toBe('mock-analysis-v1')
  })

  it('rejects a request without an idempotency key', async () => {
    const response = await worker.fetch(new Request('https://local.test/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { MOCK_ANALYSIS: 'true' } satisfies Env)
    expect(response.status).toBe(400)
  })

  it('rejects a non-JSON request before parsing it', async () => {
    const response = await worker.fetch(new Request('https://local.test/api/analyze', { method: 'POST', headers: { 'Idempotency-Key': 'test-idempotency-key' }, body: 'not-json' }), { MOCK_ANALYSIS: 'true' } satisfies Env)
    expect(response.status).toBe(415)
  })
})
