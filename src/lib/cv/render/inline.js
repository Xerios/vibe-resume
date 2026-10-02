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
import { displayUrl, phoneNumber } from '../format/autolink.js'

/**
 * @typedef {object} Run
 * @property {string} text
 * @property {boolean} [strong]
 * @property {boolean} [em]
 * @property {boolean} [code]
 * @property {boolean} [del]
 * @property {string} [href]
 */

/** @typedef {Omit<Run, 'text'>} Marks */

/**
 * A list, whatever the YAML actually said. A half-typed document is the normal
 * case here, so every renderer reads lists through this rather than trusting
 * the shape.
 * @param {unknown} v
 * @returns {any[]}
 */
export const list = (v) => (Array.isArray(v) ? v : [])

/**
 * A stack line as the list of things in it: `React, Node.js, PostgreSQL` and
 * the YAML list of the same three both come back as three entries. A slash
 * isn't a separator, because `TypeScript/JS` and `CI/CD` are single entries.
 * @param {unknown} value
 * @returns {string[]}
 */
export function techs(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  if (!value) return []
  return String(value)
    .split(/[,;·•]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** marked leaves entities in text as written; the page used to decode them, so this does. */
/** @type {Record<string, string>} */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** @param {string} s */
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })

/**
 * @param {any[]} tokens
 * @param {Marks} marks
 * @param {Run[]} out
 */
function walk(tokens, marks, out) {
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

/**
 * Add a run, merging it into the one before when nothing about the marks
 * differs, so that `a & b` stays one run rather than three.
 * @param {Run[]} out
 * @param {string} text
 * @param {Marks} marks
 */
function push(out, text, marks) {
  if (!text) return
  const last = out[out.length - 1]
  if (last && same(last, marks)) last.text += text
  else out.push({ text, ...marks })
}

/** @param {Run} a @param {Marks} b */
const same = (a, b) => !!a.strong === !!b.strong && !!a.em === !!b.em && !!a.code === !!b.code && !!a.del === !!b.del && a.href === b.href

/**
 * Inline Markdown → runs. Empty, null or not-a-string-yet values come back as
 * no runs at all.
 * @param {unknown} text
 * @returns {Run[]}
 */
export function runs(text) {
  if (text == null || text === '' || typeof text === 'object') return []
  /** @type {Run[]} */
  const out = []
  walk(Lexer.lexInline(String(text).trim(), { gfm: true }), {}, out)
  return out
}

/**
 * One line of the header's contact block. The same as `runs`, except that a
 * line holding a phone number gets the number as a `tel:` link, which is what
 * makes it something a reader or a parser can be sure of. Which lines count as
 * a number is `phoneNumber`'s call.
 * @param {unknown} line
 * @returns {Run[]}
 */
export function contactRuns(line) {
  const text = String(line ?? '')
  const tel = phoneNumber(text)
  return runs(tel ? `${tel.lead}[${tel.number}](${tel.href})` : text)
}

/** The text a set of runs reads as. @param {Run[]} rs */
export const textOf = (rs) => rs.map((r) => r.text).join('')
