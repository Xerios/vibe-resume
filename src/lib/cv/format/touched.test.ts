/**
 * Naming an edit by the parts it touched. Each side of the edit is read in its
 * own text, so a section that is gone is still named by the title it had.
 */

import { describe, expect, it } from 'vitest'
import { touchedParts } from './touched'

const CV = `header:
  name: Jane
sections:
  - type: summary
    title: Summary
    paragraphs:
      - Hello.

  - type: skills
    blocks:
      - title: Core
        rows:
          - text: JS
`

/**
 * The delta that turns `before` into `after` by replacing one stretch.
 */
function delta(before: string, after: string) {
  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++
  let tail = 0
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++
  const ops: any[] = []
  if (head) ops.push({ retain: head })
  if (before.length - head - tail) ops.push({ delete: before.length - head - tail })
  if (after.length - head - tail) ops.push({ insert: after.slice(head, after.length - tail) })
  return ops
}

const touched = (before: string, after: string) => touchedParts(before, after, delta(before, after))

describe('touchedParts', () => {
  it('names a section by its title', () => {
    expect(touched(CV, CV.replace('Hello.', 'Hello there.'))).toEqual(['Summary'])
  })

  it('falls back to the type when there is no title', () => {
    expect(touched(CV, CV.replace('JS', 'TypeScript'))).toEqual(['Skills'])
  })

  it('names the header', () => {
    expect(touched(CV, CV.replace('Jane', 'Jane Doe'))).toEqual(['Header'])
  })

  it('names every part one change spans', () => {
    expect(touched(CV, CV.replace(/Jane[\s\S]*Hello/, 'Jo\nsections:\n  - type: summary\n    title: Summary\n    paragraphs:\n      - Hi'))).toEqual([
      'Header',
      'Summary',
    ])
  })

  it('names a deleted section by the title it had', () => {
    // The exact range, as the editor reports it: trimming the two texts would
    // slide it along the \`  - type: \` the two sections start with.
    const at = CV.indexOf('  - type: summary')
    const length = CV.indexOf('  - type: skills') - at
    const gone = CV.slice(0, at) + CV.slice(at + length)
    expect(touchedParts(CV, gone, [{ retain: at }, { delete: length }])).toEqual(['Summary'])
  })

  it('does not blame the next section for a line ended with Enter above it', () => {
    expect(touched(CV, CV.replace('      - Hello.\n', '      - Hello.\n      - More.\n'))).toEqual(['Summary'])
  })
})
