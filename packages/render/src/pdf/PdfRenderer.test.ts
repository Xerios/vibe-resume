import { beforeAll, describe, expect, it } from 'vitest'
import { docMeta } from '../doc-meta'
import { parseWith } from '@vibe-resume/core/format'
import { markdown } from '@vibe-resume/format-markdown'
import { FACES } from '../theme/typefaces'
import { PdfRenderer } from './PdfRenderer'
import { readSource } from './source'
import PLAIN from './fixtures/plain.json'
import STYLED from './fixtures/styled.json'

/*
 * The fixtures are the default CV's preview, laid out and paginated by the
 * browser and read by measure.js — exactly what an export hands the renderer.
 * Plain is the default look with page view on; styled is banner, numbered
 * titles, timeline entries, logo chips, dot meters, certificate cards and short
 * dates, in the serif font. Regenerate them from the browser when the sheet's markup or
 * stylesheet changes what measure.js reads.
 */

/** Every bundled face, inlined by Vite as data URLs. */
const INLINE = /** @type {Record<string, string>} */ (
  import.meta.glob('/node_modules/@expo-google-fonts/{inter,jetbrains-mono,source-serif-4}/*/*.ttf', { query: '?inline', import: 'default', eager: true })
)

const fromDataUrl = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c: string) => c.charCodeAt(0))

/** The faces the fixtures use, by FACES id. */
const FONTS = Object.fromEntries(
  FACES.flatMap((f: any) => {
    const file = f.url.split('/').pop()?.split('?')[0]
    const hit = Object.entries(INLINE).find(([path]: [string, unknown]) => file && path.endsWith(file))
    return hit ? [[f.id, fromDataUrl(hit[1] as string)]] : []
  }),
)

const cv = parseWith(markdown, markdown.template).cv

/**
 * Render a fixture, uncompressed so the test can read it.
 */
async function render(list: any, font: string) {
  const pdf = await new PdfRenderer({ fonts: FONTS, compress: false }).render(list, {
    meta: docMeta(cv),
    font,
    paper: { size: 'a4', orientation: 'portrait', header: 'name', footer: 'page' },
    attachments: [{ name: 'cv.md', mime: 'text/markdown', description: 'Source', data: new TextEncoder().encode(markdown.template) }],
    now: new Date('2026-01-01T00:00:00Z'),
  })
  return read(pdf)
}

/* ── A reader for exactly what pdfkit writes uncompressed ─────────────────── */

/** An indirect reference's object number, by key. */
const ref = (body: string, key: string) => Number(new RegExp(`/${key} (\\d+) 0 R`).exec(body)?.[1])

/** UTF-16BE hex as text. */
const hex = (h: string) => String.fromCharCode(...(h.match(/.{4}/g) ?? []).map((c: string) => parseInt(c, 16)))

function read(data: Uint8Array) {
  let s = ''
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000))

  const objs = new Map<number, string>()
  for (const m of s.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) objs.set(Number(m[1]), m[2])
  const obj = (n: number) => objs.get(n) ?? ''
  const stream = (n: number) => {
    const b = obj(n)
    return b.slice(b.indexOf('stream\n') + 7, b.lastIndexOf('\nendstream'))
  }

  /** A ToUnicode CMap as glyph id → text. */
  const cmap = (n: number) => {
    const map = new Map<number, string>()
    for (const m of stream(n).matchAll(/<([0-9a-f]+)> <([0-9a-f]+)> \[([^\]]*)\]/gi)) {
      const start = parseInt(m[1], 16)
      // An entry can hold several code units — a ligature is two letters — which
      // pdfkit writes with spaces between them.
      ;[...m[3].matchAll(/<([0-9a-f\s]*)>/gi)].forEach((u: any, i: number) => map.set(start + i, hex(u[1].replace(/\s/g, ''))))
    }
    return map
  }

  const catalog = obj(ref(s.slice(s.lastIndexOf('trailer')), 'Root'))
  const pageRefs = [...obj(ref(catalog, 'Pages')).matchAll(/(\d+) 0 R/g)].map((m: any) => Number(m[1]))

  /** Text by `page:mcid`, and artifact text, in stream order. */
  const marked = new Map<string, string>()
  const artifacts: string[] = []
  const bdc: { tag: string; mcid: number | null }[] = []

  pageRefs.forEach((pageRef: number, page: number) => {
    const pageDict = obj(pageRef)
    const resources = /\/Resources (\d+) 0 R/.test(pageDict) ? obj(ref(pageDict, 'Resources')) : pageDict
    const fontMaps = new Map<string, Map<number, string>>()
    for (const m of (/\/Font <<([\s\S]*?)>>/.exec(resources)?.[1] ?? '').matchAll(/\/(\w+) (\d+) 0 R/g)) {
      fontMaps.set(m[1], cmap(ref(obj(Number(m[2])), 'ToUnicode')))
    }

    const stack: { tag: string; mcid: number | null }[] = []
    let font: Map<number, string> | undefined
    const content = stream(ref(pageDict, 'Contents'))
    for (const m of content.matchAll(/\/(\w+) <<([^>]*)>> BDC|\/(\w+) BMC|\bEMC\b|\/(\w+) [\d.]+ Tf|\[([^\]]*)\] TJ/g)) {
      if (m[1] || m[3]) {
        const mcid = m[2] ? Number(/\/MCID (\d+)/.exec(m[2])?.[1] ?? NaN) : NaN
        const mark = { tag: m[1] ?? m[3], mcid: Number.isNaN(mcid) ? null : mcid }
        stack.push(mark)
        bdc.push(mark)
      } else if (m[0] === 'EMC') stack.pop()
      else if (m[4]) font = fontMaps.get(m[4])
      else if (m[5] !== undefined) {
        const text = [...m[5].matchAll(/<([0-9a-f]+)>/gi)]
          .flatMap((h: any) => (h[1].match(/.{4}/g) ?? []).map((g: string) => font?.get(parseInt(g, 16)) ?? '?'))
          .join('')
        const top = stack[stack.length - 1]
        if (!top || top.tag === 'Artifact') artifacts.push(text)
        else {
          const key = `${page}:${top.mcid}`
          marked.set(key, (marked.get(key) ?? '') + text)
        }
      }
    }
  })

  /** The structure tree, walked in order: element types, and the marked content each one holds. */
  const pageIndex = new Map(pageRefs.map((r: number, i: number) => [r, i]))
  const types: string[] = []
  const leaves: { page: number; mcid: number }[] = []
  const walk = (n: number, inherited?: number): void => {
    const el = obj(n)
    const type = /\/S \/(\w+)/.exec(el)?.[1] ?? '?'
    types.push(type)
    const pg = /\/Pg (\d+) 0 R/.exec(el)
    const page = pg ? (pageIndex.get(Number(pg[1])) ?? -1) : (inherited ?? -1)
    const k = /\/K \[([\s\S]*)\]/.exec(el)?.[1] ?? ''
    for (const m of k.matchAll(/<<([\s\S]*?)>>|(\d+) 0 R|(\d+)/g)) {
      if (m[1]) {
        const mcid = /\/MCID (\d+)/.exec(m[1])
        if (mcid) leaves.push({ page: pageIndex.get(ref(m[1], 'Pg')) ?? -1, mcid: Number(mcid[1]) })
      } else if (m[2]) walk(Number(m[2]), page)
      else leaves.push({ page, mcid: Number(m[3]) })
    }
  }
  const root = obj(ref(catalog, 'StructTreeRoot'))
  for (const m of (/\/K \[([^\]]*)\]/.exec(root)?.[1] ?? '').matchAll(/(\d+) 0 R/g)) walk(Number(m[1]))

  const tagged = leaves.map((l: any) => marked.get(`${l.page}:${l.mcid}`) ?? '').join('\n')
  return { s, catalog, pages: pageRefs.length, bdc, types, leaves, tagged, artifacts }
}

/* ── The tests ───────────────────────────────────────────────────────────── */

describe('PdfRenderer', () => {
  const pdf: Record<string, any> = {}
  beforeAll(async () => {
    const [plain, styled] = await Promise.all([render(/** @type {any} */ (PLAIN), 'sans'), render(/** @type {any} */ (STYLED), 'serif')])
    pdf.plain = plain
    pdf.styled = styled
  })

  it('is a tagged PDF 1.7 that declares PDF/UA-1', () => {
    const { s, catalog } = pdf.plain
    expect(s.startsWith('%PDF-1.7')).toBe(true)
    expect(catalog).toMatch(/\/StructTreeRoot \d+ 0 R/)
    expect(catalog).toMatch(/\/Lang \(en\)/)
    expect(s).toMatch(/\/Marked true/)
    expect(s).toMatch(/\/DisplayDocTitle true/)
    expect(s).toMatch(/<pdfuaid:part>1<\/pdfuaid:part>/)
    // The XMP is UTF-8 and the reader decodes bytes as Latin-1, so the dash isn't matched.
    expect(s).toMatch(/<dc:title>[\s\S]*John Doe/)
  })

  it('embeds every font it uses, with a Unicode map, and never a standard-14 one', () => {
    for (const { s } of Object.values(pdf)) {
      expect(s).not.toMatch(/\/BaseFont \/(Helvetica|Times|Courier|Symbol|ZapfDingbats)/)
      const count = [...s.matchAll(/\/Subtype \/Type0/g)].length
      expect(count).toBeGreaterThan(0)
      expect([...s.matchAll(/\/FontFile2 \d+ 0 R/g)].length).toBe(count)
      expect([...s.matchAll(/\/ToUnicode \d+ 0 R/g)].length).toBe(count)
      // A CIDSet would have to list every glyph in the subset, composite parts
      // included (PDF/UA-1 7.21.4.2); there is none to get wrong.
      expect(s).not.toMatch(/\/CIDSet/)
    }
    expect(pdf.styled.s).toMatch(/\/BaseFont \/[A-Z]{6}\+SourceSerif4/)
  })

  it('marks every piece of content as either structure or an artifact', () => {
    for (const { bdc } of Object.values(pdf)) {
      expect(bdc.length).toBeGreaterThan(0)
      for (const mark of bdc) expect(mark.tag === 'Artifact' || mark.mcid !== null).toBe(true)
    }
  })

  it('writes each page in the order its structure is read', () => {
    for (const { leaves, pages } of Object.values(pdf)) {
      for (let page = 0; page < pages; page++) {
        const mcids = leaves.filter((l: any) => l.page === page).map((l: any) => l.mcid)
        expect(mcids).toEqual(mcids.toSorted((a: number, b: number) => a - b))
      }
    }
  })

  it('reads the sections in the order they are written, one column top to bottom', () => {
    for (const name of Object.keys(pdf)) {
      const order = ['SUMMARY', 'CORE SKILLS', 'EXPERIENCE', 'LANGUAGES', 'OPEN SOURCE'].map((t: string) => pdf[name].tagged.indexOf(t))
      expect(order.every((i: number) => i >= 0)).toBe(true)
      expect(order).toEqual(order.toSorted((x: number, y: number) => x - y))
    }
  })

  it('sets an entry as who and what, then when and where, each on a line of its own', () => {
    const { tagged } = pdf.plain
    expect(tagged).toMatch(/^Acme Corp — Senior Full-Stack Engineer$/m)
    // The dates are a span of their own (they carry ActualText), so they come out a leaf apart.
    const at = ['Acme Corp — Senior Full-Stack Engineer', '03/2020', ' · B2B SaaS platform — Springfield (remote)', 'Led the development'].map((t) =>
      tagged.indexOf(t),
    )
    expect(at.every((i: number) => i >= 0)).toBe(true)
    expect(at).toEqual(at.toSorted((x: number, y: number) => x - y))
    expect(tagged).toMatch(/^Stack: React, Node\.js, TypeScript, PostgreSQL, Docker, AWS$/m)
  })

  it('starts with the header and keeps text as Unicode, spaces included', () => {
    const { tagged } = pdf.plain
    expect(tagged.startsWith('John Doe\nSenior Full-Stack Engineer · 10+ years\nSpringfield, USA')).toBe(true)
    expect(tagged).toContain('Springfield (remote)')
    expect(tagged).toContain('Databases & Data')
    expect(tagged).toContain('★ 120')
  })

  it('keeps decoration out of the text', () => {
    const { tagged, artifacts } = pdf.plain
    expect(artifacts.join(' ')).toMatch(/1 \/ 3/)
    expect(tagged).not.toMatch(/\d \/ \d$/m)
    // The section numbers and the separators between chips are drawn, not read.
    expect(pdf.styled.tagged).not.toMatch(/^0\d$/m)
  })

  it('nests headings, lists, links and figures as PDF/UA asks', () => {
    const { types, s } = pdf.plain
    expect(types[0]).toBe('Document')
    expect(types.indexOf('H1')).toBeLessThan(types.indexOf('H2'))
    expect(types.indexOf('H2')).toBeLessThan(types.indexOf('H3'))
    for (const [i, t] of types.entries()) if (t === 'LI') expect(types[i + 1]).toBe('LBody')
    expect(types).toContain('Link')
    const annots = [...s.matchAll(/\d+ 0 obj\n(<<[\s\S]*?\n>>)\nendobj/g)].map((m: any) => m[1]).filter((d: string) => d.includes('/Subtype /Link'))
    expect(annots.length).toBeGreaterThan(0)
    for (const a of annots) {
      expect(a).toMatch(/\/StructParent \d+/)
      expect(a).toMatch(/\/Contents \(/)
    }
    // A language meter is a figure that says what it shows.
    expect(pdf.styled.types).toContain('Figure')
    expect(pdf.styled.s).toMatch(/\/S \/Figure[\s\S]{0,200}\/Alt \(Native: 5 of 5\)/)
  })

  it('says what each date range means, however it is printed', () => {
    const { s, tagged } = pdf.styled
    // The styled fixture prints its dates as `Mar 2020 – Present`.
    expect(s).toMatch(/\/S \/Span[\s\S]{0,120}\/ActualText \(March 2020 to Present\)/)
    expect(s).toMatch(/\/Span <<[^>]*\/ActualText \(June 2016 to February 2020\)/)
    expect(tagged).toContain('Mar 2020 – Present')
  })

  it('titles sections, marks lists and bookmarks the sections', () => {
    const { s, catalog } = pdf.plain
    expect(s).toMatch(/\/S \/Sect[\s\S]{0,80}\/T \(Experience\)/)
    expect(s).toMatch(/\/O \/List\s*\/ListNumbering \/Disc/)
    expect(catalog).toMatch(/\/Outlines \d+ 0 R/)
    expect(catalog).toMatch(/\/PageMode \/UseOutlines/)
    expect(s).toMatch(/\/Title \(Core Skills\)/)
    expect(s).toMatch(/<dc:language><rdf:Bag><rdf:li>en<\/rdf:li>/)
  })

  it('attaches the source', () => {
    const { s, catalog } = pdf.plain
    expect(catalog).toMatch(/\/AF \[/)
    expect(s).toMatch(/\/Type \/Filespec[\s\S]*?\/AFRelationship \/Source/)
    expect(s).toMatch(/\/UF \(cv\.md\)/)
  })

  it('gives the source back, compressed or not', async () => {
    const text = '# Zoë Ångström\n\nCafé — naïve 🙂\n'
    const sources = await Promise.all(
      [false, true].map(async (compress) => {
        const bytes = await new PdfRenderer({ fonts: FONTS, compress }).render(PLAIN as any, {
          meta: docMeta(cv),
          font: 'sans',
          attachments: [{ name: 'cv.md', mime: 'text/markdown', description: 'Source', data: new TextEncoder().encode(text) }],
        })
        return readSource(bytes)
      }),
    )
    expect(sources).toEqual([{ mime: 'text/markdown', text }, { mime: 'text/markdown', text }])
  })

  it('has no source to give back from a PDF without one', async () => {
    const bytes = await new PdfRenderer({ fonts: FONTS }).render(PLAIN as any, { meta: docMeta(cv), font: 'sans' })
    expect(await readSource(bytes)).toBeNull()
    expect(await readSource(new TextEncoder().encode('# not a pdf'))).toBeNull()
  })
})
