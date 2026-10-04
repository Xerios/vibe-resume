import { parseWith } from '@vibe-resume/core/format'
import { buildModel } from '@vibe-resume/render/model'
import { describe, expect, it } from 'vitest'
import { markdown } from './index'
import { read } from './read'

const parse = (text: string) => parseWith(markdown, text)

/** The line a piece of text first appears on, 1-based. */
const lineOf = (text: string, needle: string) => text.split('\n').findIndex((l) => l.includes(needle)) + 1

describe('the template', () => {
  it('reads without a single warning', () => {
    expect(read(markdown.template).diagnostics).toEqual([])
  })

  it('is written the way the writing guide asks', () => {
    expect(markdown.lint(markdown.template)).toEqual([])
  })
})

describe('section types', () => {
  const typeOf = (text: string) => parse(`# Jo\n\n${text}`).cv?.sections?.[0].type

  it('takes them from the title when the content fits', () => {
    expect(typeOf('## Languages\n\n- English — Native')).toBe('levels')
    expect(typeOf('## Certifications\n\n- CKA — CNCF — 2022')).toBe('records')
    expect(typeOf('## Skills\n\n### Core\n\n- TypeScript')).toBe('groups')
    expect(typeOf('## Open Source\n\n- [kit](https://x.dev) — ★ 12 — A kit')).toBe('table')
  })

  it('reads a skills list of `**Label:** …` items as a group per item', () => {
    const text = '# Jo\n\n## Skills\n\n- **Languages:** TypeScript, SQL\n- **Backend:** Node.js, Hono\n\n---\n'
    const { cv, lines } = parse(text)
    expect(cv?.sections?.[0]).toMatchObject({
      type: 'groups',
      blocks: [
        { title: 'Languages', rows: [{ text: 'TypeScript, SQL' }] },
        { title: 'Backend', rows: [{ text: 'Node.js, Hono' }] },
      ],
    })
    expect(lines?.get('sections.0.blocks.1.rows.0')).toBe(lineOf(text, 'Backend'))
    expect(typeOf('## Skills\n\n- **Languages:** TypeScript\n- Docker')).toBe('list')
  })

  it('keeps a list of projects under an open-source title a list', () => {
    expect(typeOf('## Projects & Open Source\n\n- **Kit** — A kit\n- More on GitHub')).toBe('list')
  })

  it('falls back to the shape when the title does not fit', () => {
    expect(typeOf('## Skills\n\n- TypeScript\n- Go')).toBe('list')
    expect(typeOf('## Work\n\n### Acme — Dev\n\n- Built it')).toBe('entries')
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
  const entry = (body: string) => parse(`# Jo\n\n## Work\n\n### Acme — Dev\n\n${body}`).cv?.sections?.[0].items[0]

  it('reads an entry written the way the template writes one', () => {
    const text = `# Jo

## Experience

### Digipolis — Freelance Backend API Developer (via Vivid Resourcing)
**2017.09–2017.12** · Antwerp

- Built the backend API for a microservice health-monitoring dashboard displaying real-time metrics
- Piloted the dashboard on several microservices during the testing phase

Stack: Node.js, Koa, Prometheus, Angular`
    expect(parse(text).cv?.sections?.[0]).toEqual({
      title: 'Experience',
      type: 'entries',
      items: [
        {
          org: 'Digipolis',
          title: 'Freelance Backend API Developer (via Vivid Resourcing)',
          dates: '2017.09–2017.12',
          sub: 'Antwerp',
          bullets: [
            'Built the backend API for a microservice health-monitoring dashboard displaying real-time metrics',
            'Piloted the dashboard on several microservices during the testing phase',
          ],
          stack: 'Node.js, Koa, Prometheus, Angular',
        },
      ],
    })
  })

  it('reads a heading without an organisation as a title alone', () => {
    expect(parse('# Jo\n\n## Projects\n\n### kit\n\n**2021**').cv?.sections?.[0].items[0]).toEqual({ title: 'kit', dates: '2021' })
  })

  it('reads plain dates and context written one under the other', () => {
    expect(entry('2020 – 2022\nMaking things')).toMatchObject({ title: 'Dev', org: 'Acme', dates: '2020 – 2022', sub: 'Making things' })
  })

  it('does not take a bold phrase later in an entry for its dates', () => {
    expect(entry('**2020** · Ghent\n**Key work:** the API')).toMatchObject({ dates: '2020', sub: 'Ghent', summary: ['**Key work:** the API'] })
  })

  it('reads the place first and the dates last, and the line under them as the description', () => {
    expect(entry('Brussels (remote) · **July 2019 – April 2025**\nReal-time analytics SaaS\nas a PWA')).toMatchObject({
      dates: 'July 2019 – April 2025',
      sub: 'Brussels (remote)',
      summary: ['Real-time analytics SaaS as a PWA'],
    })
    expect(entry('Brussels · 2019 – 2025')).toMatchObject({ dates: '2019 – 2025', sub: 'Brussels' })
    expect(entry('Brussels · **Remote**')).toMatchObject({ sub: 'Brussels · **Remote**' })
  })

  it('takes a stack line straight after the bullets as the stack, not as more bullet', () => {
    expect(entry('- Built it\nStack: Go, Rust')).toMatchObject({ bullets: ['Built it'], stack: 'Go, Rust' })
  })

  it('reads a methodologies line beside the stack', () => {
    expect(entry('- Built it\nStack: Go\n**Methodologies:** Scrum, TDD')).toMatchObject({ bullets: ['Built it'], stack: 'Go', methodologies: 'Scrum, TDD' })
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
    expect(lines.get('sections.2.items.1')).toBe(lineOf(text, '### Globex Inc'))
    expect(lines.get('sections.2.items.0.dates')).toBe(lineOf(text, '**03/2020–Present**'))
    expect(lines.get('sections.2.items.0.bullets.2')).toBe(lineOf(text, 'Mentor a team'))
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

describe('an entry’s own paragraph', () => {
  it('stays apart from the dates line above it', () => {
    const { cv } = parse('## Experience\n\n### Independent Projects\n**2025.04–present** · Brussels\n\nTEST\n\n- BULLET\n')
    const item = (cv as any).sections[0].items[0]
    expect(item.sub).toBe('Brussels')
    expect(item.summary).toEqual(['TEST'])
    expect(item.bullets).toEqual(['BULLET'])
  })
})
