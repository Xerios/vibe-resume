/**
 * What the editor underlines, beyond what the parser can see on its own.
 *
 * The dialect in relaxed-yaml.js barely has errors left — a value runs to the
 * end of its line and means whatever it says, so almost nothing a person types
 * fails to parse. That's the point, but it moves the burden: a typo now lands
 * as a section that quietly renders wrong rather than as a parse error. So the
 * shape of a CV is checked here instead, against the same table README.md
 * documents, and reported as warnings the editor can show without stopping the
 * preview or blocking an export.
 *
 * The other half of this file is the one ambiguity the dialect keeps. A bullet
 * reading `- Analytics: Mixpanel` is a mapping, because `Analytics` is a
 * perfectly good key — there is no way to tell it apart from a real entry. Any
 * list that should hold plain text is checked for that, and the fix is the one
 * escape hatch quotes still have.
 */

import { parse, splitLine } from './relaxed-yaml.js'

/**
 * Every section type, and what it holds.
 *
 * `holds` is the key the section's content lives under; `item` is the keys an
 * entry may carry, or null when the entries are plain text. `extra` is what the
 * type adds to the keys every section has.
 *
 * @type {Record<string, { holds: string, item: string[] | null, extra?: string[] }>}
 */
export const SECTIONS = {
  text: { holds: 'paragraphs', item: null },
  groups: { holds: 'blocks', item: ['title', 'rows'] },
  entries: { holds: 'items', item: ['subtype', 'title', 'org', 'dates', 'sub', 'sideNote', 'bullets', 'stack', 'items'] },
  list: { holds: 'items', item: null, extra: ['inline'] },
  levels: { holds: 'items', item: ['name', 'level', 'note', 'rating'] },
  records: { holds: 'items', item: ['name', 'issuer', 'dates', 'note'] },
  table: { holds: 'items', item: ['name', 'value', 'desc'], extra: ['columns'] },
}

/** The keys any section may carry, whatever its type. */
export const SECTION_KEYS = ['type', 'title', 'rail']
/** A `groups` block's rows, which are a level deeper than anything else gets. */
export const ROW_KEYS = ['tier', 'text']
/** The document itself. */
export const ROOT_KEYS = ['header', 'sections']
export const HEADER_KEYS = ['name', 'role', 'contact']
/** Lists that hold prose, wherever they turn up under an item. */
const TEXT_LISTS = new Set(['bullets', 'stack', 'items'])

const TYPES = Object.keys(SECTIONS)

/**
 * The ways a CV writes a month, each with the example a message shows. A bare
 * year isn't among them: it is a coarser date, not another spelling of one, and
 * a degree in `2010 – 2014` beside a job in `03/2020 – Present` is normal.
 * Anything not recognised — another language, `Summer 2019` — is left alone.
 * @type {[RegExp, string][]}
 */
const DATE_FORMATS = [
  [/^\d{1,2}\/\d{4}$/, '03/2020'],
  [/^\d{1,2}\.\d{4}$/, '03.2020'],
  [/^\d{4}-\d{1,2}$/, '2020-03'],
  [/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{4}$/i, 'Mar 2020'],
  [/^(?:january|february|march|april|june|july|august|september|october|november|december)\s+\d{4}$/i, 'March 2020'],
]

/** The two ends of a range: a dash with room around it, an en or em dash, or a word. */
const RANGE_SPLIT = /\s*[–—]\s*|\s+-\s+|\s+(?:to|until)\s+/i

/**
 * The month formats a `dates` value is written in, as their examples.
 * @param {unknown} value
 */
const dateFormats = (value) =>
  String(value)
    .replace(/[*_`]/g, '')
    .split(RANGE_SPLIT)
    .map((part) => DATE_FORMATS.find(([re]) => re.test(part.trim()))?.[1])
    .filter((f) => f !== undefined)

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
const isMap = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Read a document and say everything that looks wrong with it.
 *
 * @param {string} text
 * @returns {import('@codemirror/lint').Diagnostic[]}
 */
export function lintCv(text) {
  const { value, lines, diagnostics } = parse(text)
  const out = [...diagnostics]

  const src = text.split('\n')
  /** Offset of the start of each line. */
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)

  /**
   * The range to underline for a node: its key, its value, or the whole line.
   * The parser's line map is what ties a path back to a line; taking the range
   * apart again from the source is cheaper than carrying every offset through
   * the parse for the sake of the few nodes anything is ever said about.
   * @param {string} path
   * @param {'key' | 'value' | 'line'} part
   */
  const span = (path, part) => {
    const n = lines.get(path)
    if (!n) return null
    const from = starts[n - 1]
    const line = src[n - 1] ?? ''
    const p = splitLine(line)
    const end = from + line.trimEnd().length
    if (part === 'key' && p.key !== null) return { from: from + p.content, to: from + p.colon }
    if (part === 'value' && p.value >= 0) return { from: from + p.value, to: end }
    return { from: from + p.content, to: Math.max(end, from + p.content) }
  }

  /**
   * @param {string} path
   * @param {'key' | 'value' | 'line'} part
   * @param {string} message
   * @param {import('@codemirror/lint').Diagnostic['severity']} [severity]
   */
  const say = (path, part, message, severity = 'warning') => {
    const at = span(path, part)
    if (at) out.push({ ...at, severity, source: 'cv', message })
  }

  /**
   * @param {Record<string, unknown>} obj
   * @param {string} path
   * @param {string[]} allowed
   * @param {string} what what the thing is, for the message
   */
  const checkKeys = (obj, path, allowed, what) => {
    for (const key of Object.keys(obj)) {
      if (allowed.includes(key)) continue
      say(path ? `${path}.${key}` : key, 'key', `Nothing renders \`${key}\` on ${what}. Try one of: ${allowed.join(', ')}.`)
    }
  }

  /**
   * A list that should hold text. An entry that came back a mapping is almost
   * always a line that reads as `key: value` by accident.
   * @param {unknown[]} arr
   * @param {string} path
   */
  const checkTextList = (arr, path) => {
    arr.forEach((entry, i) => {
      if (!isMap(entry)) return
      const keys = Object.keys(entry)
      const hint = keys.length === 1 ? `\`${keys[0]}:\` at the start of this line reads as a key.` : 'This line reads as a mapping, not as text.'
      say(`${path}.${i}`, 'line', `${hint} Wrap the line in single quotes to keep it as text.`)
    })
  }

  if (value !== null && !isMap(value)) return sorted(out)
  if (value === null) return sorted(out)

  const cv = /** @type {Record<string, any>} */ (value)
  checkKeys(cv, '', ROOT_KEYS, 'a CV')
  if (isMap(cv.header)) checkKeys(cv.header, 'header', HEADER_KEYS, 'a header')
  if (Array.isArray(cv.header?.contact)) checkTextList(cv.header.contact, 'header.contact')

  if (cv.sections !== undefined && !Array.isArray(cv.sections)) {
    say('sections', 'key', '`sections` has to be a list — start each one with `- type: …`.')
  }

  const sections = Array.isArray(cv.sections) ? cv.sections : []
  /** Every `dates` value, for the consistency check once the walk is done. */
  /** @type {{ path: string, formats: string[] }[]} */
  const dated = []
  sections.forEach((sec, i) => {
    const path = `sections.${i}`
    if (!isMap(sec)) {
      say(path, 'line', 'A section has to be a mapping, starting with `type:`.')
      return
    }
    const type = sec.type
    if (type === undefined) {
      say(path, 'line', `This section has no \`type:\`. One of: ${TYPES.join(', ')}.`)
      return
    }
    const spec = SECTIONS[String(type)]
    if (!spec) {
      say(`${path}.type`, 'value', `\`${type}\` isn't a section type. One of: ${TYPES.join(', ')}.`)
      return
    }

    checkKeys(sec, path, [...SECTION_KEYS, spec.holds, ...(spec.extra ?? [])], `a \`${type}\` section`)

    if (Array.isArray(sec.columns)) checkTextList(sec.columns, `${path}.columns`)

    const content = sec[spec.holds]
    if (content === undefined || content === null) {
      say(path, 'line', `A \`${type}\` section holds its content under \`${spec.holds}:\`.`)
      return
    }
    if (!Array.isArray(content)) {
      say(`${path}.${spec.holds}`, 'key', `\`${spec.holds}\` has to be a list — start each entry with \`- \`.`)
      return
    }

    const holds = `${path}.${spec.holds}`
    if (spec.item === null) {
      checkTextList(content, holds)
      return
    }

    content.forEach((item, j) => {
      const itemPath = `${holds}.${j}`
      if (!isMap(item)) {
        say(itemPath, 'line', `A \`${type}\` entry is a mapping — give it at least \`${spec.item?.[0]}:\`.`)
        return
      }
      checkKeys(item, itemPath, /** @type {string[]} */ (spec.item), `a \`${type}\` entry`)
      if (item.dates != null && !isMap(item.dates) && !Array.isArray(item.dates)) {
        dated.push({ path: `${itemPath}.dates`, formats: dateFormats(item.dates) })
      }
      for (const key of Object.keys(item)) {
        if (TEXT_LISTS.has(key) && Array.isArray(item[key])) checkTextList(item[key], `${itemPath}.${key}`)
      }
      // `groups` is the one type with a level below its entries.
      if (type === 'groups' && Array.isArray(item.rows)) {
        item.rows.forEach((/** @type {unknown} */ row, /** @type {number} */ k) => {
          const rowPath = `${itemPath}.rows.${k}`
          if (isMap(row)) checkKeys(row, rowPath, ROW_KEYS, 'a groups row')
          else say(rowPath, 'line', 'A groups row is a mapping — `text:`, and `tier:` in front of it if you want one.')
        })
      }
    })
  })

  checkDates(dated, say)
  return sorted(out)
}

/**
 * One way of writing a month throughout. A résumé parser reads dates off the
 * printed text, and a document that switches between `03/2020` and
 * `March 2021` is the one most likely to get a range wrong. The format most of
 * the document uses is the one to keep; a tie goes to whichever came first.
 *
 * @param {{ path: string, formats: string[] }[]} dated
 * @param {(path: string, part: 'value', message: string, severity: 'info') => void} say
 */
function checkDates(dated, say) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const { formats } of dated) for (const f of formats) counts.set(f, (counts.get(f) ?? 0) + 1)
  if (counts.size < 2) return
  let main = ''
  for (const [f, n] of counts) if (n > (counts.get(main) ?? 0)) main = f

  for (const { path, formats } of dated) {
    const odd = formats.find((f) => f !== main)
    if (odd) {
      say(path, 'value', `Most dates here read like \`${main}\`; this one reads like \`${odd}\`. One format throughout is easier for résumé parsers to read.`, 'info')
    }
  }
}

/** @param {import('@codemirror/lint').Diagnostic[]} list */
const sorted = (list) => list.toSorted((a, b) => a.from - b.from || a.to - b.to)
