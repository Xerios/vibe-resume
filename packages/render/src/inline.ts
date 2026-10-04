/**
 * The inline Markdown in a CV value, as runs of styled text, plus the small
 * defensive readers every renderer needs.
 *
 * Both renderers draw runs rather than HTML. The preview turns a run into
 * `<strong>`/`<em>`/`<code>`/`<a>` elements, and the PDF turns it into a font
 * switch and a link annotation. Either way the source is marked's own inline
 * lexer, so what counts as emphasis or a link is exactly what it always was.
 * Raw HTML in a value is reduced to its text, since neither side can draw
 * arbitrary markup.
 */

import { Lexer } from 'marked'
import { displayUrl, phoneNumber } from '@vibe-resume/core/autolink'

/** A styled text run: text with optional formatting marks (bold, italic, code, link, etc.). */
export interface Run {
  text: string
  strong?: boolean
  em?: boolean
  code?: boolean
  del?: boolean
  href?: string
  /** a date, as ISO 8601, when the run is one end of a `dates` value */
  datetime?: string
}

/** Marks without the text. */
export type Marks = Omit<Run, 'text'>

/**
 * A list, whatever the source actually said. A half-typed document is the normal
 * case here, so every renderer reads lists through this rather than trusting
 * the shape.
 */
export const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/**
 * A stack line as the list of things in it: `React, Node.js, PostgreSQL` and
 * a list of the same three both come back as three entries. A slash
 * isn't a separator, because `TypeScript/JS` and `CI/CD` are single entries.
 */
export function techs(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  if (!value) return []
  return String(value)
    .split(/[,;·•]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** marked leaves entities in text as written; the page used to decode them, so this does. */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })

function walk(tokens: any[], marks: Marks, out: Run[]): void {
  for (const t of tokens) {
    switch (t.type) {
      case 'strong':
        walk(t.tokens ?? [], { ...marks, strong: true }, out)
        break
      case 'em':
        walk(t.tokens ?? [], { ...marks, em: true }, out)
        break
      case 'del':
        walk(t.tokens ?? [], { ...marks, del: true }, out)
        break
      case 'codespan':
        push(out, decode(t.text), { ...marks, code: true })
        break
      case 'link':
        // A bare address prints without its scheme; a link with a label of its
        // own is left as written.
        if (t.autolink) push(out, displayUrl(t.text), { ...marks, href: t.href })
        else walk(t.tokens ?? [], { ...marks, href: t.href }, out)
        break
      case 'image':
        push(out, decode(t.text ?? ''), marks)
        break
      case 'br':
        push(out, ' ', marks)
        break
      case 'html':
        // A tag is dropped; whatever it wrapped arrives as the tokens around it.
        break
      default:
        if (t.tokens) walk(t.tokens, marks, out)
        else push(out, decode(String(t.text ?? '')), marks)
    }
  }
}

function push(out: Run[], text: string, marks: Marks): void {
  if (!text) return
  const last = out[out.length - 1]
  if (last && same(last, marks)) last.text += text
  else out.push({ text, ...marks })
}

const same = (a: Run, b: Marks): boolean => !!a.strong === !!b.strong && !!a.em === !!b.em && !!a.code === !!b.code && !!a.del === !!b.del && a.href === b.href

export function runs(text: unknown): Run[] {
  if (text == null || text === '' || typeof text === 'object') return []
  const out: Run[] = []
  walk(Lexer.lexInline(String(text).trim(), { gfm: true }), {}, out)
  return out
}

export function contactRuns(line: unknown): Run[] {
  const text = String(line ?? '')
  const tel = phoneNumber(text)
  return runs(tel ? `${tel.lead}[${tel.number}](${tel.href})` : text)
}

export const textOf = (rs: Run[]): string => rs.map((r) => r.text).join('')
