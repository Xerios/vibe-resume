/**
 * The document as real YAML, for when it leaves the app.
 *
 * The editor's dialect (relaxed-yaml.js) lets a value run verbatim to the end
 * of its line, so `- [site](https://x.dev)` and `text: ORM: Prisma` are fine
 * there and broken anywhere else. Exporting rewrites the source line by line
 * rather than re-emitting the tree, so comments, blank lines and the writer's
 * layout all survive — only the scalars change, and only the ones a standard
 * parser would misread get quoted.
 *
 * What a standard parser would misread, conservatively — YAML 1.1 readers are
 * still common, so its wider booleans and number forms count too:
 *   - an indicator character at the start (`[`, `*`, `-`, `>`, `'`, …)
 *   - `: ` or ` #` anywhere inside
 *   - a word YAML reads as a boolean or null (`yes`, `off`, `~`, …)
 *   - anything that would come back a number or a date, except a plain
 *     decimal — the app coerces those itself, so `md: 6` stays as written
 *
 * The rest of the dialect maps across directly: a `|` or `>` block is copied
 * as-is with strip chomping (the dialect never keeps a trailing newline), and a
 * paragraph folded over several bare lines becomes one quoted line, which is
 * what the dialect read it as anyway.
 */

import { readScalar, splitLine } from './relaxed-yaml.js'

const RESERVED = /^(?:~|null|true|false|yes|no|on|off|y|n)$/i
const NUMBERISH =
  /^[-+]?(?:[\d_]+(?:\.[\d_]*)?(?:e[-+]?\d+)?|\.[\d_]+(?:e[-+]?\d+)?|0x[\da-f_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?::[0-5]?\d)+(?:\.[\d_]*)?|\.inf|\.nan)$/i
const DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
const TIMESTAMP = /^\d{4}-\d\d?-\d\d?(?:[Tt\s]|$)/
const BLOCK = /^([|>])[-+]?$/

/**
 * Whether a string reads back as itself when written bare in block context.
 * @param {string} s
 */
function plainSafe(s) {
  if (s === '' || s !== s.trim()) return false
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return false
  if (/:(?:\s|$)|\s#/.test(s)) return false
  if (RESERVED.test(s) || TIMESTAMP.test(s)) return false
  return !NUMBERISH.test(s) || DECIMAL.test(s)
}

/**
 * A value, written so a standard parser reads it back the same.
 * @param {string | boolean} value
 */
function strictScalar(value) {
  if (typeof value === 'boolean') return String(value)
  if (plainSafe(value)) return value
  // Single quotes can't carry control characters; JSON's escapes are valid YAML.
  if ([...value].some((c) => c < ' ' || c === '\u007f')) return JSON.stringify(value)
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Rewrite a document in the editor's dialect as standard YAML.
 * @param {string} text
 * @returns {string}
 */
export function toStrictYaml(text) {
  const src = text.split('\n')
  /** @type {string[]} */
  const out = []

  for (let i = 0; i < src.length; i++) {
    const line = src[i]
    const l = splitLine(line)
    if (l.comment >= 0 || l.indent >= line.length || l.value < 0) {
      // A comment, a blank, a bare `-` or a `key:` opening a block — nothing to quote.
      out.push(l.key !== null && RESERVED.test(l.key) ? line.slice(0, l.content) + `'${l.key}'` + line.slice(l.colon) : line)
      continue
    }

    const head =
      l.key === null ? line.slice(0, l.content) : line.slice(0, l.content) + (RESERVED.test(l.key) ? `'${l.key}'` : l.key) + line.slice(l.colon, l.value)
    const raw = line.slice(l.value)

    const block = BLOCK.exec(raw.trim())
    if (block) {
      out.push(`${head}${block[1]}-`)
      while (i + 1 < src.length) {
        const next = splitLine(src[i + 1])
        if (next.indent < src[i + 1].length && next.indent <= l.content) break
        out.push(src[++i])
      }
      continue
    }

    // A bare line with no dash is a paragraph, and may carry on over the lines
    // after it at the same column — blank lines and comments between included.
    if (l.key === null && l.dashes.length === 0) {
      const parts = [raw.trim()]
      /** @type {string[]} */
      const between = []
      let last = i
      for (let j = i + 1; j < src.length; j++) {
        const next = splitLine(src[j])
        if (next.comment >= 0 || next.indent >= src[j].length) continue
        if (next.key !== null || next.dashes.length > 0 || next.content !== l.content) break
        for (let k = last + 1; k < j; k++) between.push(src[k])
        parts.push(src[j].slice(next.content).trim())
        last = j
      }
      if (parts.length > 1) {
        out.push(head + strictScalar(parts.join(' ')), ...between)
        i = last
        continue
      }
    }

    out.push(head + strictScalar(readScalar(raw).value))
  }

  return out.join('\n')
}
