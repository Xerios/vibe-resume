/**
 * A CV as a tree of semantic blocks, already in the order it is read. The
 * sheet (html/CvSheet.svelte) is drawn from this, and the PDF is measured from
 * the sheet.
 *
 * This is the one place that decides what a section *is*: which parts of an
 * entry are its heading, which are paragraphs and which are a list, which
 * column a section lands in, and what each block variant (variants.js) does to
 * it. The sheet writes the tree out in order, and the PDF's structure tree is
 * read back from that, so the two can't disagree about what a CV says or in
 * what order.
 *
 * The node kinds are PDF's standard structure types (`Sect`, `H1`–`H3`, `P`,
 * `L`, `LI`, `Div`) plus two of this file's own:
 * - `Row` only says "this, with that out at the right edge", and is read as its
 *   two halves in order.
 * - `Meter` is a level drawn as dots or a bar. It is a figure, with the level
 *   in words as its alternative text.
 *
 * Presentation reaches the sheet as a small, fixed set of properties:
 * - `frame` and `keep` on a group
 * - `display`, `marker` and `cols` on a list
 * - `align` on text
 * - `head` on a section and `style` on the header
 *
 * Every node that stands for a YAML value carries the value's path as `src`,
 * which is what the preview stamps on its elements as `data-src` so the panes
 * can follow each other.
 */

import { iconPaths } from './icons.js'
import { contactRuns, list, runs, techs, textOf } from './inline.js'
import { layoutOf } from './tokens.js'
import { resolveVariants } from './variants.js'

/** @typedef {import('./inline.js').Run} Run */

/**
 * Some runs, set in one role. A text node is one or more of these, so that a
 * single line can mix an entry's title with its organisation.
 * @typedef {object} Span
 * @property {string} role  a key of ROLES in tokens.js
 * @property {Run[]} runs
 * @property {string} [src]
 */

/** @typedef {{ kind: 'H1' | 'H2' | 'H3' | 'P', spans: Span[], src?: string, align?: 'center' }} Text */
/** @typedef {{ kind: 'Meter', value: number, style: 'dots' | 'bars', alt: string, src?: string }} Meter */
/** @typedef {{ kind: 'Row', main: Text, aside: Text | Meter, badge?: boolean }} Row */
/**
 * Decoration around a group or a list item:
 * an outlined `card`, a thick accent `stripe` down the left, a `timeline` rail
 * with a dot, or a short `rule` above.
 * @typedef {'card' | 'stripe' | 'timeline' | 'rule'} Frame
 */
/**
 * @typedef {object} List
 * @property {'L'} kind
 * @property {Item[]} items
 * @property {'block' | 'inline' | 'chips'} display  one under another, run on between separators, or outlined chips
 * @property {'bullet' | 'dot' | 'dash' | 'none'} marker  drawn as decoration, never as text
 * @property {number} [cols]  a block list set in a grid this many across
 * @property {string} [src]
 */
/**
 * @typedef {object} Item
 * @property {'LI'} kind
 * @property {Block[]} body
 * @property {string} [src]
 * @property {string[] | null} [icon]  a chip's logo, as 24×24 SVG path data
 * @property {Frame} [frame]
 */
/**
 * A group of blocks. `cols` sets its children in a grid; `keep` asks the PDF not
 * to split it across a page, as the print CSS asks of the same things; `gutter`
 * sets its two children side by side, the first in a narrow column at the left.
 * @typedef {{ kind: 'Div', body: Block[], cols?: number, keep?: boolean, frame?: Frame, gutter?: boolean, src?: string }} Div
 */
/** @typedef {Text | Row | List | Div} Block */
/**
 * @typedef {object} Section
 * @property {'Sect'} kind
 * @property {string} type
 * @property {Text | null} title
 * @property {Block[]} body
 * @property {string} src
 * @property {string} head    the section-title variant
 * @property {number} number  its place in reading order, from 1, for the numbered titles
 */
/** @typedef {{ id: 'main' | 'rail', sections: Section[] }} Column */

/**
 * @typedef {object} Model
 * @property {string} layout  a LAYOUTS id
 * @property {'left' | 'right' | null} railSide
 * @property {string} lang
 * @property {{ style: string, name: Text, role: Text | null, contact: List | null }} header
 * @property {Column[]} columns  in reading order
 */

/** What goes to the rail unless the section says otherwise with `rail:`. */
const RAIL_TYPES = new Set(['groups', 'list', 'levels'])

/**
 * @param {string} role
 * @param {unknown} value
 * @param {string} [src]
 * @returns {Span}
 */
const span = (role, value, src) => ({ role, runs: runs(value), src })

/** @param {string} role @param {string} text @returns {Span} */
const lit = (role, text) => ({ role, runs: [{ text }] })

/**
 * @param {Text['kind']} kind
 * @param {Span[]} spans
 * @param {string} [src]
 * @returns {Text}
 */
const text = (kind, spans, src) => ({ kind, spans: spans.filter((s) => s.runs.length), src })

/** @param {Span[]} spans */
const empty = (spans) => !spans.some((s) => s.runs.length)

/**
 * @typedef {object} Context
 * @property {boolean} rail  in the rail, where nothing is set more than one-up
 * @property {Record<string, string>} v  the block variant chosen for each slot
 */

/**
 * @param {any} cv  the parsed document; anything half-typed is tolerated
 * @param {{ layout?: string, variants?: Record<string, string> }} [look]
 * @returns {Model}
 */
export function buildModel(cv, look = {}) {
  const layout = layoutOf(look.layout)
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
      ? /** @type {List} */ ({
          kind: 'L',
          display: v.header === 'split' ? 'block' : 'inline',
          marker: 'none',
          items: contact.map((line, i) => ({
            kind: 'LI',
            src: `header.contact.${i}`,
            body: [text('P', [{ role: 'contact', runs: contactRuns(line) }])],
          })),
        })
      : null,
  }

  const all = list(cv?.sections)
    .map((sec, i) => ({ sec, path: `sections.${i}` }))
    .filter((e) => e.sec && typeof e.sec === 'object')

  const inRail = (/** @type {any} */ sec) => layout.railSide !== null && (sec.rail ?? RAIL_TYPES.has(sec.type))

  let number = 0
  /** @type {Column[]} */
  const columns = layout.columns.map((id) => {
    const rail = id === 'rail'
    return {
      id,
      sections: all.filter((e) => (layout.railSide === null ? true : inRail(e.sec) === rail)).map((e) => section(e.sec, e.path, { rail, v }, ++number)),
    }
  })

  return { layout: layout.id, railSide: layout.railSide, lang: 'en', header, columns }
}

/**
 * One section, as the blocks its type comes to.
 * @param {any} sec
 * @param {string} path
 * @param {Context} ctx
 * @param {number} number
 * @returns {Section}
 */
function section(sec, path, ctx, number) {
  const title = sec.title ? text('H2', [span('secTitle', sec.title, `${path}.title`)], `${path}.title`) : null
  return { kind: 'Sect', type: String(sec.type ?? ''), title, body: body(sec, path, ctx), src: path, head: ctx.v.sectionHead, number }
}

/**
 * @param {any} sec
 * @param {string} path
 * @param {Context} ctx
 * @returns {Block[]}
 */
function body(sec, path, ctx) {
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
            return /** @type {Item} */ ({ kind: 'LI', src: at, body: [text('P', spans)] })
          }),
        },
      ]
    default:
      return [text('P', [lit('error', `Unknown section type: ${sec.type ?? '(none)'}`)], `${path}.type`)]
  }
}

/**
 * @param {any} sec
 * @param {string} path
 * @param {Context} ctx
 * @returns {Block[]}
 */
function summary(sec, path, ctx) {
  return list(sec.paragraphs).map((p, i) => {
    const node = text('P', [span(ctx.v.summary === 'lede' && i === 0 ? 'lede' : 'body', p)], `${path}.paragraphs.${i}`)
    if (ctx.v.summary === 'centered') node.align = 'center'
    return node
  })
}

/**
 * A `groups` section: a grid of skill groups, each a title over its rows, or
 * one of the variants on that.
 * @param {any} sec
 * @param {string} path
 * @param {Context} ctx
 * @returns {Block[]}
 */
function skills(sec, path, ctx) {
  const variant = ctx.v.skills
  const groups = list(sec.blocks).map((b, i) => ({ b, at: `${path}.blocks.${i}` }))
  const cols = ctx.rail ? 1 : variant === 'three-col' ? 3 : variant === 'two-col' || variant === 'cards' || variant === 'chips' ? 2 : 1

  if (variant === 'inline') {
    return groups.map(({ b, at }) => {
      /** @type {Span[]} */
      const spans = [span('blockTitle', b?.title, `${at}.title`)]
      list(b?.rows).forEach((r, j) => {
        spans.push(lit('row', j === 0 ? ': ' : ' · '))
        if (r?.tier) spans.push(span('tier', r.tier), lit('row', ' '))
        spans.push(span('row', r?.text, `${at}.rows.${j}`))
      })
      return text('P', spans, at)
    })
  }

  const blocks = groups.map(({ b, at }) => {
    const title = text('H3', [span('blockTitle', b?.title)], `${at}.title`)
    /** @type {Block[]} */
    const rest =
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
    // Hung in a gutter, the title is one column and its rows are the other.
    const gutter = variant === 'rows' && !ctx.rail && title.spans.length > 0
    /** @type {Div} */
    const div = { kind: 'Div', keep: true, src: at, body: gutter ? [title, { kind: 'Div', body: rest }] : title.spans.length ? [title, ...rest] : rest }
    if (variant === 'cards') div.frame = 'card'
    if (gutter) div.gutter = true
    return div
  })
  return [{ kind: 'Div', cols, body: blocks }]
}

/**
 * Tools or items as chips, each with its logo when it has one.
 * @param {unknown[]} items
 * @param {string} src
 * @param {string} role
 * @param {boolean} [icons]
 * @returns {List}
 */
function chips(items, src, role, icons = true) {
  return {
    kind: 'L',
    display: 'chips',
    marker: 'none',
    src,
    items: items.map((t) => ({ kind: 'LI', icon: icons ? iconPaths(textOf(runs(t))) : null, body: [text('P', [span(role, t)])] })),
  }
}

/**
 * A `list` section. An inline list follows the list variant; a plain one is
 * bullets, two-up when the variant asks for columns.
 * @param {any} sec
 * @param {string} path
 * @param {Context} ctx
 * @returns {List}
 */
function plainList(sec, path, ctx) {
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
    ...(variant === 'columns' && !ctx.rail ? { cols: 2 } : {}),
    items: items.map((item, i) => ({ kind: 'LI', src: `${path}.items.${i}`, body: [text('P', [span('bullet', item)])] })),
  }
}

/**
 * A `levels` section: a name and how well, as a row, a pill or a meter.
 * @param {any} sec
 * @param {string} path
 * @param {Context} ctx
 * @returns {List}
 */
function levels(sec, path, ctx) {
  const variant = ctx.v.languages
  const pills = variant === 'pills'
  return {
    kind: 'L',
    display: pills ? 'chips' : 'block',
    marker: 'none',
    ...(pills || ctx.rail ? {} : { cols: 2 }),
    items: list(sec.items).map((item, i) => {
      const at = `${path}.items.${i}`
      const name = [span('itemName', item?.name, `${at}.name`)]
      if (item?.note) name.push(lit('note', ' '), span('note', item.note, `${at}.note`))
      const level = text('P', [span('level', item?.level, `${at}.level`)])
      if (pills) {
        if (level.spans.length) name.push(lit('note', ' '), ...level.spans)
        return /** @type {Item} */ ({ kind: 'LI', src: at, icon: null, body: [text('P', name)] })
      }
      const rating = levelRating(item)
      /** @type {Text | Meter} */
      const aside =
        (variant === 'dots' || variant === 'bars') && rating
          ? {
              kind: 'Meter',
              value: rating,
              style: variant,
              alt: `${textOf(level.spans.flatMap((s) => s.runs)) || 'Level'}: ${rating} of 5`,
              src: `${at}.level`,
            }
          : level
      return /** @type {Item} */ ({ kind: 'LI', src: at, body: [row(text('P', name), aside)] })
    }),
  }
}

/**
 * A `records` section: what was awarded, who issued it, and when.
 * @param {any} sec
 * @param {string} path
 * @param {Context} ctx
 * @returns {List}
 */
function records(sec, path, ctx) {
  const variant = ctx.v.certifications
  return {
    kind: 'L',
    display: 'block',
    marker: 'none',
    ...(variant === 'grid' && !ctx.rail ? { cols: 2 } : {}),
    items: list(sec.items).map((item, i) => {
      const at = `${path}.items.${i}`
      const name = span('itemName', item?.name ?? item?.title, `${at}.name`)
      const dates = text('P', [span('dates', item?.dates, `${at}.dates`)])
      const meta = [span('issuer', item?.issuer, `${at}.issuer`)]
      if (item?.issuer && item?.note) meta.push(lit('meta', ' · '))
      meta.push(span('meta', item?.note, `${at}.note`))

      /** @type {Block[]} */
      let blocks
      if (variant === 'compact') {
        const line = [name]
        if (!empty(meta)) line.push(lit('meta', ' · '), ...meta)
        blocks = [row(text('P', line), dates)]
      } else if (variant === 'grid') {
        blocks = [text('P', [name]), ...(empty(meta) ? [] : [text('P', meta)]), ...(dates.spans.length ? [dates] : [])]
      } else {
        blocks = [row(text('P', [name]), dates), ...(empty(meta) ? [] : [text('P', meta)])]
      }
      /** @type {Item} */
      const out = { kind: 'LI', src: at, body: blocks }
      if (variant === 'grid') out.frame = 'rule'
      if (variant === 'cards') out.frame = 'card'
      return out
    }),
  }
}

/**
 * @param {Text} main
 * @param {Text | Meter} aside
 * @returns {Block}
 */
const row = (main, aside) => (aside.kind === 'Meter' || aside.spans.length ? { kind: 'Row', main, aside } : main)

/** @type {Record<string, Frame>} */
const ENTRY_FRAMES = { timeline: 'timeline', card: 'card', stripe: 'stripe' }

/**
 * One role, degree or project, or a run of earlier roles.
 * @param {any} item
 * @param {string} at
 * @param {Context} ctx
 * @returns {Div}
 */
function entry(item, at, ctx) {
  const variant = ctx.v.entry
  const frame = ENTRY_FRAMES[variant]

  if (item?.subtype === 'earlier') {
    /** @type {Div} */
    const earlier = {
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

  const head = [span('entryTitle', item?.title, `${at}.title`)]
  if (item?.org) head.push(lit('org', ' | '), span('org', item.org, `${at}.org`))
  if (item?.sideNote) head.push(lit('aside', ' '), span('aside', item.sideNote, `${at}.sideNote`))

  const headRow = row(text('H3', head, `${at}.title`), text('P', [span('dates', item?.dates)], `${at}.dates`))
  if (variant === 'badge' && headRow.kind === 'Row') headRow.badge = true

  /** @type {Block[]} */
  const blocks = [headRow]
  if (item?.sub) blocks.push(text('P', [span('sub', item.sub)], `${at}.sub`))
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
      const line = span('stack', tools.join(' · '))
      blocks.push(text('P', ctx.v.stack === 'plain' ? [line] : [lit('stackLabel', 'STACK'), lit('stack', ' · '), line], `${at}.stack`))
    }
  }

  /** @type {Div} */
  const div = { kind: 'Div', keep: true, src: at, body: blocks }
  if (frame) div.frame = frame
  return div
}

/** @param {unknown} value @param {string} src @returns {Item} */
const bulletItem = (value, src) => ({ kind: 'LI', src, body: [text('P', [span('bullet', value)])] })

/**
 * How strong a language is, on a scale of five, or 0 when nothing said.
 *
 * A CV writes this either as a number (`rating: 4`) or as a word, and the words
 * are two vocabularies at once — the CEFR letters and the ones people actually
 * write. Both are read here, so `Native`, `C2`, `Fluent` and `5` all fill the
 * same five dots and an unrecognised level fills none, which is the signal to
 * print the words instead of a meter.
 *
 * @param {any} item  a `levels` entry — `{ name, level?, rating? }`
 * @returns {number} 0–5
 */
export function levelRating(item) {
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

/**
 * Strongest first, so that `nativeorbilingual` is read as native rather than
 * stopping at the `b` levels, and matched on the start of the level so that
 * `C1 — professional` lands with `C1`.
 * @type {[number, string[]][]}
 */
const LEVELS = [
  [5, ['native', 'bilingual', 'mothertongue', 'c2', 'fluent', 'expert', '5']],
  [4, ['c1', 'advanced', 'professional', 'proficient', 'business', '4']],
  [3, ['b2', 'upperintermediate', 'intermediate', 'conversational', 'working', '3']],
  [2, ['b1', 'preintermediate', 'limited', 'basic', 'elementary', '2']],
  [1, ['a2', 'a1', 'beginner', 'novice', 'starter', '1']],
]
