import { describe, expect, it } from 'vitest'

import { DEFAULT_DOCUMENT_TYPE, getDocumentTypeDefinition, LEGACY_DOCUMENT_TYPE } from '../../shared/document-types'
import { cloneRubricTemplate, DEFAULT_RUBRIC_TEMPLATE_ID, getDefaultRubricTemplate, getRubricTemplatesForDocumentType, inferDocumentTypeFromTemplate, rubricSchema, rubricTemplates } from './rubric'

describe('document-specific rubric templates', () => {
  it('defaults to a general report instead of a project', () => {
    expect(DEFAULT_DOCUMENT_TYPE).toBe('general-report')
    expect(DEFAULT_RUBRIC_TEMPLATE_ID).toBe('general-report-th-v1')
    expect(getDefaultRubricTemplate().documentType).toBe('general-report')
  })

  it('keeps project as the legacy fallback for requests made before document types existed', () => {
    expect(LEGACY_DOCUMENT_TYPE).toBe('project')
    expect(getDefaultRubricTemplate(LEGACY_DOCUMENT_TYPE).id).toBe('project-th-v1')
  })

  it('provides distinct complete rubrics for all three document types', () => {
    expect(rubricTemplates.map((template) => template.documentType)).toEqual([
      'general-report',
      'project',
      'research-report',
    ])

    const generalIds = rubricTemplates[0].sections.map((section) => section.id)
    const projectIds = rubricTemplates[1].sections.map((section) => section.id)
    const researchIds = rubricTemplates[2].sections.map((section) => section.id)

    expect(generalIds).toEqual(expect.arrayContaining(['information-coverage', 'analysis-synthesis']))
    expect(generalIds).not.toEqual(expect.arrayContaining(['implementation', 'population-sample']))
    expect(projectIds).toEqual(expect.arrayContaining(['design', 'implementation', 'deliverable-results', 'testing-evaluation']))
    expect(researchIds).toEqual(expect.arrayContaining(['hypothesis-variables', 'population-sample', 'research-instruments', 'data-analysis', 'research-ethics']))
  })

  it('binds each document type to its own template and to no other', () => {
    expect(getRubricTemplatesForDocumentType('general-report').map((template) => template.id)).toEqual(['general-report-th-v1'])
    expect(getRubricTemplatesForDocumentType('project').map((template) => template.id)).toEqual(['project-th-v1'])
    expect(inferDocumentTypeFromTemplate('project-th-v1')).toBe('project')
    expect(inferDocumentTypeFromTemplate('general-report-th-v1')).toBe('general-report')
    expect(inferDocumentTypeFromTemplate('unknown-template')).toBe(DEFAULT_DOCUMENT_TYPE)
  })

  it('keeps section ids unique and enabled weights valid in every template', () => {
    for (const template of rubricTemplates) {
      const ids = template.sections.map((section) => section.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(rubricSchema.safeParse({ version: template.version, sections: template.sections }).success).toBe(true)
      expect(template.sections.every((section) => section.enabled)).toBe(true)
    }
  })

  it('gives the report and the project rubrics genuinely different criteria', () => {
    const generalCriteria = rubricTemplates[0].sections.map((section) => section.criteria)
    const projectCriteria = rubricTemplates[1].sections.map((section) => section.criteria)
    expect(generalCriteria.filter((criteria) => projectCriteria.includes(criteria))).toEqual([])

    const generalDefinition = getDocumentTypeDefinition('general-report')
    const projectDefinition = getDocumentTypeDefinition('project')
    expect(generalDefinition.actionLabel).toBe('ตรวจรายงาน')
    expect(projectDefinition.actionLabel).toBe('ตรวจโครงงาน')
    expect(generalDefinition.resultTitle).toBe('ผลตรวจรายงานทั่วไป')
    expect(projectDefinition.resultTitle).toBe('ผลตรวจโครงงาน')
    expect(generalDefinition.consistencyDimensions).toEqual(['วัตถุประสงค์', 'เนื้อหา', 'การวิเคราะห์', 'สรุปผล'])
    expect(projectDefinition.consistencyDimensions).toEqual(['ปัญหา', 'วัตถุประสงค์', 'วิธีทำ', 'ผลงาน', 'การทดสอบ', 'สรุปผล'])
  })

  it('returns an independent clone that cannot mutate the source template', () => {
    const clone = cloneRubricTemplate('research-th-v1')
    clone.sections[0].title = 'แก้เฉพาะสำเนา'
    expect(rubricTemplates[2].sections[0].title).not.toBe('แก้เฉพาะสำเนา')
  })
})
