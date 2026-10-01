/**
 * Pastes that aren't the format.
 *
 * Someone arriving with a CV already written pastes it in, and what they paste
 * is almost never this dialect: it is Markdown, or formatted text out of a word
 * processor or a web page, or YAML in some other schema. All three parse —
 * almost nothing fails to — into a sheet with nothing on it, which is a worse
 * answer than saying so. `classifyPaste` is what decides a paste is one of
 * those; the editor asks before inserting it.
 *
 * What it offers instead is deliberately dumb. `basicConversion` makes each
 * heading a `text` section and each line a paragraph, and nothing more: a CV
 * has no fixed shape to recognise, so anything cleverer would guess wrong in
 * ways that are harder to notice than a page of paragraphs. The faithful
 * conversion is the prompt, which hands the job to whichever assistant the
 * writer uses.
 */

import EXAMPLE from '../default-cv.yaml?raw'
import { needsQuotes, parse, splitLine } from './relaxed-yaml.js'

/** @typedef {'markdown' | 'html' | 'invalid'} PasteKind */

/**
 * A paste held back for a decision: what was on the clipboard, and the range
 * it would have replaced.
 * @typedef {object} PasteIssue
 * @property {PasteKind} kind
 * @property {string} text   the clipboard's plain text
 * @property {string} html   its HTML, or ''
 * @property {number} from
 * @property {number} to
 * @property {boolean} whole the paste would have replaced the whole document
 */

/** Fewer lines than this is a phrase going into a value, whatever it looks like. */
const MIN_LINES = 3

/** Markdown that has no reading in the dialect — a heading here is a comment. */
const MD_HEADING = /^#{1,6}\s+\S/
const MD_OTHER = [/^\s*[*+]\s+\S/, /^\s*\d+[.)]\s+\S/, /^(?:=+|-{3,})\s*$/, /^>\s/, /^\s*\|.*\|\s*$/]

/** Block markup: what separates formatted text from a single styled run. */
const HTML_BLOCK = /<(?:h[1-6]|p|li|div|tr|br)\b/i
/** The same, typed or copied as source rather than as formatted text. */
const HTML_SOURCE = /<\/?(?:html|body|div|p|h[1-6]|ul|ol|li|table|tr|td|span|br|strong|em|a)\b[^>]*>/gi

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
const isMap = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Whether a text is a CV in the dialect: something with the header or the
 * sections the sheet is built from.
 * @param {string} text
 */
export function looksLikeCv(text) {
  const { value } = parse(text)
  return isMap(value) && (Array.isArray(value.sections) || isMap(value.header))
}

/**
 * Whether a paste should be asked about rather than inserted, and why.
 *
 * Replacing the whole document is held to the full standard — it has to come
 * out a CV. Anywhere else a paste is a fragment, and a fragment of the dialect
 * is ordinary editing: it is only stopped when it is plainly something else.
 * @param {string} text  the clipboard's plain text
 * @param {string} html  its HTML, or ''
 * @param {boolean} whole whether it would replace the whole document
 * @returns {PasteKind | null}
 */
export function classifyPaste(text, html, whole) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < MIN_LINES) return null
  if (whole && looksLikeCv(text)) return null

  const parts = lines.map(splitLine)
  const keyed = parts.filter((p) => p.key).length / lines.length
  // Lines the dialect would read as structure. A Markdown bullet is one too,
  // which is why it isn't what Markdown is detected by.
  const shaped = parts.filter((p) => p.key || p.dashes.length).length / lines.length

  if (keyed >= 0.5) return whole ? 'invalid' : null
  // A code editor puts HTML on the clipboard too; its plain text is the source.
  if (shaped < 0.5 && HTML_BLOCK.test(html)) return 'html'
  if ((text.match(HTML_SOURCE)?.length ?? 0) >= 3) return 'html'

  const headings = lines.filter((l) => MD_HEADING.test(l)).length
  const others = lines.filter((l) => MD_OTHER.some((re) => re.test(l))).length
  if (headings * 2 + others >= 2) return 'markdown'

  return whole ? 'invalid' : null
}

/* ── Basic conversion ──────────────────────────────────────────────────────── */

const HEADING_RE = /^(#{1,6})\s+(.*?)(?:\s+#+)?$/
const ITEM_RE = /^(?:[-*+]|\d+[.)])\s+(.*)$/
const RULE_RE = /^(?:[-*_]\s*){3,}$/
const TABLE_RULE_RE = /^\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/
const SETEXT_RE = /^(?:=+|-{2,})$/

/** @typedef {{ title: string, paras: string[] }} Section */

/** Emphasis wrapped round a whole heading is the heading's own weight, not a claim. */
const plain = (/** @type {string} */ s) => s.replace(/^(\*\*|__|\*|_)(.+)\1$/, '$2')

/**
 * Markdown, read as headings and lines. The shallowest heading level makes the
 * sections; deeper ones become bold lines inside them, so `## Experience` over
 * `### Acme` is one section rather than an empty one beside another.
 * @param {string} md
 * @param {boolean} takeName read a first `# heading` as the CV's name
 * @returns {{ name: string, sections: Section[] }}
 */
export function readMarkdown(md, takeName) {
  /** @type {{ level: number, text: string }[]} */
  const blocks = []
  let afterPara = false
  for (const raw of md.split(/\r?\n/)) {
    const t = raw.trim()
    if (!t) {
      afterPara = false
      continue
    }
    if (afterPara && SETEXT_RE.test(t)) {
      const last = /** @type {{ level: number, text: string }} */ (blocks.pop())
      blocks.push({ level: t[0] === '=' ? 1 : 2, text: last.text })
      afterPara = false
      continue
    }
    afterPara = false
    if (RULE_RE.test(t) || TABLE_RULE_RE.test(t)) continue
    const h = HEADING_RE.exec(t)
    if (h) {
      blocks.push({ level: h[1].length, text: plain(h[2]) })
      continue
    }
    const item = ITEM_RE.exec(t)
    blocks.push({ level: 0, text: item ? `• ${item[1]}` : t.replace(/^(?:>\s?)+/, '') })
    afterPara = !item
  }

  let name = ''
  const first = blocks.findIndex((b) => b.level)
  if (takeName && first >= 0 && blocks[first].level === 1) name = blocks.splice(first, 1)[0].text

  const top = Math.min(...blocks.filter((b) => b.level).map((b) => b.level))
  /** @type {Section[]} */
  const sections = []
  /** @type {Section | null} */
  let cur = null
  for (const b of blocks) {
    if (b.level === top) {
      cur = { title: b.text, paras: [] }
      sections.push(cur)
      continue
    }
    if (!cur) {
      cur = { title: '', paras: [] }
      sections.push(cur)
    }
    if (b.text) cur.paras.push(b.level ? `**${b.text}**` : b.text)
  }
  return { name, sections }
}

/**
 * A value as the dialect needs it written — bare almost always.
 * @param {string} s
 * @param {boolean} item
 */
const scalar = (s, item) => (needsQuotes(s, item) ? `'${s.replace(/'/g, "''")}'` : s)

/**
 * Sections as `sections:` list items, at the indent the default CV uses.
 * @param {Section[]} sections
 */
function sectionsYaml(sections) {
  return sections
    .map(({ title, paras }) => {
      const out = ['  - type: text']
      if (title) out.push(`    title: ${scalar(title, false)}`)
      out.push('    paragraphs:')
      for (const p of paras) out.push(`      - ${scalar(p, true)}`)
      return out.join('\n')
    })
    .join('\n\n')
}

/**
 * Where new sections go in a document that already has some: after the last
 * thing in its `sections:` list, or in a new one at the end.
 * @param {string} doc
 * @param {string} items `sections:` list items
 * @returns {{ from: number, to: number, insert: string }}
 */
export function appendSections(doc, items) {
  const lines = doc.split('\n')
  const at = lines.findIndex((l) => {
    const p = splitLine(l)
    return p.indent === 0 && !p.dashes.length && p.key === 'sections'
  })
  if (at < 0) {
    const end = doc.trimEnd().length
    return { from: end, to: doc.length, insert: `${end ? '\n\n' : ''}sections:\n${items}\n` }
  }
  // The list ends where the next top-level key starts; blank lines and
  // comments before that key belong to it rather than to the list.
  let last = at
  for (let i = at + 1; i < lines.length; i++) {
    const p = splitLine(lines[i])
    if (p.indent >= lines[i].length || p.comment >= 0) continue
    if (p.indent === 0 && !p.dashes.length) break
    last = i
  }
  let pos = 0
  for (let i = 0; i <= last; i++) pos += lines[i].length + 1
  pos -= 1 // the end of that line, before its newline
  return { from: pos, to: pos, insert: `${last === at ? '\n' : '\n\n'}${items}` }
}

/**
 * The basic conversion, as an edit: the whole document when the paste would
 * have replaced it, and otherwise new sections at the end, leaving what was
 * selected alone.
 * @param {PasteIssue} issue
 * @param {string} doc the document's current text
 * @returns {{ from: number, to: number, insert: string }}
 */
export function basicConversion(issue, doc) {
  const { name, sections } = readMarkdown(sourceMarkdown(issue), issue.whole)
  const items = sectionsYaml(sections)
  if (!issue.whole) return appendSections(doc, items)
  const insert = `header:\n  name: ${scalar(name || 'Your Name', false)}\nsections:\n${items}\n`
  return { from: 0, to: doc.length, insert }
}

/* ── HTML ──────────────────────────────────────────────────────────────────── */

const BLOCKS = new Set(
  'address article aside blockquote body dd div dl dt figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody tfoot thead tr ul'.split(
    ' ',
  ),
)
const BLOCK_SELECTOR = [...BLOCKS, 'br'].join(',')
const IGNORED = new Set('head link meta noscript script style svg template title'.split(' '))

/**
 * Formatted text as Markdown: headings, list items, lines, bold, italic and
 * links. Everything else is read for its text. Bold and italic are taken from
 * inline styles as well as tags, because that is how Google Docs writes them —
 * and why a `<b style="font-weight:normal">` is not bold.
 * @param {string} html
 */
export function htmlToMarkdown(html) {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  /** @type {string[]} */
  const out = []
  let prefix = ''
  let line = ''
  let inHeading = false

  const flush = () => {
    const t = line.replace(/\s+/g, ' ').trim()
    line = ''
    if (!t) return
    out.push(prefix + t)
    prefix = ''
  }

  /** @param {Element} el */
  const children = (el) => el.childNodes.forEach(walk)

  /** @param {Node} node */
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      line += node.nodeValue ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = /** @type {Element} */ (node)
    const tag = el.tagName.toLowerCase()
    if (IGNORED.has(tag)) return
    if (tag === 'br') return flush()

    const level = /^h([1-6])$/.exec(tag)
    if (level || tag === 'li') {
      flush()
      prefix = level ? `${'#'.repeat(+level[1])} ` : '- '
      inHeading = !!level
      children(el)
      flush()
      inHeading = false
      return
    }
    if (BLOCKS.has(tag)) {
      flush()
      children(el)
      flush()
      return
    }
    if (tag === 'td' || tag === 'th') {
      if (line.trim()) line += ' · '
      children(el)
      return
    }

    const style = el.getAttribute('style') ?? ''
    const weight = /font-weight\s*:\s*([^;]+)/i.exec(style)?.[1].trim() ?? ''
    const fontStyle = /font-style\s*:\s*([^;]+)/i.exec(style)?.[1].trim() ?? ''
    const bold = !inHeading && (tag === 'b' || tag === 'strong' ? !/^(?:normal|lighter|[1-4]00)$/.test(weight) : /^(?:bold|bolder|[6-9]00)$/.test(weight))
    const italic = !inHeading && (tag === 'i' || tag === 'em' ? fontStyle !== 'normal' : fontStyle === 'italic')
    const href = tag === 'a' ? (el.getAttribute('href') ?? '') : ''
    const link = /^(?:https?:|mailto:)/i.test(href)
    // A run that holds blocks can't be wrapped as one: its lines are flushed inside it.
    if ((!bold && !italic && !link) || el.querySelector(BLOCK_SELECTOR)) return children(el)

    const before = line
    line = ''
    children(el)
    const inner = line
    line = before
    const t = inner.trim()
    if (!t) {
      line += inner
      return
    }
    let md = t
    if (italic) md = `_${md}_`
    if (bold) md = `**${md}**`
    if (link) md = `[${md}](${href})`
    line += (/^\s/.test(inner) ? ' ' : '') + md + (/\s$/.test(inner) ? ' ' : '')
  }

  walk(body)
  flush()
  return out.join('\n')
}

/**
 * The paste as Markdown — what both conversions start from. Formatted text
 * comes from its HTML, or from the plain text when that is HTML source.
 * @param {PasteIssue} issue
 */
export function sourceMarkdown(issue) {
  return issue.kind === 'html' ? htmlToMarkdown(issue.html || issue.text) : issue.text
}

/* ── The prompt ────────────────────────────────────────────────────────────── */

/**
 * A prompt that converts a CV into the dialect, with the CV in it.
 * @param {string} cv the CV, as Markdown or plain text
 */
export function conversionPrompt(cv) {
  return `Convert my CV below into the YAML-like format described here. Reply with only the converted document, in a single code block.

Rules:
- Keep everything my CV says, worded as it is. Don't invent, embellish or drop anything; leave a field out when my CV has nothing for it.
- Indent with two spaces, never tabs.
- A value runs to the end of its line and is taken as written, so nothing needs quoting — except a list item that starts with a single word and a colon, like 'Analytics: Mixpanel', which must be wrapped in single quotes or it reads as a key.
- Text may use **bold**, _italic_ and [links](https://example.com).

Structure:
The document is a \`header\` — \`name\`, \`role\` and \`contact\`, a list of lines such as location, phone, email and links — and a list of \`sections\`. Each section has a \`type\`, a \`title\` and its content:
- text: \`paragraphs\`, a list of paragraphs — a summary, a profile
- groups: \`blocks\`, each a \`title\` and \`rows\` of { tier (optional), text } — skills
- entries: \`items\` of { title, org, dates, sub, bullets, stack } — roles, degrees, projects; one section each. \`org\` is the company or the school, \`sub\` one line of context such as the team or the location, \`stack\` a comma-separated list of technologies. Older roles can share one item with \`subtype: earlier\`, a \`title\` and \`items\` of one-line strings.
- list: \`items\` of plain strings; add \`inline: true\` for short ones such as interests
- levels: \`items\` of { name, level, note } — languages
- records: \`items\` of { name, issuer, dates, note } — certifications, licences
- table: \`items\` of { name, value, desc }, with optional \`columns\`, a list of three headings — open-source projects with their stars, say

Use the types that fit, in my CV's order. Anything that fits none of them goes in a \`text\` or a \`list\`.

An example of the format — its content is placeholder, only the shape matters:

\`\`\`yaml
${EXAMPLE.trim()}
\`\`\`

My CV:

${cv.trim()}
`
}

/**
 * An assistant's reply, without the code fence it was asked to put it in.
 * @param {string} reply
 */
export function stripFence(reply) {
  const m = /^\s*```[\w-]*[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(reply)
  return m ? m[1] : reply
}
