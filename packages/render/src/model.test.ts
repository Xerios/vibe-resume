import { describe, expect, it } from 'vitest'
import { textOf } from './inline.js'
import { buildModel, levelRating } from './model.js'
import { SLOTS } from './variants'
import { parseWith } from '@vibe-resume/core/format'
import { yaml } from '@vibe-resume/format-yaml'

const cv = parseWith(yaml, yaml.template).cv

const line = (b: import('./model').Block) => (b as import('./model').Text).spans.map((s: import('./model').Span) => textOf(s.runs)).join('')

const titles = (m: import('./model').Model) => m.sections.map((s: import('./model').Section) => s.title && textOf(s.title.spans[0].runs))

describe('buildModel', () => {
  it('keeps every section, in source order, in one column', () => {
    expect(titles(buildModel(cv))).toEqual([
      'Summary',
      'Core Skills',
      'Experience',
      'Projects',
      'Education',
      'Certifications & Permits',
      'Languages',
      'Interests',
      'Open Source',
    ])
  })

  it('ignores a `rail:` left over from the two-column layouts', () => {
    const m = buildModel({
      sections: [
        { type: 'text', title: 'A', rail: true },
        { type: 'list', title: 'B' },
      ],
    })
    expect(titles(m)).toEqual(['A', 'B'])
  })

  it('carries the paths the preview stamps as data-src', () => {
    const m = buildModel(cv)
    expect(m.header.name.src).toBe('header.name')
    expect(m.header.contact?.items[1].src).toBe('header.contact.1')
    const exp = m.sections[2]
    expect(exp.src).toBe('sections.2')
    const job = exp.body[0] as import('./model').Div
    expect(job.src).toBe('sections.2.items.0')
    const bullets = job.body.find((b: import('./model').Block) => b.kind === 'L') as import('./model').List
    expect(bullets.items[1].src).toBe('sections.2.items.0.bullets.1')
  })

  it('makes an entry a line of who and what, a line of when and where, then bullets and the stack', () => {
    const job = buildModel(cv).sections[2].body[0] as import('./model').Div
    expect(job.keep).toBe(true)
    expect(job.body.map((b: import('./model').Block) => b.kind)).toEqual(['H3', 'P', 'L', 'P'])
    expect(line(job.body[0])).toBe('Acme Corp — Senior Full-Stack Engineer')
    expect(line(job.body[1])).toBe('03/2020–Present · B2B SaaS platform — Springfield (remote)')
    expect(line(job.body[3])).toBe('Stack: React, Node.js, TypeScript, PostgreSQL, Docker, AWS')
  })

  it('sets nothing side by side', () => {
    const all = SLOTS.flatMap((slot) => slot.variants.map((v) => buildModel(cv, { variants: { [slot.id]: v.id } })))
    for (const m of all) expect(JSON.stringify(m)).not.toMatch(/"cols"|"gutter"/)
  })

  it('reports an unknown section type rather than dropping it', () => {
    const m = buildModel({ sections: [{ type: 'nope', title: 'X' }] })
    const p = m.sections[0].body[0] as import('./model').Text
    expect(textOf(p.spans[0].runs)).toBe('Unknown section type: nope')
  })

  it('survives a document that is still being typed', () => {
    expect(() => buildModel(null)).not.toThrow()
    expect(() => buildModel({ header: 'oops', sections: [null, { type: 'groups', blocks: 'x' }, { type: 'entries', items: [null] }] })).not.toThrow()
  })

  it('turns block variants into what the renderers draw', () => {
    const m = buildModel(cv, {
      variants: { header: 'banner', sectionHead: 'numbered', entry: 'timeline', skills: 'chips', stack: 'chips', languages: 'dots', certifications: 'cards' },
    })
    expect(m.header.style).toBe('banner')
    expect(m.header.name.align).toBe('center')
    expect(m.header.contact?.display).toBe('inline')
    const secs = m.sections
    expect(secs.map((s) => s.number)).toEqual(secs.map((_, i) => i + 1))
    expect(secs[0].head).toBe('numbered')

    const job = secs[2].body[0] as import('./model').Div
    expect(job.frame).toBe('timeline')
    const stack = job.body.at(-1) as import('./model').List
    expect(stack.display).toBe('chips')
    expect(stack.items.find((i: import('./model').Item) => i.icon)?.icon?.length).toBeGreaterThan(0)

    const langs = secs.find((s) => s.type === 'levels')?.body[0] as import('./model').List
    const native = langs.items[0].body[0] as import('./model').Row
    expect(native.aside).toMatchObject({ kind: 'Meter', value: 5, style: 'dots', alt: 'Native: 5 of 5' })

    const certs = secs.find((s) => s.type === 'records')?.body[0] as import('./model').List
    expect(certs.items[0].frame).toBe('card')
  })

  it('lets entries break across pages unless kept whole, and cards always whole', () => {
    const job = (v: Record<string, string>) => buildModel(cv, { variants: v }).sections[2].body[0] as import('./model').Div
    expect(job({})).toMatchObject({ keep: true, split: true })
    expect(job({ breaks: 'whole' }).split).toBeUndefined()
    expect(job({ entry: 'card' }).split).toBeUndefined()
  })

  it("falls back to the default variant for an id it doesn't know", () => {
    const m = buildModel(cv, { variants: { entry: 'nope' } })
    const job = m.sections[2].body[0] as import('./model').Div
    expect(job.frame).toBeUndefined()
  })
})

describe('dates', () => {
  const dates = (style: string) => {
    const job = buildModel(cv, { variants: { dates: style } }).sections[2].body[0] as import('./model').Div
    return (job.body[1] as import('./model').Text).spans[0]
  }

  it('prints each end in the chosen style, and knows what it says', () => {
    expect(textOf(dates('as-written').runs)).toBe('03/2020–Present')
    expect(textOf(dates('short').runs)).toBe('Mar 2020 – Present')
    expect(textOf(dates('long').runs)).toBe('March 2020 – Present')
    expect(textOf(dates('iso').runs)).toBe('2020-03–Present')
    expect(textOf(dates('numeric').runs)).toBe('03/2020–Present')
    expect(dates('short').actual).toBe('March 2020 to Present')
    expect(dates('short').runs.map((r: import('./inline').Run) => r.datetime)).toEqual(['2020-03', undefined, undefined])
  })

  it("prints a value it can't read as typed, claiming nothing", () => {
    const m = buildModel({ sections: [{ type: 'records', items: [{ name: 'X', dates: 'Summer 2019' }] }] }, { variants: { dates: 'long' } })
    const list = m.sections[0].body[0] as import('./model').List
    const row = list.items[0].body[0] as import('./model').Row
    const span = (row.aside as import('./model').Text).spans[0]
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
