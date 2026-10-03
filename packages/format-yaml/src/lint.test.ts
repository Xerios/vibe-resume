/**
 * The schema warnings. The dialect barely has parse errors left, so these are
 * most of what the editor has to say — and the shipped document having nothing
 * to answer for is what keeps them honest.
 */

import { describe, expect, it } from 'vitest'
import DEFAULT_YAML from './template.yaml?raw'
import { SECTIONS } from '@vibe-resume/core/schema'
import { yaml } from './index'
import { lintCv } from './lint'

const messages = (text: string) => lintCv(text).map((d: any) => d.message)
const only = (text: string) => {
  const found = lintCv(text)
  expect(found).toHaveLength(1)
  return found[0]
}

/** A document with one section spliced in, indented to sit under `sections:`. */
const doc = (section: string) => `header:\n  name: Jo\nsections:\n  - ${section.trim().split('\n').join('\n    ')}\n`

describe('the shipped document', () => {
  it('has nothing to answer for', () => {
    expect(lintCv(DEFAULT_YAML)).toEqual([])
  })

  it('is written the way the writing guide asks', () => {
    expect(yaml.lint(DEFAULT_YAML)).toEqual([])
  })

  it('uses every type the table knows about', () => {
    expect(new Set(Object.keys(SECTIONS))).toEqual(new Set(/** @type {string[]} */ (['text', 'groups', 'entries', 'records', 'levels', 'list', 'table'])))
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
      expect.stringMatching(/Nothing renders `inlined`.*type, title, items, inline/s),
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
    expect(
      lintCv(doc('type: table\ntitle: Open Source\ncolumns:\n  - Project\n  - Stars\n  - About\nitems:\n  - name: kit\n    value: 12\n    desc: A kit')),
    ).toEqual([])
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

  it('offers to wrap such a line in quotes', () => {
    const text = doc("type: entries\ntitle: Work\nitems:\n  - title: Dev\n    bullets:\n      - Analytics: Bob's GA")
    const found = only(text)
    expect(text.slice(found.from, found.to)).toBe("Analytics: Bob's GA")
    expect(found.fixes).toEqual([{ label: 'Wrap in quotes', insert: "'Analytics: Bob''s GA'" }])
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

describe('date formats', () => {
  const jobs = (dates: string[]) => doc(`type: entries\nitems:\n${dates.map((d: string) => `  - title: Dev\n    dates: ${d}`).join('\n')}`)

  it('points at the one written differently from the rest', () => {
    const text = jobs(['03/2020 – Present', '06/2016 – 02/2020', 'Mar 2014 – May 2016'])
    const d = only(text)
    expect(d.severity).toBe('info')
    expect(text.slice(d.from, d.to)).toBe('Mar 2014 – May 2016')
    expect(d.message).toContain('`03/2020`')
  })

  it('catches a range that switches halfway', () => {
    expect(messages(jobs(['03/2020 – Present', '06/2016 – Feb 2020']))).toHaveLength(1)
  })

  it('lets a bare year sit beside months', () => {
    expect(messages(jobs(['03/2020 – Present', '2010 – 2014', '2016-2020']))).toEqual([])
  })

  it('leaves what it cannot read alone', () => {
    expect(messages(jobs(['Summer 2019', 'mars 2020 – présent', '03/2020 – 05/2021']))).toEqual([])
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
