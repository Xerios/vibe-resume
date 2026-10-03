import { describe, expect, it } from 'vitest'
import DEFAULT_YAML from './template.yaml?raw'
import LEGACY_YAML from './fixtures/legacy-cv.yaml?raw'
import { OSS_COLUMNS, migrateTree } from '@vibe-resume/core/migrate-tree'
import { parse } from './relaxed-yaml'

describe('migrateTree', () => {
  it('reads the old shipped document as the new one', () => {
    const tree = migrateTree(parse(LEGACY_YAML).value)
    expect(tree).toMatchObject(parse(DEFAULT_YAML).value)
  })

  it('turns a table header on into its column headings', () => {
    const tree = migrateTree(parse('sections:\n  - type: oss\n    hasHeader: true\n    projects:\n      - name: kit\n        stars: 1\n').value)
    expect(tree.sections[0]).toMatchObject({ type: 'table', columns: OSS_COLUMNS, items: [{ name: 'kit', value: '1' }] })
  })
})
