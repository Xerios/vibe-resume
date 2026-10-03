import { parseWith } from '@vibe-resume/core/format'
import { yaml } from '@vibe-resume/format-yaml'
import { toJsonResume } from '@vibe-resume/render/json-resume'
import { buildModel } from '@vibe-resume/render/model'
import { LAYOUTS } from '@vibe-resume/render/tokens'
import { describe, expect, it } from 'vitest'
import { markdown } from './index'
import { read } from './read'

/** The model with its source paths taken out — the two formats put things on different lines. */
const withoutSrc = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, v) => (key === 'src' ? undefined : v)))

const parse = (text: string) => parseWith(markdown, text)

/** The line a piece of text first appears on, 1-based. */
const lineOf = (text: string, needle: string) => text.split('\n').findIndex((l) => l.includes(needle)) + 1

describe('the template', () => {
  const md = parse(markdown.template)
  const ym = parseWith(yaml, yaml.template)

  it('reads without a single warning', () => {
    expect(read(markdown.template).diagnostics).toEqual([])
  })

  it.each(LAYOUTS.map((l) => l.id))('lays out the same as the YAML template, in the %s layout', (layout) => {
    expect(withoutSrc(buildModel(md.cv, { layout }))).toEqual(withoutSrc(buildModel(ym.cv, { layout })))
  })

  it('says the same in JSON Resume', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(toJsonResume(md.cv, { now })).toEqual(toJsonResume(ym.cv, { now }))
  })
})

describe('section types', () => {
  const typeOf = (text: string) => parse(`# Jo\n\n${text}`).cv?.sections?.[0].type

  it('takes them from the title when the content fits', () => {
    expect(typeOf('## Languages\n\n- English — Native')).toBe('levels')
    expect(typeOf('## Certifications\n\n- CKA — CNCF — 2022')).toBe('records')
    expect(typeOf('## Skills\n\n### Core\n\n- TypeScript')).toBe('groups')
  })

  it('falls back to the shape when the title does not fit', () => {
    expect(typeOf('## Skills\n\n- TypeScript\n- Go')).toBe('list')
    expect(typeOf('## Work\n\n### Dev — Acme\n\n- Built it')).toBe('entries')
    expect(typeOf('## Notes\n\nSome prose.')).toBe('text')
  })

  it('takes a comment over both', () => {
    expect(typeOf('## Things\n<!-- type: levels -->\n\n- Go — fluent')).toBe('levels')
  })

  it('warns about a type that does not exist, and infers one instead', () => {
    const text = '# Jo\n\n## Things\n<!-- type: levles -->\n\n- Go'
    const { diagnostics } = read(text)
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].message).toMatch(/levles/)
    expect(text.slice(diagnostics[0].from, diagnostics[0].to)).toBe('levles')
    expect(parse(text).cv?.sections?.[0].type).toBe('list')
  })

  it('warns about a key a comment cannot set there', () => {
    const { diagnostics } = read('# Jo\n\n## Things\n<!-- colour: red -->\n\n- Go')
    expect(diagnostics.map((d) => d.message)).toEqual([expect.stringMatching(/colour/)])
  })
})

describe('entries', () => {
  const entry = (body: string) => parse(`# Jo\n\n## Work\n\n### Dev — Acme\n\n${body}`).cv?.sections?.[0].items[0]

  it('reads dates and context written one under the other', () => {
    expect(entry('2020 – 2022\nMaking things')).toMatchObject({ title: 'Dev', org: 'Acme', dates: '2020 – 2022', sub: 'Making things' })
  })

  it('takes a stack line straight after the bullets as the stack, not as more bullet', () => {
    expect(entry('- Built it\nStack: Go, Rust')).toMatchObject({ bullets: ['Built it'], stack: 'Go, Rust' })
  })

  it('carries an indented line on as part of its bullet', () => {
    expect(entry('- Built it\n  over a weekend')).toMatchObject({ bullets: ['Built it over a weekend'] })
  })

  it('reads an earlier-roles entry as a list of items', () => {
    const text = '# Jo\n\n## Work\n\n### Earlier\n<!-- subtype: earlier -->\n\n- **A** — one\n- **B** — two'
    expect(parse(text).cv?.sections?.[0].items[0]).toEqual({ title: 'Earlier', subtype: 'earlier', items: ['**A** — one', '**B** — two'] })
  })
})

describe('the line map', () => {
  const text = markdown.template
  const { lines } = read(text)

  it('puts the header, a section, an entry and a bullet on their own lines', () => {
    expect(lines.get('header.name')).toBe(1)
    expect(lines.get('header.contact.2')).toBe(lineOf(text, 'john.doe@example.com'))
    expect(lines.get('sections.2')).toBe(lineOf(text, '## Experience'))
    expect(lines.get('sections.2.items.1')).toBe(lineOf(text, '### Full-Stack Developer'))
    expect(lines.get('sections.2.items.0.dates')).toBe(lineOf(text, '03/2020 – Present'))
    expect(lines.get('sections.2.items.0.bullets.2')).toBe(lineOf(text, 'Mentored a team'))
    expect(lines.get('sections.1.blocks.0.rows.0')).toBe(lineOf(text, '**Expert:**'))
  })

  it('has a line for every path the model hands the preview', () => {
    const paths = new Set<string>()
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk)
      else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (k === 'src' && typeof v === 'string') paths.add(v)
          else walk(v)
        }
      }
    }
    walk(buildModel(parse(text).cv))
    // A path with no line of its own falls back to its nearest ancestor that has one.
    const lineFor = (path: string): number | undefined => {
      for (let p = path; p; p = p.includes('.') ? p.slice(0, p.lastIndexOf('.')) : '') if (lines.has(p)) return lines.get(p)
      return undefined
    }
    for (const path of paths) expect(lineFor(path), path).toBeGreaterThan(0)
  })
})

describe('what is not a CV', () => {
  it('reads an empty document as nothing', () => {
    expect(parse('').error).toBe('Document is empty')
  })

  it('warns about text before the first heading', () => {
    expect(read('Hello\n\n# Jo').diagnostics.map((d) => d.message)).toEqual([expect.stringMatching(/before the first heading/)])
  })
})
