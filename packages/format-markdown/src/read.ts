/**
 * A CV written as Markdown, read into the tree every format reads into (see
 * @vibe-resume/core/schema).
 *
 * The document is read a line at a time, because a CV in Markdown only ever
 * uses a handful of block shapes and each one says where it starts:
 *
 *     # Name                       the header; the first paragraph under it is
 *     Role                         the role, further lines are `left`, and
 *     - contact                    a list is the contact block
 *
 *     ## Section                   a section; its type is what its content is
 *     ### Org — Title              an entry (or a group, under a skills section)
 *     **2017.09–2017.12** · Place  its dates, in bold, then where (its `sub`)
 *     - bullet                     bullets
 *     Stack: A, B                  its stack
 *     Methodologies: C, D          its methodologies, set out as a stack is
 *
 * The bold dates line is the one to write; a plain line that reads as dates,
 * with the line of context under it, is read too, and so is the place first
 * with the dates last (`Place · **dates**`). Under a dates line that carries
 * its place, a further line is the entry's description, not more place.
 *
 * A section's type is taken, in order, from an `<!-- type: … -->` comment
 * under its heading, from its title when the content fits (Skills, Languages,
 * Certifications, Interests, Open Source…), and otherwise from its shape:
 * `###` entries are `entries`, a list alone is `list`, and prose is `text`.
 *
 * Within one line, fields are split on a spaced em dash ` — `: a language is
 * `name — level — note`, a record `name — issuer — dates — note`, a table row
 * `name — value — desc`. An en dash is left alone, since date ranges use it.
 *
 * An HTML comment of `key: value` pairs sets keys the text can't say — under
 * `#` (`lang`), under `##` (`type`, `inline`), under `###` or at the
 * end of a list item (`subtype`, `sideNote`, `rating`). Markdown viewers don't
 * show comments, so the file still reads as an ordinary resume.
 */

import { parseDates } from '@vibe-resume/core/dates'
import type { Diagnostic, Heading, SourceRead } from '@vibe-resume/core/format'
import { SECTIONS } from '@vibe-resume/core/schema'

/** One line of the source, with where it starts. */
interface Line {
  /** 1-based */
  n: number
  text: string
  from: number
}

type Directive = Record<string, string | boolean>

interface Item {
  text: string
  line: Line
  directive: Directive
}

type Block = { kind: 'para'; lines: Line[] } | { kind: 'list'; items: Item[] }

interface Child {
  title: string
  line: Line
  directive: Directive
  blocks: Block[]
}

interface Section {
  title: string
  line: Line
  directive: Directive
  directiveLine: Line | null
  blocks: Block[]
  children: Child[]
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/
const COMMENT = /^\s*<!--(.*?)-->\s*$/
const TRAILING_COMMENT = /\s*<!--(.*?)-->\s*$/
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
/** A spaced em dash — the one separator between fields on a line. */
const FIELDS = /\s+—\s+/
/** `**Tier:** text`, a groups row with a tier. */
const TIER = /^\*\*([^*]+?):?\*\*:?\s+(.*)$/
/** An entry's `**dates** · place` line: the bold part, or a plain one, then what follows a `·` or `|`. */
const META = /^(?:\*\*(.+?)\*\*|([^·|]+?))\s*(?:[·|]\s*(.*))?$/
/** `Place · **dates**`: what comes before the last `·` or `|`, and the bold or plain part after it. */
const META_LAST = /^(.+?)\s+[·|]\s+(\*\*[^*]+\*\*|[^·|]+?)\s*$/
/** The label of a `Stack: …` or `Methodologies: …` line, in any of the ways it gets written. */
export const LABEL = /^(?:\*\*|__)?(stack|tech(?:nologies)?|tools|methodolog(?:y|ies)|methods)(?::(?:\*\*|__)|(?:\*\*|__)?:)/i

/** A labelled line as the entry key it sets and what it says, or null. */
function labelled(text: string): { key: 'stack' | 'methodologies'; value: string } | null {
  const m = LABEL.exec(text)
  return m ? { key: /^meth/i.test(m[1]) ? 'methodologies' : 'stack', value: text.slice(m[0].length).trim() } : null
}

/** Keys a comment may set, by where it is. */
export const DIRECTIVE_KEYS = {
  header: ['lang'],
  section: ['type', 'inline'],
  item: ['subtype', 'sideNote', 'rating'],
}

/** Section titles that say what a section is, when its content agrees. */
const TITLE_TYPES: Array<[RegExp, string, (s: Section) => boolean]> = [
  [/summary|profile|about|objective/i, 'text', (s) => !s.children.length],
  [/skill/i, 'groups', (s) => s.children.length > 0 || labelledList(s)],
  [/language/i, 'levels', (s) => onlyList(s)],
  [/certif|licen|award|course/i, 'records', (s) => onlyList(s)],
  [/interest|hobb/i, 'list', (s) => onlyList(s)],
  // Only rows of `name — value — desc`: a list of projects under the title is a list.
  [/open.?source/i, 'table', (s) => onlyList(s) && s.blocks.every((b) => b.kind === 'list' && b.items.every((it) => it.text.split(FIELDS).length >= 3))],
]

const onlyList = (s: Section): boolean => !s.children.length && s.blocks.length > 0 && s.blocks.every((b) => b.kind === 'list')

/** A list alone whose every item opens on a bold label — `- **Frontend:** Svelte, React` — a group to an item. */
const labelledList = (s: Section): boolean => onlyList(s) && s.blocks.every((b) => b.kind === 'list' && b.items.every((it) => TIER.test(it.text)))

const strip = (text: string): string => text.replace(/[*_`]/g, '').trim()

/**
 * The document's headings, each with the offset it starts at. Every level
 * counts: an entry's `###` says where a change landed as well as the `##` over
 * it does, and the one nearest above is the one picked.
 */
export function outline(text: string): Heading[] {
  const out: Heading[] = []
  let offset = 0
  for (const t of text.split('\n')) {
    const m = HEADING.exec(t)
    if (m) out.push({ from: offset, title: strip(m[2]) })
    offset += t.length + 1
  }
  return out
}

export function read(text: string): SourceRead {
  const diagnostics: Diagnostic[] = []
  const lines: Map<string, number> = new Map()
  const value: Record<string, any> = {}

  // ── Lines ────────────────────────────────────────────────────────────────
  const src: Line[] = []
  let offset = 0
  for (const [i, t] of text.split('\n').entries()) {
    src.push({ n: i + 1, text: t, from: offset })
    offset += t.length + 1
  }

  const warn = (line: Line, message: string, from = 0, to = line.text.length): void => {
    diagnostics.push({ from: line.from + from, to: line.from + Math.max(to, from), severity: 'warning', source: 'markdown', message })
  }

  /** Read a comment's `key: value` pairs, warning about any key that has no meaning there. */
  const directive = (body: string, line: Line, allowed: string[]): Directive => {
    const out: Directive = {}
    for (const part of body.split(/[,;]/)) {
      const m = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/.exec(part)
      if (!m) continue
      const [, key, raw] = m
      if (!allowed.includes(key)) {
        const col = line.text.indexOf(key)
        warn(line, `\`${key}\` means nothing here. A comment here can set: ${allowed.join(', ')}.`, col, col + key.length)
        continue
      }
      out[key] = raw === 'true' ? true : raw === 'false' ? false : raw
    }
    return out
  }

  // ── Blocks ───────────────────────────────────────────────────────────────
  // The document as headings, each holding the paragraphs and lists under it.
  let header: { name: string; line: Line; directive: Directive; blocks: Block[] } | null = null
  const sections: Section[] = []
  /** Where blocks land as they are read: the header, a section, or one of its `###`. */
  let target: { blocks: Block[]; directive: Directive } | null = null
  let targetKind: keyof typeof DIRECTIVE_KEYS = 'header'
  let para: Line[] | null = null
  let list: Item[] | null = null
  let strayWarned = false

  const close = (): void => {
    para = null
    list = null
  }

  for (const line of src) {
    const t = line.text
    if (!t.trim() || RULE.test(t)) {
      close()
      continue
    }
    const heading = HEADING.exec(t)
    if (heading) {
      close()
      const level = heading[1].length
      const title = heading[2]
      if (level === 1 && !header && !sections.length) {
        header = { name: title, line, directive: {}, blocks: [] }
        target = header
        targetKind = 'header'
      } else if (level <= 2) {
        const sec: Section = { title, line, directive: {}, directiveLine: null, blocks: [], children: [] }
        sections.push(sec)
        target = sec
        targetKind = 'section'
      } else if (sections.length) {
        const child: Child = { title, line, directive: {}, blocks: [] }
        sections[sections.length - 1].children.push(child)
        target = child
        targetKind = 'item'
      }
      continue
    }
    const comment = COMMENT.exec(t)
    if (comment) {
      close()
      if (target) {
        Object.assign(target.directive, directive(comment[1], line, DIRECTIVE_KEYS[targetKind]))
        if (targetKind === 'section') (target as Section).directiveLine ??= line
      }
      continue
    }
    if (!target) {
      if (!strayWarned) warn(line, 'Text before the first heading is not part of the CV. Start with `# Your Name`.')
      strayWarned = true
      continue
    }
    const bullet = BULLET.exec(t)
    if (bullet) {
      para = null
      if (!list) {
        list = []
        target.blocks.push({ kind: 'list', items: list })
      }
      const trailing = TRAILING_COMMENT.exec(bullet[1])
      const itemText = trailing ? bullet[1].slice(0, trailing.index) : bullet[1]
      list.push({ text: itemText.trim(), line, directive: trailing ? directive(trailing[1], line, DIRECTIVE_KEYS.item) : {} })
      continue
    }
    // An indented line under a bullet carries that bullet on, unless it is a
    // `Stack:` line, which ends the list rather than joining its last item.
    if (list && /^\s/.test(t) && !labelled(t.trim())) {
      const last = list[list.length - 1]
      last.text = `${last.text} ${t.trim()}`
      continue
    }
    list = null
    if (!para) {
      para = []
      target.blocks.push({ kind: 'para', lines: para })
    }
    para.push(line)
  }

  // ── The header ───────────────────────────────────────────────────────────
  if (header) {
    lines.set('', header.line.n)
    lines.set('header', header.line.n)
    lines.set('header.name', header.line.n)
    const h: Record<string, any> = { name: header.name }
    const contact: string[] = []
    const left: string[] = []
    const contactAt = (line: Line): void => {
      if (!lines.has('header.contact')) lines.set('header.contact', line.n)
      lines.set(`header.contact.${contact.length - 1}`, line.n)
    }
    for (const block of header.blocks) {
      if (block.kind === 'list') {
        for (const item of block.items) {
          contact.push(item.text)
          contactAt(item.line)
        }
        continue
      }
      for (const line of block.lines) {
        if (h.role === undefined) {
          h.role = line.text.trim()
          lines.set('header.role', line.n)
          continue
        }
        if (!line.text.trim()) continue
        left.push(line.text.trim())
        lines.set(`header.left.${left.length - 1}`, line.n)
      }
    }
    if (left.length) h.left = left
    if (contact.length) h.contact = contact
    if (typeof header.directive.lang === 'string') h.lang = header.directive.lang
    value.header = h
  }

  // ── Sections ─────────────────────────────────────────────────────────────
  if (sections.length) lines.set('sections', sections[0].line.n)
  if (!lines.has('')) lines.set('', sections[0]?.line.n ?? 1)
  value.sections = sections.map((sec, i) => readSection(sec, `sections.${i}`))

  function readSection(sec: Section, path: string): Record<string, any> {
    lines.set(path, sec.line.n)
    lines.set(`${path}.title`, sec.line.n)
    const out: Record<string, any> = { title: sec.title }
    const { type: asked, ...rest } = sec.directive
    let type: string | undefined
    if (typeof asked === 'string') {
      if (SECTIONS[asked]) {
        type = asked
        if (sec.directiveLine) lines.set(`${path}.type`, sec.directiveLine.n)
      } else if (sec.directiveLine) {
        const col = sec.directiveLine.text.indexOf(asked)
        warn(sec.directiveLine, `\`${asked}\` isn't a section type. One of: ${Object.keys(SECTIONS).join(', ')}.`, col, col + asked.length)
      }
    }
    type ??= TITLE_TYPES.find(([re, , fits]) => re.test(sec.title) && fits(sec))?.[1]
    type ??= sec.children.length ? 'entries' : onlyList(sec) ? 'list' : 'text'
    out.type = type
    Object.assign(out, rest)

    if (!sec.blocks.length && !sec.children.length) warn(sec.line, 'This section has nothing in it yet.')
    if (sec.children.length && sec.blocks.length && type !== 'text') {
      const first = sec.blocks[0]
      warn(first.kind === 'para' ? first.lines[0] : first.items[0].line, 'Text between a section heading and its first `###` is not shown.')
    }

    const holds = SECTIONS[type].holds
    const items: any[] = []
    const holdsAt = (n: number): void => {
      if (!lines.has(`${path}.${holds}`)) lines.set(`${path}.${holds}`, n)
    }

    if (type === 'text') {
      for (const block of sec.blocks) {
        const parts =
          block.kind === 'para'
            ? [{ text: block.lines.map((l) => l.text.trim()).join(' '), n: block.lines[0].n }]
            : block.items.map((it) => ({ text: it.text, n: it.line.n }))
        for (const p of parts) {
          holdsAt(p.n)
          lines.set(`${path}.${holds}.${items.length}`, p.n)
          items.push(p.text)
        }
      }
    } else if (type === 'groups' && !sec.children.length) {
      // `- **Label:** rows`: the label is the group's title, the rest its one row.
      for (const block of sec.blocks) {
        if (block.kind !== 'list') continue
        for (const it of block.items) {
          const tier = TIER.exec(it.text)
          const at = `${path}.${holds}.${items.length}`
          holdsAt(it.line.n)
          lines.set(at, it.line.n)
          lines.set(`${at}.title`, it.line.n)
          lines.set(`${at}.rows`, it.line.n)
          lines.set(`${at}.rows.0`, it.line.n)
          items.push(tier ? { title: tier[1].trim(), rows: [{ text: tier[2] }] } : { title: '', rows: [{ text: it.text }] })
        }
      }
    } else if (type === 'entries' || type === 'groups') {
      for (const child of sec.children) {
        const at = `${path}.${holds}.${items.length}`
        holdsAt(child.line.n)
        lines.set(at, child.line.n)
        lines.set(`${at}.title`, child.line.n)
        items.push(type === 'entries' ? readEntry(child, at) : readGroup(child, at))
      }
    } else {
      for (const block of sec.blocks) {
        const entries = block.kind === 'list' ? block.items : block.lines.map((line) => ({ text: line.text.trim(), line, directive: {} }))
        for (const item of entries) {
          const at = `${path}.${holds}.${items.length}`
          holdsAt(item.line.n)
          lines.set(at, item.line.n)
          items.push(readRow(type, item))
        }
      }
    }
    out[holds] = items
    return out
  }

  function readEntry(child: Child, at: string): Record<string, any> {
    // `### Org — Title`: the organisation first, as a reader scans for it. A
    // heading with no ` — ` is a title alone — a project, say.
    const [first, ...rest] = child.title.split(FIELDS)
    const item: Record<string, any> = rest.length ? { title: rest.join(' — '), org: first } : { title: first }
    Object.assign(item, child.directive)
    const earlier = item.subtype === 'earlier'
    const listKey = earlier ? 'items' : 'bullets'
    let metaRead = false
    // Text above the bullets and stack is the entry's summary; text below them
    // is kept as notes so the sheet sets it out in the order it was written.
    let past = false
    for (const block of child.blocks) {
      if (block.kind === 'list') {
        past = true
        for (const it of block.items) {
          const tail = labelled(it.text)
          if (tail && !earlier) {
            item[tail.key] = tail.value
            lines.set(`${at}.${tail.key}`, it.line.n)
            continue
          }
          item[listKey] ??= []
          if (!lines.has(`${at}.${listKey}`)) lines.set(`${at}.${listKey}`, it.line.n)
          lines.set(`${at}.${listKey}.${item[listKey].length}`, it.line.n)
          item[listKey].push(it.text)
        }
        continue
      }
      // The first paragraph is the dates and the line of context, often written
      // one under the other with no blank between. Any paragraph after it is the
      // entry's own text, kept apart from the context line.
      if (metaRead) {
        const own: string[] = []
        for (const line of block.lines) {
          const tail = labelled(line.text.trim())
          if (tail) {
            item[tail.key] = tail.value
            lines.set(`${at}.${tail.key}`, line.n)
            past = true
          } else own.push(line.text.trim())
        }
        if (own.length) {
          const key = past ? 'notes' : 'summary'
          item[key] ??= []
          if (!lines.has(`${at}.${key}`)) lines.set(`${at}.${key}`, block.lines[0].n)
          lines.set(`${at}.${key}.${item[key].length}`, block.lines[0].n)
          item[key].push(own.join(' '))
        }
        continue
      }
      metaRead = true
      // Once a line has given the dates and the place, what follows describes the entry.
      let placed = false
      const described: Line[] = []
      for (const line of block.lines) {
        const t = line.text.trim()
        const tail = labelled(t)
        const fresh = item.dates === undefined && item.sub === undefined
        const meta = fresh ? META.exec(t) : null
        // Bold leading the first line is the dates, whatever they say; plain
        // text only when it reads as dates.
        const when = meta ? (meta[1] ?? (parseDates(strip(meta[2])) ? meta[2] : undefined)) : undefined
        // Otherwise the dates may close the line, after the place — as long as they read as dates.
        const last = fresh && when === undefined ? META_LAST.exec(t) : null
        if (tail) {
          item[tail.key] = tail.value
          lines.set(`${at}.${tail.key}`, line.n)
        } else if (meta && when !== undefined) {
          item.dates = strip(when)
          lines.set(`${at}.dates`, line.n)
          if (meta[3]) {
            item.sub = meta[3].trim()
            lines.set(`${at}.sub`, line.n)
            placed = true
          }
        } else if (last && parseDates(strip(last[2]))) {
          item.dates = strip(last[2])
          lines.set(`${at}.dates`, line.n)
          item.sub = last[1].trim()
          lines.set(`${at}.sub`, line.n)
          placed = true
        } else if (placed) {
          described.push(line)
        } else if (item.sub === undefined) {
          item.sub = t
          lines.set(`${at}.sub`, line.n)
        } else {
          item.sub = `${item.sub} ${t}`
        }
      }
      if (described.length) {
        item.summary ??= []
        lines.set(`${at}.summary`, described[0].n)
        lines.set(`${at}.summary.${item.summary.length}`, described[0].n)
        item.summary.push(described.map((l) => l.text.trim()).join(' '))
      }
    }
    return item
  }

  function readGroup(child: Child, at: string): Record<string, any> {
    const rows: Array<Record<string, string>> = []
    const add = (row: string, line: Line): void => {
      if (!rows.length) lines.set(`${at}.rows`, line.n)
      lines.set(`${at}.rows.${rows.length}`, line.n)
      const tier = TIER.exec(row)
      rows.push(tier ? { tier: tier[1].trim(), text: tier[2] } : { text: row })
    }
    for (const block of child.blocks) {
      if (block.kind === 'list') for (const it of block.items) add(it.text, it.line)
      else for (const line of block.lines) add(line.text.trim(), line)
    }
    return { title: child.title, rows }
  }

  function readRow(type: string, item: Item): unknown {
    const fields = item.text.split(FIELDS)
    if (type === 'levels') {
      const [name, level, ...note] = fields
      return { name, ...(level && { level }), ...(note.length && { note: note.join(' — ') }), ...item.directive }
    }
    if (type === 'records') {
      const [name, ...restFields] = fields
      const out: Record<string, any> = { name }
      const others: string[] = []
      for (const f of restFields) {
        if (out.dates === undefined && parseDates(strip(f))) out.dates = strip(f)
        else others.push(f)
      }
      if (others[0]) out.issuer = others[0]
      if (others.length > 1) out.note = others.slice(1).join(' — ')
      return { ...out, ...item.directive }
    }
    if (type === 'table') {
      const [name, val, ...desc] = fields
      return { name, ...(val && { value: val }), ...(desc.length && { desc: desc.join(' — ') }) }
    }
    return item.text
  }

  return { value: header || sections.length ? value : null, lines, diagnostics }
}
