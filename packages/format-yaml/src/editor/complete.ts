/**
 * What the editor offers to type for you.
 *
 * The same table lint.js checks against, read forwards. Where the linter waits
 * for a key nothing renders and then underlines it, this offers the keys that
 * do render before the mistake is made — so `SECTIONS` and the key lists beside
 * it are imported rather than copied, and a section type added there turns up
 * here without anything else being touched.
 *
 * Three kinds of thing are offered, and which one depends only on where the
 * cursor is:
 *
 * - a **key**, at the start of a line — the keys the enclosing mapping accepts,
 *   which is a question about the path, not about the text.
 * - a **value**, past a `key:` — but only for the handful of keys with a closed
 *   set of answers. `title`, `level` and `tier` are prose and get nothing.
 * - a **section skeleton**, wherever a new section can start: the whole shape of
 *   an `entries` or a `levels` block, as a snippet with its fields marked.
 *
 * Everything hinges on `spotAt`, which walks the lines above the cursor the way
 * the parser does and says which mapping the cursor's line belongs to. It reads
 * lines through the same `splitLine` as the parser and the tokenizer, so what
 * counts as a key here is what counts as one everywhere else. The document
 * itself is parsed too, for the one thing indentation can't say: which of the
 * seven types the enclosing section is, and therefore what its entries hold.
 */

import { autocompletion, snippetCompletion } from '@codemirror/autocomplete'
import { HEADER_KEYS, ROOT_KEYS, ROW_KEYS, SECTION_KEYS, SECTIONS } from '@vibe-resume/core/schema'
import { parse, splitLine } from '../relaxed-yaml'

const TYPES = Object.keys(SECTIONS)

/**
 * Keys most documents never need. They are offered like any other, but a
 * mapping without one isn't missing anything — so their absence alone doesn't
 * open the list.
 */
const RARE = new Set(['lang'])

const join = (base: string, segment: string | number): string => (base ? `${base}.${segment}` : String(segment))

/**
 * One line for every key the format has, said once. Several of them turn up in
 * more than one place — `name` is a person's, a language's and a repository's —
 * so each line has to hold for every use of it.
 */
const KEY_INFO: Record<string, string> = {
  header: 'Your name, what you do, and how to reach you.',
  sections: 'The body of the CV, in the order it prints.',
  name: 'What this is called.',
  role: 'The line under your name.',
  contact: 'One line each — where you are, a number, some links.',
  lang: 'The language the CV is written in, as a tag — en, de, fr-CA. Screen readers read it in that voice.',
  type: 'Which of the seven kinds of section this is.',
  title: 'The heading, or the entry’s own title.',
  rail: 'Put this section in the sidebar rail, or keep it out of one.',
  paragraphs: 'One paragraph per entry.',
  blocks: 'A group of skills each, with a title and rows.',
  rows: 'A line of skills each.',
  tier: 'A label in front of the row — Expert, Working, Familiar.',
  text: 'The skills on this row.',
  items: 'The entries in this section.',
  subtype: 'Only `earlier`, which folds a run of old roles into one list.',
  org: 'Who it was for, or where it is from — a company, a school.',
  dates: 'The span, written however you like.',
  sub: 'A line of context under the title.',
  sideNote: 'A short note set against the entry.',
  bullets: 'What you did, one line each.',
  stack: 'The tech — comma-separated, or a list.',
  inline: 'Set the items as pills on one line.',
  columns: 'A heading for each column, in order. Leave it out for no header row.',
  level: 'Free text — Native, C2, Professional working.',
  note: 'A short aside.',
  rating: 'The level out of five, for when the words can’t be read as one.',
  issuer: 'Who granted it.',
  value: 'A short figure for the middle column — a star count, a score.',
  desc: 'One line about it.',
}

const BOOLEANS: Array<{ label: string; info: string }> = [
  { label: 'true', info: 'Yes.' },
  { label: 'false', info: 'No — and worth saying when the default is yes.' },
]

/**
 * The keys whose values are a closed set. Everything absent from here is prose,
 * and prose is exactly what this format exists to leave alone.
 */
const VALUES: Record<string, Array<{ label: string; info: string }>> = {
  type: TYPES.map((type) => ({ label: type, info: `Holds \`${SECTIONS[type].holds}\`.` })),
  subtype: [
    { label: 'job', info: 'A role of its own, with dates and bullets.' },
    { label: 'earlier', info: 'A run of older roles, as one titled list with no dates.' },
  ],
  rail: BOOLEANS,
  inline: BOOLEANS,
  rating: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), info: `${n} out of five.` })),
}

/**
 * A whole section, as a snippet.
 *
 * Written with tabs for the relative indentation, which is what CodeMirror's
 * snippets expect: every line after the first is laid out as the indentation of
 * the line the snippet lands on, plus one `indentUnit` per leading tab. Since a
 * `- ` marker is exactly one unit wide, the same template serves both places a
 * section can start — on a `- ` already typed, and on a bare line where the
 * dash has to come along with it.
 *
 * `#{…}` marks a field: the text is inserted as written and Tab steps through
 * the parts worth replacing.
 */
const SKELETONS: Record<string, string[]> = {
  text: ['type: text', '\ttitle: #{Summary}', '\tparagraphs:', '\t\t- #{A sentence or two about what you do.}'],
  groups: [
    'type: groups',
    '\ttitle: #{Core Skills}',
    '\tblocks:',
    '\t\t- title: #{Group}',
    '\t\t\trows:',
    '\t\t\t\t- tier: #{Expert}',
    '\t\t\t\t\ttext: #{The skills on this row}',
  ],
  entries: [
    'type: entries',
    '\ttitle: #{Experience}',
    '\titems:',
    '\t\t- title: #{Role}',
    '\t\t\torg: #{Company}',
    '\t\t\tdates: #{03/2020 – Present}',
    '\t\t\tsub: #{What the company does — where}',
    '\t\t\tbullets:',
    '\t\t\t\t- #{Something you did, and what came of it.}',
    '\t\t\tstack: #{React, Node.js, PostgreSQL}',
  ],
  list: ['type: list', '\ttitle: #{Interests}', '\tinline: true', '\titems:', '\t\t- #{Something}'],
  levels: ['type: levels', '\ttitle: #{Languages}', '\titems:', '\t\t- name: #{English}', '\t\t\tlevel: #{Native}'],
  records: [
    'type: records',
    '\ttitle: #{Certifications}',
    '\titems:',
    '\t\t- name: #{What it certifies}',
    '\t\t\tissuer: #{Who granted it}',
    '\t\t\tdates: #{2023}',
  ],
  table: ['type: table', '\ttitle: #{Open Source}', '\titems:', '\t\t- name: #{repo-name}', '\t\t\tvalue: #{★ 120}', '\t\t\tdesc: #{What it does}'],
}

/**
 * One section type's skeleton, ready to insert.
 *
 * `dash` says whether the marker has to come along: on a bare line about to
 * become an item it does, and on a `- ` already typed it doesn't. Either way
 * every line after the first sits at the same column, since a `- ` is exactly
 * one indent unit wide.
 */
export const sectionSkeleton = (type: string, dash: boolean): string => (dash ? '- ' : '') + SKELETONS[type].join('\n')

/**
 * Where the cursor is, in the document's own terms.
 */
interface Spot {
  /** is the cursor on a key, or past one */
  what: 'key' | 'value'
  /** the mapping the line belongs to — a value's key hangs off it too */
  path: string
  /** the key whose value is being typed */
  key: string | null
  /** the offset a completion replaces from */
  from: number
  /** the line already carries its `:`, so a key needs no second one */
  colon: boolean
  /** the line carries a `- `, so it opens an entry of its own */
  dash: boolean
}

/** A line, taken apart, and where it starts in the document. */
const lineParts = (text: string): Array<import('../relaxed-yaml').LineParts & { text: string; from: number }> => {
  const out: Array<import('../relaxed-yaml').LineParts & { text: string; from: number }> = []
  for (let from = 0; ;) {
    let end = text.indexOf('\n', from)
    if (end < 0) end = text.length
    const src = text.slice(from, end)
    out.push({ ...splitLine(src), text: src, from })
    if (end >= text.length) return out
    from = end + 1
  }
}

/** Whether a line's value is the `|` or `>` that opens a block body. */
const opensBlock = (l: { value: number; text: string }): boolean => l.value >= 0 && /^[|>][-+]?$/.test(l.text.slice(l.value).trim())

/**
 * Where the cursor is, in the document's own terms.
 *
 * The lines above are walked the way the parser walks them — a stack of open
 * mappings and sequences, keyed by the column they sit at — and what comes back
 * is the path of the mapping the cursor's line would join. That is all the
 * schema needs: `sections.2.items.0` says a key here belongs to an entry's
 * key, whatever the text on the line currently reads as.
 *
 * Null means there is nothing to offer at all: inside a comment, inside a `|`
 * body, or out in a line's indentation.
 */
export function spotAt(text: string, pos: number): Spot | null {
  const lines = lineParts(text)
  let n = 0
  while (n + 1 < lines.length && lines[n + 1].from <= pos) n++
  const cur = lines[n]
  const col = pos - cur.from
  if (cur.comment >= 0) return null

  interface StackFrame {
    col: number
    kind: 'map' | 'seq'
    path: string
    count: number
  }
  const stack: StackFrame[] = []
  /** The path a block indented under the last line read would hang from. */
  let opens = ''
  /** Column of the line that opened a `|` or `>` body, or -1. */
  let block = -1

  /**
   * The frame at column `at`, opening one if the column isn't held — or is held
   * by the other kind, which is a list starting where a mapping left off.
   */
  const enter = (at: number, kind: 'map' | 'seq', path: string): StackFrame => {
    while (stack.length > 0 && stack[stack.length - 1].col > at) stack.pop()
    const top = stack[stack.length - 1]
    if (top && top.col === at) {
      if (top.kind === kind) return top
      stack.pop()
    }
    const frame = { col: at, kind, path, count: 0 }
    stack.push(frame)
    return frame
  }

  /**
   * Walk a line's `- ` markers, one sequence level each, and give back the path
   * of the item the last of them opens.
   */
  const items = (p: import('../relaxed-yaml').LineParts, parent: string): string => {
    for (const at of p.dashes) {
      const seq = enter(at, 'seq', parent)
      parent = join(seq.path, seq.count)
      seq.count++
    }
    return parent
  }

  for (let i = 0; i < n; i++) {
    const p = lines[i]
    const blank = p.indent >= p.text.length
    if (block >= 0) {
      if (blank || p.indent > block) continue
      block = -1
    }
    if (blank || p.comment >= 0) continue
    const parent = items(p, opens)
    if (p.key !== null) {
      const map = enter(p.content, 'map', parent)
      if (p.value < 0) opens = join(map.path, p.key)
      else if (opensBlock(p)) block = p.content
    } else if (p.content >= p.text.length) {
      opens = parent // a bare `-`; its item is whatever is indented beneath it
    }
  }

  // A line inside a `|` or `>` body is prose all the way down.
  if (block >= 0 && (cur.indent >= cur.text.length || cur.indent > block)) return null
  if (col < cur.content) return null // still out in the indentation, or between dashes

  const parent = items(cur, opens)
  while (stack.length > 0 && stack[stack.length - 1].col > cur.content) stack.pop()
  const top = stack[stack.length - 1]
  const path = top && top.col === cur.content && top.kind === 'map' ? top.path : parent
  const dash = cur.dashes.length > 0

  if (cur.key !== null && col > cur.colon) {
    // Past the colon. The value starts where the spaces after it end, unless
    // the cursor hasn't got that far yet.
    const from = cur.value >= 0 && cur.value <= col ? cur.from + cur.value : pos
    return { what: 'value', path, key: cur.key, from, colon: true, dash }
  }
  return { what: 'key', path, key: null, from: cur.from + cur.content, colon: cur.key !== null, dash }
}

/**
 * The node a path names, for asking what a section's type is and which keys an
 * entry already carries.
 */
const nodeAt = (path: string, doc: any): any => (path === '' ? doc : path.split('.').reduce((o: any, s: string) => o?.[s], doc))

/**
 * The keys a mapping at `path` accepts, or null when the path names something
 * that isn't a mapping at all — a list of bullets, a paragraph, the inside of a
 * section whose type hasn't been decided yet.
 *
 * A section's own keys depend on its `type`, which is why the parsed document
 * comes in alongside the path: indentation says where the cursor is, but only
 * the text says what kind of section it's in.
 */
export function keysAt(path: string, doc: any): string[] | null {
  const seg = path === '' ? [] : path.split('.')
  if (seg.length === 0) return ROOT_KEYS
  if (seg[0] !== 'sections') return seg.length === 1 && seg[0] === 'header' ? HEADER_KEYS : null
  if (seg.length === 1) return null // the list itself; a section starts with `- `

  const spec = SECTIONS[String(nodeAt(`sections.${seg[1]}`, doc)?.type)]
  // Without a type there is nothing to say about the section's content yet, but
  // `type:` itself is exactly what's missing, so the shared keys still stand.
  if (seg.length === 2) return spec ? [...SECTION_KEYS, spec.holds, ...(spec.extra ?? [])] : SECTION_KEYS
  if (!spec || seg[2] !== spec.holds) return null
  if (seg.length === 4) return spec.item
  // `groups` is the one type with a level below its entries.
  if (seg.length === 6 && seg[4] === 'rows' && spec === SECTIONS.groups) return ROW_KEYS
  return null
}

/**
 * Whether a whole section can be inserted where the cursor is, and whether it
 * has to bring its own `- `.
 *
 * Two spots qualify. A bare line at the column `sections`' items sit at is
 * about to become one, and needs the marker. A line that already carries a `- `
 * there is one — but only while it has no `type:` yet, so a skeleton is never
 * offered from inside a section that already exists.
 */
function skeletonSpot(spot: Spot, doc: any): { dash: boolean } | null {
  if (spot.what !== 'key' || spot.colon) return null
  const m = /^sections(?:\.(\d+))?$/.exec(spot.path)
  if (!m) return null
  if (m[1] === undefined) return { dash: true }
  return spot.dash && !SECTIONS[String(nodeAt(spot.path, doc)?.type)] ? { dash: false } : null
}

/**
 * The completion source: every key, value and skeleton on offer at the cursor.
 */
export function cvComplete(cx: import('@codemirror/autocomplete').CompletionContext): import('@codemirror/autocomplete').CompletionResult | null {
  const text = cx.state.doc.toString()
  const spot = spotAt(text, cx.pos)
  if (!spot) return null

  const doc = parse(text).value
  const keys = keysAt(spot.path, doc)

  const options: import('@codemirror/autocomplete').Completion[] = []

  if (spot.what === 'value') {
    if (!keys?.includes(String(spot.key))) return null
    const values = VALUES[String(spot.key)]
    if (!values) return null
    for (const v of values) options.push({ label: v.label, type: 'enum', info: v.info })
  } else {
    const here = nodeAt(spot.path, doc)
    for (const key of keys ?? []) {
      options.push({
        label: key,
        type: 'property',
        info: KEY_INFO[key],
        // A key the entry already carries stays on offer — it may be the one
        // being retyped — but sinks below the ones still missing, as a rare one does.
        boost: RARE.has(key) || (here && typeof here === 'object' && Object.hasOwn(here, key)) ? -1 : 0,
        apply: spot.colon ? key : `${key}: `,
      })
    }
    const skeleton = skeletonSpot(spot, doc)
    if (skeleton) {
      for (const type of TYPES) {
        options.push(
          snippetCompletion(sectionSkeleton(type, skeleton.dash), {
            label: `${type} section`,
            type: 'class',
            detail: `holds ${SECTIONS[type].holds}`,
            info: `A whole \`${type}\` section, with its fields to step through.`,
          }),
        )
      }
    }
  }

  if (options.length === 0) return null

  // Nothing typed at this spot yet, and nobody pressed Ctrl-Space. A closed set
  // of values still shows: `type: ` on its own is a question, and only six keys
  // have one to answer it with. Keys only show while the mapping is still
  // missing some, so landing in a finished entry doesn't put a list of what it
  // already says on the screen.
  const idle = !cx.explicit && cx.pos === spot.from
  if (idle && spot.what === 'key' && !options.some((o) => (o.boost ?? 0) >= 0)) return null

  return { from: spot.from, options, validFor: /^[\w-]*$/ }
}

/**
 * Whether picking this one should open a second list straight away — which is
 * the case for exactly the keys that were inserted with their `: ` and have a
 * closed set of values behind them. Choosing `type` is really the first half of
 * choosing which type.
 */
export const opensValues = (completion: import('@codemirror/autocomplete').Completion): boolean =>
  completion.apply === `${completion.label}: ` && VALUES[completion.label] !== undefined

/** Completion, wired to the format's own table. */
export function cvCompletion() {
  return autocompletion({ override: [cvComplete], activateOnCompletion: opensValues })
}
