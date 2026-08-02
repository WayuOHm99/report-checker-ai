import type { SectionApplicability } from './api-contract'

export type ScorableSection = {
  score: number
  weight: number
  applicability: SectionApplicability
}

export type OverallScore = {
  /**
   * Weighted percentage over the applicable sections only, or `null` when no
   * section applies to this document. `null` is deliberately not `0`: a report
   * where every rubric item is out of scope has not scored badly, it has
   * nothing to score.
   */
  overallScore: number | null
  applicableSectionCount: number
  notApplicableSectionCount: number
  /** Sum of the weights that actually formed the denominator. */
  scoredWeight: number
}

export const MAX_SECTION_SCORE = 3

/**
 * Weighted score across applicable sections. Sections marked `not_applicable`
 * contribute to neither the numerator nor the denominator, so excluding an
 * irrelevant rubric item never drags the percentage down.
 */
export function calculateOverallScore(sections: readonly ScorableSection[]): OverallScore {
  const applicable = sections.filter((section) => section.applicability === 'applicable')
  const scoredWeight = applicable.reduce((sum, section) => sum + section.weight, 0)
  const denominator = scoredWeight * MAX_SECTION_SCORE
  const summary = {
    applicableSectionCount: applicable.length,
    notApplicableSectionCount: sections.length - applicable.length,
    scoredWeight,
  }
  if (applicable.length === 0 || denominator === 0) return { overallScore: null, ...summary }
  const numerator = applicable.reduce((sum, section) => sum + (section.score * section.weight), 0)
  return { overallScore: Math.round((numerator / denominator) * 100), ...summary }
}
