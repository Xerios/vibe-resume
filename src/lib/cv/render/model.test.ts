import { describe, expect, it } from 'vitest'
import DEFAULT_YAML from '../default-cv.yaml?raw'
import { textOf } from './inline.js'
import { buildModel, levelRating } from './model.js'
import { parseCv } from './parse.js'

const cv = parseCv(DEFAULT_YAML).cv

/** @param {import('./model.js').Model} m */
const titles = (m) => m.columns.map((c) => [c.id, c.sections.map((s) => s.title && textOf(s.title.spans[0].runs))])

describe('buildModel', () => {
  it('keeps every section, in source order, in one column', () => {
    const m = buildModel(cv, { layout: 'single' })
    expect(m.railSide).toBe(null)
    expect(titles(m)).toEqual([
      ['main', ['Summary', 'Core Skills', 'Experience', 'Projects', 'Education', 'Certifications & Permits', 'Languages', 'Interests', 'Open Source']],
    ])
  })

  it('reads the rail first in the sidebar layout and last in rail-right', () => {
    const rail = ['rail', ['Core Skills', 'Languages', 'Interests']]
    const main = ['main', ['Summary', 'Experience', 'Projects', 'Education', 'Certifications & Permits', 'Open Source']]
    expect(titles(buildModel(cv, { layout: 'sidebar' }))).toEqual([rail, main])
    expect(titles(buildModel(cv, { layout: 'rail-right' }))).toEqual([main, rail])
  })

  it('lets a section opt in or out of the rail', () => {
    const m = buildModel(
      {
        sections: [
          { type: 'text', title: 'A', rail: true },
          { type: 'list', title: 'B', rail: false },
        ],
      },
      { layout: 'sidebar' },
    )
    expect(titles(m)).toEqual([
      ['rail', ['A']],
      ['main', ['B']],
    ])
  })

  it('carries the paths the preview stamps as data-src', () => {
    const m = buildModel(cv, { layout: 'single' })
    expect(m.header.name.src).toBe('header.name')
    expect(m.header.contact?.items[1].src).toBe('header.contact.1')
    const exp = m.columns[0].sections[2]
    expect(exp.src).toBe('sections.2')
    const job = /** @type {import('./model.js').Div} */ (exp.body[0])
    expect(job.src).toBe('sections.2.items.0')
    const bullets = /** @type {import('./model.js').List} */ (job.body.find((b) => b.kind === 'L'))
    expect(bullets.items[1].src).toBe('sections.2.items.0.bullets.1')
  })

  it('makes an entry a heading with its dates beside it, then bullets and the stack', () => {
    const job = /** @type {import('./model.js').Div} */ (buildModel(cv).columns[0].sections[2].body[0])
    expect(job.keep).toBe(true)
    expect(job.body.map((b) => b.kind)).toEqual(['Row', 'P', 'L', 'P'])
    const head = /** @type {import('./model.js').Row} */ (job.body[0])
    expect(head.main.kind).toBe('H3')
    expect(head.main.spans.map((s) => textOf(s.runs)).join('')).toBe('Senior Full-Stack Engineer | Acme Corp')
    expect(textOf(/** @type {import('./model.js').Text} */ (head.aside).spans[0].runs)).toBe('03/2020 – Present')
    const stack = /** @type {import('./model.js').Text} */ (job.body[3])
    expect(stack.spans.map((s) => textOf(s.runs)).join('')).toBe('STACK · React · Node.js · TypeScript · PostgreSQL · Docker · AWS')
  })

  it('sets skills two-up in the main column and one-up in the rail', () => {
    const grid = (/** @type {string} */ layout) => {
      const m = buildModel(cv, { layout })
      const sec = m.columns.flatMap((c) => c.sections).find((s) => s.type === 'groups')
      const div = /** @type {import('./model.js').Div | undefined} */ (sec?.body[0])
      return div?.cols
    }
    expect(grid('single')).toBe(2)
    expect(grid('sidebar')).toBe(1)
  })

  it('reports an unknown section type rather than dropping it', () => {
    const m = buildModel({ sections: [{ type: 'nope', title: 'X' }] })
    const p = /** @type {import('./model.js').Text} */ (m.columns[0].sections[0].body[0])
    expect(textOf(p.spans[0].runs)).toBe('Unknown section type: nope')
  })

  it('survives a document that is still being typed', () => {
    expect(() => buildModel(null)).not.toThrow()
    expect(() => buildModel({ header: 'oops', sections: [null, { type: 'groups', blocks: 'x' }, { type: 'entries', items: [null] }] })).not.toThrow()
  })

  it('turns block variants into what the renderers draw', () => {
    const m = buildModel(cv, {
      layout: 'single',
      variants: { header: 'banner', sectionHead: 'numbered', entry: 'timeline', skills: 'chips', stack: 'chips', languages: 'dots', certifications: 'grid' },
    })
    expect(m.header.style).toBe('banner')
    expect(m.header.name.align).toBe('center')
    expect(m.header.contact?.display).toBe('inline')
    const secs = m.columns[0].sections
    expect(secs.map((s) => s.number)).toEqual(secs.map((_, i) => i + 1))
    expect(secs[0].head).toBe('numbered')

    const job = /** @type {import('./model.js').Div} */ (secs[2].body[0])
    expect(job.frame).toBe('timeline')
    const stack = /** @type {import('./model.js').List} */ (job.body.at(-1))
    expect(stack.display).toBe('chips')
    expect(stack.items.find((i) => i.icon)?.icon?.length).toBeGreaterThan(0)

    const langs = /** @type {import('./model.js').List} */ (secs.find((s) => s.type === 'levels')?.body[0])
    const native = /** @type {import('./model.js').Row} */ (langs.items[0].body[0])
    expect(native.aside).toMatchObject({ kind: 'Meter', value: 5, style: 'dots', alt: 'Native: 5 of 5' })

    const certs = /** @type {import('./model.js').List} */ (secs.find((s) => s.type === 'records')?.body[0])
    expect(certs.cols).toBe(2)
    expect(certs.items[0].frame).toBe('rule')
  })

  it('falls back to the default variant for an id it doesn\'t know', () => {
    const m = buildModel(cv, { variants: { entry: 'nope' } })
    const job = /** @type {import('./model.js').Div} */ (m.columns[0].sections[2].body[0])
    expect(job.frame).toBeUndefined()
  })
})

describe('dates', () => {
  /** @param {string} style */
  const dates = (style) => {
    const job = /** @type {import('./model.js').Div} */ (buildModel(cv, { variants: { dates: style } }).columns[0].sections[2].body[0])
    const head = /** @type {import('./model.js').Row} */ (job.body[0])
    return /** @type {import('./model.js').Text} */ (head.aside).spans[0]
  }

  it('prints each end in the chosen style, and knows what it says', () => {
    expect(textOf(dates('as-written').runs)).toBe('03/2020 – Present')
    expect(textOf(dates('short').runs)).toBe('Mar 2020 – Present')
    expect(textOf(dates('long').runs)).toBe('March 2020 – Present')
    expect(textOf(dates('iso').runs)).toBe('2020-03 – Present')
    expect(dates('short').actual).toBe('March 2020 to Present')
    expect(dates('short').runs.map((r) => r.datetime)).toEqual(['2020-03', undefined, undefined])
  })

  it('prints a value it can’t read as typed, claiming nothing', () => {
    const m = buildModel({ sections: [{ type: 'records', items: [{ name: 'X', dates: 'Summer 2019' }] }] }, { variants: { dates: 'long' } })
    const list = /** @type {import('./model.js').List} */ (m.columns[0].sections[0].body[0])
    const row = /** @type {import('./model.js').Row} */ (list.items[0].body[0])
    const span = /** @type {import('./model.js').Text} */ (row.aside).spans[0]
    expect(textOf(span.runs)).toBe('Summer 2019')
    expect(span.actual).toBeUndefined()
  })

  it('takes the language from the header, and English otherwise', () => {
    expect(buildModel({ header: { lang: 'de-CH' } }).lang).toBe('de-CH')
    expect(buildModel({ header: { lang: 'not a tag' } }).lang).toBe('en')
  })
})

describe('levelRating', () => {
  it('reads a level as words, letters or a number', () => {
    expect(levelRating({ level: 'Native' })).toBe(5)
    expect(levelRating({ level: 'C1 — professional' })).toBe(4)
    expect(levelRating({ level: 'B2 · professional working' })).toBe(3)
    expect(levelRating({ level: 'A2' })).toBe(1)
    expect(levelRating({ rating: 4.4 })).toBe(4)
    expect(levelRating({ level: 'some' })).toBe(0)
  })
})
