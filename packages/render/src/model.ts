/**
 * A CV as a tree of semantic blocks, already in the order it is read. The
 * sheet (html/CvSheet.svelte) is drawn from this, and the PDF is measured from
 * the sheet.
 *
 * This is the one place that decides what a section *is*: which parts of an
 * entry are its heading, which are paragraphs and which are a list, and what
 * each block variant (variants.ts) does to it. The sheet writes the tree out in order, and the PDF's structure tree is
 * read back from that, so the two can't disagree about what a CV says or in
 * what order.
 *
 * The node kinds are PDF's standard structure types (`Sect`, `H1`–`H3`, `P`,
 * `L`, `LI`, `Div`) plus two of this file's own:
 * - `Row` only says "this, with that out at the right edge", and is read as its
 *   two halves in order. Only a short pair uses it — a language and its level,
 *   a certificate and its date; an entry's dates get a line of their own.
 * - `Meter` is a level drawn as dots or a bar. It is a figure, with the level
 *   in words as its alternative text.
 *
 * Presentation reaches the sheet as a small, fixed set of properties:
 * - `frame` and `keep` on a group
 * - `display` and `marker` on a list
 * - `align` on text
 * - `head` on a section and `style` on the header
 *
 * Everything is set in one column, top to bottom. Nothing is placed beside
 * anything else but a heading's dates, so a PDF parser that reads by position
 * reads the CV in the order it is written.
 *
 * Every node that stands for a source value carries the value's path as `src`,
 * which is what the preview stamps on its elements as `data-src` so the panes
 * can follow each other.
 */

import { formatWhen, isoWhen, parseDates, spokenDates } from '@vibe-resume/core/dates'
import type { When } from '@vibe-resume/core/dates'
import { iconPaths } from './icons'
import { contactRuns, list, runs, techs, textOf } from './inline'
import { resolveVariants } from './variants'

type Run = import('./inline').Run

/**
 * Some runs, set in one role. A text node is one or more of these, so that a
 * single line can mix an entry's title with its organisation.
 * @property {string} role  a key of ROLES in tokens.js
 * @property {Run[]} runs
 * @property {string} [src]
 * @property {string} [actual]  what the span says, for a reader, when what it prints is a styling of that — a date range
 */
export type Span = { role: string; runs: Run[]; src?: string; actual?: string }

export type Text = { kind: 'H1' | 'H2' | 'H3' | 'P'; spans: Span[]; src?: string; align?: 'center' }
export type Meter = { kind: 'Meter'; value: number; style: 'dots' | 'bars'; alt: string; src?: string }
export type Row = { kind: 'Row'; main: Text; aside: Text | Meter }
export type Frame = 'card' | 'stripe' | 'timeline'

export interface List {
  kind: 'L'
  items: Item[]
  display: 'block' | 'inline' | 'chips'
  marker: 'bullet' | 'dot' | 'dash' | 'none'
  src?: string
}
export interface Item {
  kind: 'LI'
  body: Block[]
  src?: string
  icon?: string[] | null
  frame?: Frame
}
/**
 * A group of blocks. `keep` asks the PDF not to split it across a page, as the
 * print CSS asks of the same things.
 */
export type Div = { kind: 'Div'; body: Block[]; keep?: boolean; frame?: Frame; src?: string }
export type Block = Text | Row | List | Div
export interface Section {
  kind: 'Sect'
  type: string
  title: Text | null
  body: Block[]
  src: string
  head: string
  number: number
}
export interface Model {
  lang: string
  header: { style: string; name: Text; role: Text | null; contact: List | null }
  sections: Section[]
}

/** A BCP 47 language tag, near enough: `en`, `de-CH`, `zh-Hant`. */
const LANG = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i

const span = (role: string, value: unknown, src?: string): Span => ({ role, runs: runs(value), src })

const lit = (role: string, text: string): Span => ({ role, runs: [{ text }] })

const text = (kind: Text['kind'], spans: Span[], src?: string): Text => ({ kind, spans: spans.filter((s) => s.runs.length), src })

const empty = (spans: Span[]): boolean => !spans.some((s) => s.runs.length)

function dateSpan(value: unknown, src: string | undefined, style: string): Span {
  const plain = textOf(runs(value))
  const read = parseDates(plain)
  if (!read) return { role: 'dates', runs: runs(value), src }
  const fmt = (w: import('@vibe-resume/core/dates').When | 'present', written: string): string => (style === 'as-written' ? written : formatWhen(w, style))
  const out: Run[] = [{ text: fmt(read.start, read.written.start), datetime: isoWhen(read.start) }]
  if (read.end) {
    const end = { text: fmt(read.end, read.written.end) }
    // An en dash is closed up between single-word ends (`2010–2014`) and
    // spaced only where an end has a space of its own (`Mar 2020 – Present`).
    const spaced = /\s/.test(out[0].text + end.text)
    out.push({ text: style === 'as-written' ? read.written.sep : spaced ? ' – ' : '–' })
    out.push(read.end === 'present' ? end : { ...end, datetime: isoWhen(read.end) })
  }
  return { role: 'dates', runs: out, src, actual: spokenDates(read) }
}

export interface Context {
  v: Record<string, string>
}

export function buildModel(cv: any, look: { variants?: Record<string, string> } = {}): Model {
  const v = resolveVariants(look.variants)
  const h = cv?.header && typeof cv.header === 'object' ? cv.header : {}
  const centred = v.header === 'centered' || v.header === 'banner'

  const name = text('H1', [span(v.header === 'banner' ? 'nameBanner' : 'name', h.name, 'header.name')], 'header.name')
  const role = h.role ? text('P', [span('role', h.role, 'header.role')], 'header.role') : null
  if (centred) {
    name.align = 'center'
    if (role) role.align = 'center'
  }

  const contact = list(h.contact)
  const header = {
    style: v.header,
    name,
    role,
    contact: contact.length
      ? ({
          kind: 'L' as const,
          display: 'inline' as const,
          marker: 'none' as const,
          items: contact.map((line, i) => ({
            kind: 'LI' as const,
            src: `header.contact.${i}`,
            body: [text('P', [{ role: 'contact', runs: contactRuns(line) }])],
          })),
        } as List)
      : null,
  }

  let number = 0
  const sections = list(cv?.sections)
    .map((sec, i) => ({ sec, path: `sections.${i}` }))
    .filter((e) => e.sec && typeof e.sec === 'object')
    .map((e) => section(e.sec, e.path, { v }, ++number))

  const lang = typeof h.lang === 'string' && LANG.test(h.lang.trim()) ? h.lang.trim() : 'en'
  return { lang, header, sections }
}

function section(sec: any, path: string, ctx: Context, number: number): Section {
  const title = sec.title ? text('H2', [span('secTitle', sec.title, `${path}.title`)], `${path}.title`) : null
  return { kind: 'Sect', type: String(sec.type ?? ''), title, body: body(sec, path, ctx), src: path, head: ctx.v.sectionHead, number }
}

function body(sec: any, path: string, ctx: Context): Block[] {
  switch (sec.type) {
    case 'text':
      return summary(sec, path, ctx)
    case 'groups':
      return skills(sec, path, ctx)
    case 'entries':
      return list(sec.items).map((item, i) => entry(item, `${path}.items.${i}`, ctx))
    case 'list':
      return [plainList(sec, path, ctx)]
    case 'levels':
      return [levels(sec, path, ctx)]
    case 'records':
      return [records(sec, path, ctx)]
    case 'table':
      // A grid table is the one thing here a PDF reader is worst at, and on a
      // CV it only ever holds a name, a figure and a line about it. So it is
      // read as what it is: a list of those three.
      return [
        {
          kind: 'L',
          display: 'block',
          marker: 'none',
          items: list(sec.items).map((item, i) => {
            const at = `${path}.items.${i}`
            const spans = [span('itemName', item?.name, `${at}.name`)]
            if (item?.value) spans.push(lit('level', '  '), span('level', item.value, `${at}.value`))
            if (item?.desc) spans.push(lit('meta', ' — '), span('meta', item.desc, `${at}.desc`))
            return { kind: 'LI', src: at, body: [text('P', spans)] }
          }),
        },
      ]
    default:
      return [text('P', [lit('error', `Unknown section type: ${sec.type ?? '(none)'}`)], `${path}.type`)]
  }
}

function summary(sec: any, path: string, ctx: Context): Block[] {
  return list(sec.paragraphs).map((p, i) => {
    const node = text('P', [span(ctx.v.summary === 'lede' && i === 0 ? 'lede' : 'body', p)], `${path}.paragraphs.${i}`)
    if (ctx.v.summary === 'centered') node.align = 'center'
    return node
  })
}

function skills(sec: any, path: string, ctx: Context): Block[] {
  const variant = ctx.v.skills
  const groups = list(sec.blocks).map((b, i) => ({ b, at: `${path}.blocks.${i}` }))

  if (variant === 'inline') {
    return groups.map(({ b, at }) => {
      const spans: Span[] = [span('blockTitle', b?.title, `${at}.title`)]
      list(b?.rows).forEach((r, j) => {
        spans.push(lit('row', j === 0 ? ': ' : ' · '))
        if (r?.tier) spans.push(span('tier', r.tier), lit('row', ' '))
        spans.push(span('row', r?.text, `${at}.rows.${j}`))
      })
      return text('P', spans, at)
    })
  }

  return groups.map(({ b, at }) => {
    const title = text('H3', [span('blockTitle', b?.title)], `${at}.title`)
    const rest: Block[] =
      variant === 'chips'
        ? [
            chips(
              list(b?.rows).flatMap((r) => techs(r?.text)),
              `${at}.rows`,
              'tag',
            ),
          ]
        : list(b?.rows).map((r, j) =>
            text('P', r?.tier ? [span('tier', r.tier), lit('row', ' · '), span('row', r.text)] : [span('row', r?.text)], `${at}.rows.${j}`),
          )
    const div: Div = { kind: 'Div', keep: true, src: at, body: title.spans.length ? [title, ...rest] : rest }
    if (variant === 'cards') div.frame = 'card'
    return div
  })
}

function chips(items: unknown[], src: string, role: string, icons = true): List {
  return {
    kind: 'L',
    display: 'chips',
    marker: 'none',
    src,
    items: items.map((t) => ({ kind: 'LI', icon: icons ? iconPaths(textOf(runs(t))) : null, body: [text('P', [span(role, t)])] })),
  }
}

function plainList(sec: any, path: string, ctx: Context): List {
  const variant = ctx.v.list
  const items = list(sec.items)
  if (sec.inline && (variant === 'pills' || variant === 'chips')) {
    const l = chips(items, path, 'tag', variant === 'chips')
    l.items.forEach((item, i) => (item.src = `${path}.items.${i}`))
    return l
  }
  return {
    kind: 'L',
    display: 'block',
    marker: 'bullet',
    items: items.map((item, i) => ({ kind: 'LI', src: `${path}.items.${i}`, body: [text('P', [span('bullet', item)])] })),
  }
}

function levels(sec: any, path: string, ctx: Context): List {
  const variant = ctx.v.languages
  const pills = variant === 'pills'
  return {
    kind: 'L',
    display: pills ? 'chips' : 'block',
    marker: 'none',
    items: list(sec.items).map((item, i) => {
      const at = `${path}.items.${i}`
      const name = [span('itemName', item?.name, `${at}.name`)]
      if (item?.note) name.push(lit('note', ' '), span('note', item.note, `${at}.note`))
      const level = text('P', [span('level', item?.level, `${at}.level`)])
      if (pills) {
        if (level.spans.length) name.push(lit('note', ' '), ...level.spans)
        return { kind: 'LI', src: at, icon: null, body: [text('P', name)] }
      }
      const rating = levelRating(item)
      const aside: Text | Meter =
        (variant === 'dots' || variant === 'bars') && rating
          ? {
              kind: 'Meter',
              value: rating,
              style: variant,
              alt: `${textOf(level.spans.flatMap((s) => s.runs)) || 'Level'}: ${rating} of 5`,
              src: `${at}.level`,
            }
          : level
      return { kind: 'LI', src: at, body: [row(text('P', name), aside)] }
    }),
  }
}

function records(sec: any, path: string, ctx: Context): List {
  const variant = ctx.v.certifications
  return {
    kind: 'L',
    display: 'block',
    marker: 'none',
    items: list(sec.items).map((item, i) => {
      const at = `${path}.items.${i}`
      const name = span('itemName', item?.name ?? item?.title, `${at}.name`)
      const dates = text('P', [dateSpan(item?.dates, `${at}.dates`, ctx.v.dates)])
      const meta = [span('issuer', item?.issuer, `${at}.issuer`)]
      if (item?.issuer && item?.note) meta.push(lit('meta', ' · '))
      meta.push(span('meta', item?.note, `${at}.note`))

      let blocks: Block[]
      if (variant === 'compact') {
        const line = [name]
        if (!empty(meta)) line.push(lit('meta', ' · '), ...meta)
        blocks = [row(text('P', line), dates)]
      } else {
        blocks = [row(text('P', [name]), dates), ...(empty(meta) ? [] : [text('P', meta)])]
      }
      const out: Item = { kind: 'LI', src: at, body: blocks }
      if (variant === 'cards') out.frame = 'card'
      return out
    }),
  }
}

const row = (main: Text, aside: Text | Meter): Block => (aside.kind === 'Meter' || aside.spans.length ? { kind: 'Row', main, aside } : main)

const ENTRY_FRAMES: Record<string, Frame> = { timeline: 'timeline', card: 'card', stripe: 'stripe' }

function entry(item: any, at: string, ctx: Context): Div {
  const variant = ctx.v.entry
  const frame = ENTRY_FRAMES[variant]

  if (item?.subtype === 'earlier') {
    const earlier: Div = {
      kind: 'Div',
      src: at,
      body: [
        text('H3', [span('entryTitle', item.title)], `${at}.title`),
        {
          kind: 'L',
          display: 'block',
          marker: variant === 'minimal' ? 'dash' : 'dot',
          items: list(item.items).map((line, j) => bulletItem(line, `${at}.items.${j}`)),
        },
      ],
    }
    if (frame) earlier.frame = frame
    return earlier
  }

  // Read top to bottom, the way a parser reads it: who and what, then when and
  // where, then what was done, then with what. Nothing is set out at the right
  // edge, so no line of the PDF holds two things a parser has to pull apart.
  const head: Span[] = []
  if (item?.org) head.push(span('org', item.org, `${at}.org`), lit('org', ' — '))
  head.push(span('entryTitle', item?.title, `${at}.title`))
  if (item?.sideNote) head.push(lit('aside', ' '), span('aside', item.sideNote, `${at}.sideNote`))
  const blocks: Block[] = [text('H3', head, `${at}.title`)]

  const when = dateSpan(item?.dates, `${at}.dates`, ctx.v.dates)
  const meta: Span[] = when.runs.length ? [when] : []
  if (item?.sub) {
    if (meta.length) meta.push(lit('sub', ' · '))
    meta.push(span('sub', item.sub, `${at}.sub`))
  }
  if (meta.length) blocks.push(text('P', meta, when.runs.length ? `${at}.dates` : `${at}.sub`))
  const bullets = list(item?.bullets)
  if (bullets.length) {
    blocks.push({
      kind: 'L',
      display: 'block',
      marker: variant === 'minimal' ? 'dash' : 'bullet',
      items: bullets.map((b, j) => bulletItem(b, `${at}.bullets.${j}`)),
    })
  }
  const tools = techs(item?.stack)
  if (tools.length && ctx.v.stack !== 'none') {
    if (ctx.v.stack === 'chips') blocks.push(chips(tools, `${at}.stack`, 'stack'))
    else {
      const line = span('stack', tools.join(', '))
      blocks.push(text('P', ctx.v.stack === 'plain' ? [line] : [lit('stackLabel', 'Stack: '), line], `${at}.stack`))
    }
  }

  const div: Div = { kind: 'Div', keep: true, src: at, body: blocks }
  if (frame) div.frame = frame
  return div
}

const bulletItem = (value: unknown, src: string): Item => ({ kind: 'LI', src, body: [text('P', [span('bullet', value)])] })

export function levelRating(item: any): number {
  const rating = Number(item?.rating)
  if (Number.isFinite(rating) && rating > 0) return Math.min(5, Math.round(rating))

  const level = String(item?.level ?? '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '')
  if (!level) return 0
  for (const [score, words] of LEVELS) {
    if (words.some((w) => level.startsWith(w))) return score
  }
  return 0
}

const LEVELS: [number, string[]][] = [
  [5, ['native', 'bilingual', 'mothertongue', 'c2', 'fluent', 'expert', '5']],
  [4, ['c1', 'advanced', 'professional', 'proficient', 'business', '4']],
  [3, ['b2', 'upperintermediate', 'intermediate', 'conversational', 'working', '3']],
  [2, ['b1', 'preintermediate', 'limited', 'basic', 'elementary', '2']],
  [1, ['a2', 'a1', 'beginner', 'novice', 'starter', '1']],
]
