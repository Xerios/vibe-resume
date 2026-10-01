/**
 * The schema warnings. The dialect barely has parse errors left, so these are
 * most of what the editor has to say — and the shipped document having nothing
 * to answer for is what keeps them honest.
 */

import { describe, expect, it } from 'vitest'
import DEFAULT_YAML from '../default-cv.yaml?raw'
import { SECTIONS, lintCv } from './lint.js'

/** @param {string} text */
const messages = (text) => lintCv(text).map((d) => d.message)
/** @param {string} text */
const only = (text) => {
  const found = lintCv(text)
  expect(found).toHaveLength(1)
  return found[0]
}

/** A document with one section spliced in, indented to sit under `sections:`. */
const doc = (/** @type {string} */ section) => `header:\n  name: Jo\nsections:\n  - ${section.trim().split('\n').join('\n    ')}\n`

describe('the shipped document', () => {
  it('has nothing to answer for', () => {
    expect(lintCv(DEFAULT_YAML)).toEqual([])
  })

  it('uses every type the table knows about', () => {
    expect(new Set(Object.keys(SECTIONS))).toEqual(
      new Set(/** @type {string[]} */ (['text', 'groups', 'entries', 'records', 'levels', 'list', 'table'])),
    )
  })
})

describe('sections', () => {
  it('names a type it does not know', () => {
    const d = only(doc('type: experence\ntitle: Work\nitems:\n  - title: Dev'))
    expect(d.message).toMatch(/`experence` isn't a section type/)
    expect(d.severity).toBe('warning')
  })

  it('says where a section keeps its content', () => {
    expect(messages(doc('type: entries\ntitle: Work'))).toEqual([expect.stringContaining('holds its content under `items:`')])
  })

  it('flags a key nothing renders', () => {
    expect(messages(doc('type: list\ntitle: Interests\ninlined: true\nitems:\n  - Chess'))).toEqual([
      expect.stringMatching(/Nothing renders `inlined`.*type, title, rail, items, inline/s),
    ])
  })

  it('flags a key nothing renders on an entry', () => {
    expect(messages(doc('type: levels\ntitle: Languages\nitems:\n  - name: English\n    fluency: Native'))).toEqual([
      expect.stringContaining('Nothing renders `fluency`'),
    ])
  })

  it('reaches the rows inside a groups block', () => {
    expect(messages(doc('type: groups\ntitle: Skills\nblocks:\n  - title: Core\n    rows:\n      - txt: Go'))).toEqual([
      expect.stringContaining('Nothing renders `txt`'),
    ])
  })

  it('wants a list where a list belongs', () => {
    expect(messages(doc('type: text\ntitle: Summary\nparagraphs: one line'))).toEqual([expect.stringContaining('`paragraphs` has to be a list')])
  })

  it('says nothing about a section it understands', () => {
    expect(lintCv(doc('type: table\ntitle: Open Source\ncolumns:\n  - Project\n  - Stars\n  - About\nrail: true\nitems:\n  - name: kit\n    value: 12\n    desc: A kit'))).toEqual([])
  })
})

describe('the line that reads as a key', () => {
  it('catches a bullet that turned into a mapping', () => {
    const d = only(doc('type: entries\ntitle: Work\nitems:\n  - title: Dev\n    bullets:\n      - Analytics: Mixpanel, GA'))
    expect(d.message).toMatch(/`Analytics:` at the start of this line reads as a key.*single quotes/s)
  })

  it('leaves the quoted form alone', () => {
    expect(lintCv(doc("type: entries\ntitle: Work\nitems:\n  - title: Dev\n    bullets:\n      - 'Analytics: Mixpanel, GA'"))).toEqual([])
  })

  it('catches it in a summary, a plain list and the contact block', () => {
    expect(messages(doc('type: text\ntitle: Summary\nparagraphs:\n  - Note: hello'))).toHaveLength(1)
    expect(messages(doc('type: list\ntitle: Interests\nitems:\n  - Chess: online'))).toHaveLength(1)
    expect(messages('header:\n  contact:\n    - Email: jo@example.dev\n')).toHaveLength(1)
  })

  it('leaves a colon that is not at the start of the line alone', () => {
    expect(lintCv(doc('type: text\ntitle: Summary\nparagraphs:\n  - Two words: still prose'))).toEqual([])
  })
})

describe('the document itself', () => {
  it('flags a top-level key nothing reads', () => {
    expect(messages('header:\n  name: Jo\nfooter:\n  note: hi\n')).toEqual([expect.stringContaining('Nothing renders `footer`')])
  })

  it('wants sections to be a list', () => {
    expect(messages('sections: none\n')).toEqual([expect.stringContaining('`sections` has to be a list')])
  })

  it('has nothing to say about an empty document', () => {
    expect(lintCv('')).toEqual([])
    expect(lintCv('# just a comment\n')).toEqual([])
  })
})

describe('ranges', () => {
  it('underlines the key it is talking about, not the whole line', () => {
    const text = 'header:\n  nickname: Jo\n'
    const d = only(text)
    expect(text.slice(d.from, d.to)).toBe('nickname')
  })

  it('underlines the value of an unknown type', () => {
    const text = 'sections:\n  - type: experence\n    items:\n      - title: Dev\n'
    const d = lintCv(text)[0]
    expect(text.slice(d.from, d.to)).toBe('experence')
  })

  it('carries the parser’s own diagnostics through', () => {
    expect(lintCv('a:\n\tb: 1').some((d) => d.severity === 'error')).toBe(true)
  })
})
