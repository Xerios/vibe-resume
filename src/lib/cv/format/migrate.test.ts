import { describe, expect, it } from 'vitest'
import DEFAULT_YAML from '../default-cv.yaml?raw'
import LEGACY_YAML from './fixtures/legacy-cv.yaml?raw'
import { lintCv } from './lint'
import { OSS_COLUMNS, migrateCv, migrateTree } from './migrate'
import { parse } from './relaxed-yaml'

describe('migrateCv', () => {
  it('turns the old shipped document into the new one, line for line', () => {
    expect(migrateCv(LEGACY_YAML)).toBe(DEFAULT_YAML)
  })

  it('leaves a document in the current types alone', () => {
    expect(migrateCv(DEFAULT_YAML)).toBeNull()
    expect(lintCv(DEFAULT_YAML)).toEqual([])
  })

  it('keeps comments, quotes and layout it has no reason to touch', () => {
    const old = "# mine\nsections:\n  - title: Work\n    type: 'experience'\n    items:\n      - title: Dev\n        school: Uni   \n"
    expect(migrateCv(old)).toBe('# mine\nsections:\n  - title: Work\n    type: entries\n    items:\n      - title: Dev\n        org: Uni   \n')
  })

  it('turns a table header on into its column headings, and off into nothing', () => {
    const on = migrateCv('sections:\n  - type: oss\n    hasHeader: true\n    projects:\n      - name: kit\n        stars: 1\n')
    expect(parse(on as string).value.sections[0]).toEqual({ type: 'table', columns: OSS_COLUMNS, items: [{ name: 'kit', value: '1' }] })
    const off = migrateCv('sections:\n  - type: oss\n    hasHeader: false\n    projects:\n      - name: kit\n')
    expect(off).toBe('sections:\n  - type: table\n    items:\n      - name: kit\n')
  })

  it('reads the same as the tree it would render as', () => {
    const tree = migrateTree(parse(LEGACY_YAML).value)
    expect(tree).toMatchObject(parse(DEFAULT_YAML).value)
  })
})
